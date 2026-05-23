import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, Cell,
} from "recharts";
import { getConversion, getStatus, redirectToMercadoLibreAuth } from "../api";
import KPI from "../components/KPI";
import { fCurrency, fNumber } from "../utils";

const DIAGNOSIS_CONFIG = {
  estrella:                       { label: "Estrella",                  color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: "S" },
  visitas_sin_conversion:         { label: "Visitas sin conversion",    color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "!" },
  buena_conversion_pocas_visitas: { label: "Buena conv. pocas visitas", color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "^" },
  sin_traccion:                   { label: "Sin traccion",              color: "#94a3b8", bg: "rgba(148,163,184,0.10)", icon: "-" },
  normal:                         { label: "Normal",                    color: "#3b82f6", bg: "rgba(59,130,246,0.10)",  icon: "~" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "estrella", label: "Estrellas" },
  { value: "visitas_sin_conversion", label: "Sin conversion" },
  { value: "buena_conversion_pocas_visitas", label: "Pocas visitas" },
  { value: "sin_traccion", label: "Sin traccion" },
  { value: "normal", label: "Normal" },
];

const SORT_OPTIONS = [
  { value: "conversion_desc", label: "Mayor conversion" },
  { value: "visits_desc", label: "Mas visitas" },
  { value: "sold_desc", label: "Mas vendidos" },
  { value: "revenue_desc", label: "Mayor revenue" },
  { value: "conversion_asc", label: "Menor conversion" },
];

