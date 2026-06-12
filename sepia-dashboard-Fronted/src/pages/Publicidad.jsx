import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import KPI from "../components/KPI";
import { fCurrency, fNumber } from "../utils";
import { getAdsMetrics, getAdsDiagnose, getStatus, redirectToMercadoLibreAuth } from "../api";

export default function Publicidad() {
  const { filteredAll } = useOutletContext();
  
  const [adsData, setAdsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAds = async () => {
      setLoading(true);
      setError(null);
      try {
        // Primero verificar si MeLi está conectado (igual que Ordenes/Inventario)
        const status = await getStatus();
        if (!status.conectado) {
          if (!cancelled) {
            setError("No conectado a Mercado Libre. Conecta tu cuenta primero.");
            setLoading(false);
          }
          return;
        }
        const payload = await getAdsMetrics();
        if (!cancelled) {
          setAdsData(payload);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Error cargando métricas de publicidad.");
          setLoading(false);
        }
      }
    };
    fetchAds();
    return () => { cancelled = true; };
  }, []);

  const storeRevenue = useMemo(() => {
    // Calculamos el Revenue total del Outlet (PostgreSQL db)
    return filteredAll.reduce((sum, order) => sum + (order.amount || 0), 0);
  }, [filteredAll]);

  // KPIs Extraídos desde Ads Service (API v2 incluye métricas en summary)
  const totalSpend = adsData?.summary?.spend || 0;
  const adsRevenue = adsData?.summary?.revenue || 0;
  const totalClicks = adsData?.summary?.clicks || adsData?.campaigns?.reduce((sum, camp) => sum + (camp.clicks || 0), 0) || 0;

  // ROAS Global de la Tienda (Todas las Ventas vs Gasto Publicitario)
  const globalRoas = totalSpend > 0 ? (storeRevenue / totalSpend) : 0;
  const cpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;

  const kpis = [
    { stripeClass: "stripe-b", label: "Inversión (Ad Spend)", value: fCurrency(totalSpend), delta: 0 },
    { stripeClass: "stripe-a", label: "Ventas Impulsadas (ML)", value: fCurrency(adsRevenue), delta: 0 },
    { stripeClass: "stripe-c", label: "ROAS de la Tienda", value: `${fNumber(globalRoas)}x`, delta: 0 },
    { stripeClass: "stripe-d", label: "Costo Por Clic (CPC)", value: fCurrency(cpc), delta: 0 },
    { stripeClass: "stripe-e", label: "Clics Totales", value: fNumber(totalClicks), delta: 0 },
  ];

  // Aplanar todos los anuncios activos (Publications) de todas las campanas
  const allAds = useMemo(() => {
    if (!adsData?.campaigns) return [];
    
    // Convert multiple nested publications lists into one big flat array
    return adsData.campaigns.flatMap(camp => {
      return (camp.publications || []).map(ad => ({
         ...ad,
         campaignName: camp.name,
      }));
    }).sort((a, b) => b.spend - a.spend); 
  }, [adsData]);

  const handleConnectMeli = () => {
    redirectToMercadoLibreAuth();
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    setDiagResult(null);
    try {
      const result = await getAdsDiagnose();
      setDiagResult(result);
    } catch (err) {
      setDiagResult({ ok: false, error: err.message });
    } finally {
      setDiagnosing(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <p>Sincronizando pauta publicitaria con Mercado Ads...</p>
      </div>
    );
  }

  if (error) {
    const isAuthError = error.includes("sesión") || error.includes("autentica") || error.includes("permisos") || error.includes("caducó");
    return (
      <div className="empty-state error">
        <h3>Alerta Publicitaria</h3>
        <p>{error}</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "1rem", flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} className="btn btn-secondary">Reintentar</button>
            <button
                type="button"
                onClick={handleDiagnose}
                className="btn btn-secondary"
                disabled={diagnosing}
            >
                {diagnosing ? "Diagnosticando..." : "Diagnosticar conexión"}
            </button>
            {isAuthError && (
                <button
                    type="button"
                    onClick={handleConnectMeli}
                    style={{
                        padding: "10px 24px",
                        fontSize: "0.95rem",
                        background: "var(--accent-a, #ffe600)",
                        color: "var(--bg, #1a1a2e)",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: 600,
                    }}
                >
                    Conectar con Mercado Libre
                </button>
            )}
        </div>
        {diagResult && (
          <div style={{ marginTop: "1rem", textAlign: "left", background: "var(--surface, #1e1e3a)", padding: "1rem", borderRadius: "8px", fontSize: "0.85rem", maxWidth: "600px", margin: "1rem auto 0" }}>
            <strong>Resultado del diagnóstico:</strong>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "0.5rem 0 0", color: "var(--text-muted, #aaa)" }}>
              {JSON.stringify(diagResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <section className="kpi-grid">
        {kpis.map((k) => <KPI key={k.label} {...k} />)}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <header className="panel-head">
            <h2>Campañas Activas</h2>
            <span>{adsData?.campaigns?.length || 0} campañas</span>
          </header>
          {adsData?.campaigns?.length ? (
            <div className="category-list">
              {adsData.campaigns.map((camp) => (
                <div key={camp.id} className="category-item">
                  <div className="category-label-row">
                    <span>{camp.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>Inv: {fCurrency(camp.spend)}</span>
                  </div>
                  <div className="category-track">
                    {/* Visual bar sizing dynamically compared to max spend across campaigns */}
                    <div className="category-fill" style={{ width: `${Math.max((camp.spend / (totalSpend||1)) * 100, 5)}%`, backgroundColor: "var(--accent)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
             <div className="empty-state">No tienes campañas configuradas o están inactivas en el mes actual.</div>
          )}
        </article>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Rendimiento por Publicación</h2>
          <span>Impresiones y Costo de Anuncios</span>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Producto (Item ID)</th>
                <th>Estado</th>
                <th>Impresiones</th>
                <th>Clics</th>
                <th>Invertido</th>
              </tr>
            </thead>
            <tbody>
              {allAds.length > 0 ? (
                allAds.map((ad, i) => (
                  <tr key={`${ad.id}-${i}`}>
                     <td>{ad.campaignName}</td>
                     <td><a href={`https://articulo.mercadolibre.com.co/${ad.item_id}`} target="_blank" rel="noopener noreferrer" style={{color: "var(--primary)"}}>{ad.item_id}</a></td>
                     <td><span className={`pill ${ad.status === 'active' ? "success" : "neutral"}`}>{ad.status}</span></td>
                     <td>{fNumber(ad.impressions)}</td>
                     <td>{fNumber(ad.clicks)}</td>
                     <td>{fCurrency(ad.spend)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                   <td colSpan="6" className="table-empty">No hay datos de productos individuales en este momento.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
