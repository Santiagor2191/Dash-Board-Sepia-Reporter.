import { useEffect, useMemo, useRef, useState } from "react";
import { getSeoTitulos, getStatus, redirectToMercadoLibreAuth } from "../api";
import { fNumber } from "../utils";
import TallerTitulo from "../components/TallerTitulo";

const DIAGNOSIS_LABEL = {
  visitas_sin_conversion: { label: "Visitas sin conversion", color: "#ef4444" },
  sin_traccion: { label: "Sin traccion", color: "#94a3b8" },
  buena_conversion_pocas_visitas: { label: "Pocas visitas", color: "#f59e0b" },
};

export default function SeoTitulos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const tarjetaRef = useRef(null);

  const fetchData = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const status = await getStatus();
      if (!status.conectado) {
        setError("No conectado a Mercado Libre. Autenticate primero.");
        return;
      }
      setData(await getSeoTitulos(force));
    } catch (err) {
      setError(err?.message || "Error al cargar tendencias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const seleccionada = useMemo(
    () => data?.items?.find((item) => item.id === seleccionadaId) || null,
    [data, seleccionadaId],
  );

  // Con 108 filas arriba, la tarjeta queda lejos: llevarla a la vista.
  useEffect(() => {
    if (seleccionadaId) tarjetaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [seleccionadaId]);

  if (loading) return <div className="empty-state">Buscando publicaciones flojas y tendencias de MeLi... (puede tardar unos segundos)</div>;

  if (error) {
    return (
      <div className="empty-state">
        <p>{error}</p>
        {error.includes("No conectado") && (
          <button type="button" className="btn" onClick={redirectToMercadoLibreAuth}
            style={{ marginTop: 16, padding: "10px 24px", background: "var(--accent-a)", color: "#1a1a2e", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Conectar con Mercado Libre
          </button>
        )}
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>Publicaciones flojas</h2>
          <button className="btn" onClick={() => fetchData(true)} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>Actualizar</button>
        </header>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 0 }}>
          {fNumber(data.total)} publicaciones con problema de visitas o conversion.
          Elegi una para ver que busca la gente en su categoria.
          {data.categorias_sin_tendencias > 0 && ` (${data.categorias_sin_tendencias} categorias no tienen tendencias publicadas por MeLi)`}
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Diagnostico</th>
                <th>Titulo actual</th>
                <th style={{ textAlign: "center" }}>Largo</th>
                <th style={{ textAlign: "center" }}>Visitas</th>
                <th style={{ textAlign: "center" }}>Ventas</th>
                <th style={{ textAlign: "center" }}>Keywords</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items?.length ? data.items.map((item) => {
                const diag = DIAGNOSIS_LABEL[item.diagnosis] || { label: item.diagnosis, color: "var(--muted)" };
                return (
                  <tr key={item.id} style={{ background: item.id === seleccionadaId ? "rgba(184,115,51,0.10)" : undefined }}>
                    <td><span className="pill" style={{ color: diag.color, borderColor: diag.color, fontWeight: 600 }}>{diag.label}</span></td>
                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</td>
                    <td style={{ textAlign: "center", color: (item.title?.length || 0) < 45 ? "#f59e0b" : undefined }}>
                      {item.title?.length || 0}
                    </td>
                    <td style={{ textAlign: "center" }}>{fNumber(item.visits_30d)}</td>
                    <td style={{ textAlign: "center" }}>{fNumber(item.sold_30d)}</td>
                    <td style={{ textAlign: "center", color: item.keywords?.length ? undefined : "var(--muted)" }}>
                      {item.keywords?.length || "-"}
                    </td>
                    <td>
                      <button className="btn" onClick={() => setSeleccionadaId(item.id)} style={{ fontSize: "0.75rem", padding: "4px 10px" }}>
                        Trabajar
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="7" className="table-empty">Ninguna publicacion floja. Buena senal.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {seleccionada && (
        <section className="panel" ref={tarjetaRef} style={{ borderColor: "var(--accent-a)" }}>
          <header className="panel-head">
            <h2>{seleccionada.title}</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <a href={seleccionada.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-a)", fontSize: "0.78rem" }}>Ver en MeLi</a>
              <button className="btn" onClick={() => setSeleccionadaId(null)} style={{ fontSize: "0.75rem", padding: "4px 10px" }}>Cerrar</button>
            </div>
          </header>

          {/* key: al cambiar de publicacion el taller arranca limpio, sin useEffect */}
          <TallerTitulo
            key={seleccionada.id}
            keywords={seleccionada.keywords || []}
            categoriaNombre={seleccionada.category_name || seleccionada.category_id}
            categoriaId={seleccionada.category_id}
            tituloBase={seleccionada.title}
          />
        </section>
      )}
    </>
  );
}