export default function Conversion() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("visits_desc");
  const [search, setSearch] = useState("");

  const fetchData = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const status = await getStatus();
      if (!status.conectado) {
        setError("No conectado a Mercado Libre. Autenticate primero.");
        setLoading(false);
        return;
      }
      const result = await getConversion(force);
      setData(result);
    } catch (err) {
      setError(err?.message || "Error al cargar datos de conversion");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const displayed = useMemo(() => {
    if (!data?.items) return [];
    let list = [...data.items];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.title?.toLowerCase().includes(q) || i.id?.toLowerCase().includes(q));
    }

    if (filter !== "all") {
      list = list.filter((i) => i.diagnosis === filter);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "conversion_desc": return b.conversion_rate - a.conversion_rate;
        case "conversion_asc": return a.conversion_rate - b.conversion_rate;
        case "visits_desc": return b.visits_30d - a.visits_30d;
        case "sold_desc": return b.sold_30d - a.sold_30d;
        case "revenue_desc": return b.revenue_30d - a.revenue_30d;
        default: return 0;
      }
    });

    return list;
  }, [data, filter, sortBy, search]);

  // Top 10 for bar chart
  const topByVisits = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items]
      .filter((i) => i.visits_30d > 0)
      .sort((a, b) => b.visits_30d - a.visits_30d)
      .slice(0, 10)
      .map((i) => ({
        name: i.title?.length > 30 ? `${i.title.slice(0, 30)}...` : i.title,
        visitas: i.visits_30d,
        ventas: i.sold_30d,
        conversion: i.conversion_rate,
      }));
  }, [data]);

  // Scatter data for visits vs conversion
  const scatterData = useMemo(() => {
    if (!data?.items) return [];
    return data.items
      .filter((i) => i.visits_30d > 0)
      .map((i) => ({
        x: i.visits_30d,
        y: i.conversion_rate,
        z: i.revenue_30d,
        name: i.title,
        diagnosis: i.diagnosis,
      }));
  }, [data]);

  const handleConnectMeli = () => {
    redirectToMercadoLibreAuth();
  };

  if (loading) return <div className="empty-state">Cargando datos de conversion desde Mercado Libre... (esto puede tardar unos segundos)</div>;
  if (error) {
    const isNotConnected = error.includes("No conectado");
    return (
      <div className="empty-state">
        <p>{error}</p>
        {isNotConnected && (
          <button type="button" className="btn" onClick={handleConnectMeli}
            style={{ marginTop: 16, padding: "10px 24px", fontSize: "0.95rem", background: "var(--accent-a)", color: "#1a1a2e", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Conectar con Mercado Libre
          </button>
        )}
      </div>
    );
  }

  if (!data) return null;

  const { kpis } = data;
  const dc = kpis.diagnosis_counts;

  return (
    <>
      {/* KPI Cards */}
      <section className="kpi-grid">
        <KPI stripeClass="stripe-a" label="Visitas Totales (30d)" value={fNumber(kpis.total_visits_30d)} delta={0} />
        <KPI stripeClass="stripe-b" label="Unidades Vendidas (30d)" value={fNumber(kpis.total_sold_30d)} delta={0} />
        <KPI stripeClass="stripe-c" label="Revenue (30d)" value={fCurrency(kpis.total_revenue_30d)} delta={0} />
        <KPI stripeClass="stripe-d" label="Conversion Promedio" value={`${kpis.avg_conversion_rate}%`} delta={0} />
        <KPI stripeClass="stripe-e" label="Publicaciones Activas" value={fNumber(data.total)} delta={0} />
      </section>

      {/* Diagnosis summary */}
      <section className="panel">
        <header className="panel-head"><h2>Diagnostico de Publicaciones</h2>
          <button className="btn" onClick={() => fetchData(true)} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>Actualizar</button>
        </header>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(DIAGNOSIS_CONFIG).map(([key, cfg]) => {
            const count = dc[key === "estrella" ? "estrellas" : key] || 0;
            return (
              <button key={key} onClick={() => setFilter(key === filter ? "all" : key)}
                className="pill" style={{ cursor: "pointer", background: filter === key ? cfg.bg : "transparent", color: filter === key ? cfg.color : "var(--muted)", borderColor: filter === key ? cfg.color : undefined, padding: "8px 16px", fontSize: "0.85rem" }}>
                <span style={{ fontWeight: 700 }}>{count}</span> {cfg.label}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 12, color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.6 }}>
          <div><strong style={{ color: DIAGNOSIS_CONFIG.estrella.color }}>Estrellas:</strong> +50 visitas y +3% conversion. Tus mejores publicaciones.</div>
          <div><strong style={{ color: DIAGNOSIS_CONFIG.visitas_sin_conversion.color }}>Visitas sin conversion:</strong> +100 visitas pero &lt;1% conversion. Revisar precio, fotos o descripcion.</div>
          <div><strong style={{ color: DIAGNOSIS_CONFIG.buena_conversion_pocas_visitas.color }}>Buena conv. pocas visitas:</strong> +3% conversion pero &lt;30 visitas. Candidatas a publicidad.</div>
          <div><strong style={{ color: DIAGNOSIS_CONFIG.sin_traccion.color }}>Sin traccion:</strong> &lt;10 visitas y 0 ventas. Evaluar pausar o mejorar titulo/fotos.</div>
        </div>
      </section>

      {/* Top 10 visits vs sales bar chart */}
      <section className="panel">
        <header className="panel-head"><h2>Top 10 por Visitas</h2><span>Visitas vs Ventas (30d)</span></header>
        {topByVisits.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={topByVisits} layout="vertical" margin={{ left: 160 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fill: "var(--muted)", fontSize: 11 }} width={155} />
              <Tooltip formatter={(val, name) => [fNumber(val), name === "visitas" ? "Visitas" : "Ventas"]} />
              <Legend />
              <Bar dataKey="visitas" name="Visitas" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              <Bar dataKey="ventas" name="Ventas" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="empty-state">Sin datos de visitas.</div>}
      </section>

      {/* Scatter: Visits vs Conversion */}
      {scatterData.length > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Mapa Visitas vs Conversion</h2><span>Tamano = revenue</span></header>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart margin={{ bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="x" name="Visitas" tick={{ fill: "var(--muted)", fontSize: 11 }} label={{ value: "Visitas 30d", position: "bottom", fill: "var(--muted)", fontSize: 12 }} />
              <YAxis dataKey="y" name="Conversion %" tick={{ fill: "var(--muted)", fontSize: 11 }} label={{ value: "Conv %", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 12 }} />
              <ZAxis dataKey="z" range={[40, 400]} name="Revenue" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }}
                formatter={(val, name) => name === "Revenue" ? fCurrency(val) : name === "Conversion %" ? `${val}%` : fNumber(val)}
                labelFormatter={() => ""} />
              <Scatter data={scatterData}>
                {scatterData.map((entry, i) => (
                  <Cell key={i} fill={DIAGNOSIS_CONFIG[entry.diagnosis]?.color || "#3b82f6"} fillOpacity={0.7} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Table with all items */}
      <section className="panel">
        <header className="panel-head">
          <h2>Detalle por Publicacion</h2>
          <span>{fNumber(displayed.length)} de {fNumber(data.items?.length || 0)}</span>
        </header>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <input type="text" placeholder="Buscar producto o ID..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="dropdown-search" style={{ flex: "1 1 200px", maxWidth: 320 }} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="dropdown-trigger" style={{ flex: "0 0 auto", minWidth: 160 }}>
            {FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="dropdown-trigger" style={{ flex: "0 0 auto", minWidth: 180 }}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Diagnostico</th>
                <th>Producto</th>
                <th>Precio</th>
                <th style={{ textAlign: "center" }}>Visitas</th>
                <th style={{ textAlign: "center" }}>Ventas</th>
                <th style={{ textAlign: "center" }}>Conversion</th>
                <th>Revenue</th>
                <th style={{ textAlign: "center" }}>Stock</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length ? displayed.map((item) => {
                const diag = DIAGNOSIS_CONFIG[item.diagnosis] || DIAGNOSIS_CONFIG.normal;
                return (
                  <tr key={item.id}>
                    <td>
                      <span className="pill" style={{ color: diag.color, background: diag.bg, borderColor: diag.color, fontWeight: 600 }}>
                        {diag.label}
                      </span>
                    </td>
                    <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </td>
                    <td>{fCurrency(item.price)}</td>
                    <td style={{ textAlign: "center" }}>{fNumber(item.visits_30d)}</td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>{fNumber(item.sold_30d)}</td>
                    <td style={{ textAlign: "center", fontWeight: 700, color: item.conversion_rate >= 3 ? "#22c55e" : item.conversion_rate < 1 && item.visits_30d >= 100 ? "#ef4444" : "var(--text)" }}>
                      {item.conversion_rate}%
                    </td>
                    <td>{fCurrency(item.revenue_30d)}</td>
                    <td style={{ textAlign: "center", color: item.available_quantity === 0 ? "#ef4444" : undefined }}>
                      {fNumber(item.available_quantity)}
                    </td>
                    <td>
                      {item.permalink && (
                        <a href={item.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-a)", fontSize: "0.78rem" }}>Ver</a>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="9" className="table-empty">No hay publicaciones que coincidan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
