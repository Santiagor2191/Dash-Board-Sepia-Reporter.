import { useEffect, useState, useMemo } from "react";
import { getStatus, getInventory, redirectToMercadoLibreAuth } from "../api";
import { fCurrency, fNumber, exportToCsv } from "../utils";

const ALERT_CONFIG = {
  sin_stock:  { label: "Sin stock",     color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  critico:    { label: "Critico (<7d)",  color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  bajo:       { label: "Bajo (<15d)",    color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  medio:      { label: "Medio (<30d)",   color: "#3b82f6", bg: "rgba(59,130,246,0.10)" },
  ok:         { label: "OK",             color: "#22c55e", bg: "rgba(34,197,94,0.10)" },
  inactive:   { label: "Inactiva",       color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "sin_stock", label: "Sin stock" },
  { value: "critico", label: "Critico" },
  { value: "bajo", label: "Bajo" },
  { value: "medio", label: "Medio" },
  { value: "ok", label: "OK" },
  { value: "inactive", label: "Inactivas" },
];

const SORT_OPTIONS = [
  { value: "alert", label: "Urgencia" },
  { value: "stock_asc", label: "Menor stock" },
  { value: "velocity", label: "Mayor velocidad" },
  { value: "revenue", label: "Mayor revenue" },
  { value: "days_asc", label: "Menos dias" },
  { value: "name", label: "Nombre A-Z" },
];

const ALERT_PRIORITY = { sin_stock: 0, critico: 1, bajo: 2, medio: 3, ok: 4, inactive: 5 };

export default function Inventario() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("alert");
  const [search, setSearch] = useState("");
  const [coverageDays, setCoverageDays] = useState(30);

  const fetchData = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const status = await getStatus();
      if (!status.conectado) {
        setError("No conectado a Mercado Libre. Autenticate en /auth/mercadolibre");
        setLoading(false);
        return;
      }
      const data = await getInventory(force);
      setItems(data.items || []);
    } catch (err) {
      setError(err?.message || "Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchData().then(() => { if (cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  // KPIs
  const kpis = useMemo(() => {
    const active = items.filter((i) => i.status === "active");
    const sinStock = active.filter((i) => i.stock_alert === "sin_stock").length;
    const critico = active.filter((i) => i.stock_alert === "critico").length;
    const bajo = active.filter((i) => i.stock_alert === "bajo").length;
    const totalStock = active.reduce((s, i) => s + i.available_quantity, 0);
    const avgDays = active.filter((i) => i.daily_velocity > 0);
    const avgDaysVal = avgDays.length
      ? Math.round(avgDays.reduce((s, i) => s + i.days_of_stock, 0) / avgDays.length)
      : 0;
    return {
      totalPublicaciones: items.length,
      activas: active.length,
      sinStock,
      alertas: sinStock + critico + bajo,
      totalStock,
      avgDays: avgDaysVal,
    };
  }, [items]);

  // Reposición sugerida: qué comprar para cubrir `coverageDays` días de venta.
  // Solo productos activos que se venden (velocidad > 0) y a los que no les alcanza el stock.
  const reposicion = useMemo(() => {
    return items
      .filter((i) => i.status === "active" && i.daily_velocity > 0)
      .map((i) => ({
        ...i,
        sugerido: Math.max(0, Math.round(i.daily_velocity * coverageDays) - i.available_quantity),
      }))
      .filter((i) => i.sugerido > 0)
      .sort((a, b) => a.days_of_stock - b.days_of_stock);
  }, [items, coverageDays]);

  const totalUnidadesReponer = useMemo(
    () => reposicion.reduce((s, i) => s + i.sugerido, 0),
    [reposicion],
  );

  // Filtered & sorted list
  const displayed = useMemo(() => {
    let list = [...items];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title?.toLowerCase().includes(q) ||
          i.id?.toLowerCase().includes(q) ||
          i.seller_sku?.toLowerCase().includes(q) ||
          i.category_name?.toLowerCase().includes(q)
      );
    }

    // Alert filter
    if (filter !== "all") {
      list = list.filter((i) => i.stock_alert === filter);
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case "alert":
          return (ALERT_PRIORITY[a.stock_alert] ?? 5) - (ALERT_PRIORITY[b.stock_alert] ?? 5)
            || a.available_quantity - b.available_quantity;
        case "stock_asc":
          return a.available_quantity - b.available_quantity;
        case "velocity":
          return b.daily_velocity - a.daily_velocity;
        case "revenue":
          return (b.sold_30d * b.price) - (a.sold_30d * a.price);
        case "days_asc":
          return a.days_of_stock - b.days_of_stock;
        case "name":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    });

    return list;
  }, [items, filter, sortBy, search]);

  const handleConnectMeli = () => {
    redirectToMercadoLibreAuth();
  };

  if (loading) return <div className="empty-state">Cargando inventario en tiempo real desde Mercado Libre...</div>;
  if (error) {
    const isNotConnected = error.includes("No conectado");
    return (
      <div className="empty-state">
        <p>{error}</p>
        {isNotConnected && (
          <button
            type="button"
            className="btn"
            onClick={handleConnectMeli}
            style={{
              marginTop: "16px",
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
    );
  }

  return (
    <div className="content" style={{ padding: 0 }}>
      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="kpi-card stripe-a">
          <div className="kpi-label">Publicaciones activas</div>
          <div className="kpi-value">{fNumber(kpis.activas)}</div>
          <div className="kpi-delta flat">de {fNumber(kpis.totalPublicaciones)} total</div>
        </div>
        <div className="kpi-card stripe-e" style={kpis.sinStock > 0 ? { borderColor: "#ef4444" } : {}}>
          <div className="kpi-label">Sin stock</div>
          <div className="kpi-value" style={{ color: kpis.sinStock > 0 ? "#ef4444" : undefined }}>
            {kpis.sinStock}
          </div>
          <div className="kpi-delta down">{kpis.sinStock > 0 ? "Requiere accion inmediata" : "Todo bien"}</div>
        </div>
        <div className="kpi-card stripe-c" style={kpis.alertas > 0 ? { borderColor: "#f59e0b" } : {}}>
          <div className="kpi-label">Alertas de stock</div>
          <div className="kpi-value" style={{ color: kpis.alertas > 0 ? "#f59e0b" : "#22c55e" }}>
            {kpis.alertas}
          </div>
          <div className="kpi-delta flat">sin stock + critico + bajo</div>
        </div>
        <div className="kpi-card stripe-b">
          <div className="kpi-label">Unidades totales</div>
          <div className="kpi-value">{fNumber(kpis.totalStock)}</div>
          <div className="kpi-delta flat">disponibles</div>
        </div>
        <div className="kpi-card stripe-d">
          <div className="kpi-label">Dias de stock prom.</div>
          <div className="kpi-value">{kpis.avgDays}</div>
          <div className="kpi-delta flat">basado en ventas 30d</div>
        </div>
      </div>

      {/* Alert Summary Bar */}
      {kpis.alertas > 0 && (
        <div
          className="panel"
          style={{
            background: "rgba(249,115,22,0.08)",
            borderColor: "rgba(249,115,22,0.3)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>!</span>
          <span>
            <strong>{kpis.alertas} publicacion{kpis.alertas !== 1 ? "es" : ""}</strong> necesita{kpis.alertas !== 1 ? "n" : ""} atencion:{" "}
            {kpis.sinStock > 0 && <span style={{ color: "#ef4444" }}>{kpis.sinStock} sin stock</span>}
            {kpis.sinStock > 0 && (items.filter(i => i.stock_alert === "critico").length > 0) && " · "}
            {items.filter(i => i.stock_alert === "critico").length > 0 && (
              <span style={{ color: "#f97316" }}>
                {items.filter(i => i.stock_alert === "critico").length} critico
              </span>
            )}
            {(kpis.sinStock > 0 || items.filter(i => i.stock_alert === "critico").length > 0) &&
              items.filter(i => i.stock_alert === "bajo").length > 0 && " · "}
            {items.filter(i => i.stock_alert === "bajo").length > 0 && (
              <span style={{ color: "#f59e0b" }}>
                {items.filter(i => i.stock_alert === "bajo").length} bajo
              </span>
            )}
          </span>
        </div>
      )}

      {/* Reposición sugerida */}
      <section className="panel">
        <header className="panel-head">
          <h2>Reposición sugerida</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Cobertura:</span>
            <select
              value={coverageDays}
              onChange={(e) => setCoverageDays(Number(e.target.value))}
              className="dropdown-trigger"
              style={{ minWidth: 90 }}
            >
              <option value={30}>30 días</option>
              <option value={45}>45 días</option>
              <option value={60}>60 días</option>
            </select>
            {reposicion.length > 0 && (
              <button className="btn btn-muted btn-xs" onClick={() => exportToCsv(
                "reposicion.csv",
                ["Producto", "SKU", "Stock actual", "Vel/dia", "Dias restantes", "Comprar"],
                reposicion.map((i) => [i.title, i.seller_sku || i.id, i.available_quantity, i.daily_velocity.toFixed(1), i.days_of_stock >= 999 ? "" : i.days_of_stock, i.sugerido])
              )}>↓ Lista de compra</button>
            )}
          </div>
        </header>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0 0 12px" }}>
          Productos que se quedan sin stock antes de {coverageDays} días según su velocidad de venta. La columna <strong>Comprar</strong> es cuánto reponer para cubrir ese periodo.
        </p>
        {reposicion.length ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <strong>{reposicion.length}</strong> producto{reposicion.length !== 1 ? "s" : ""} para reponer · <strong>{fNumber(totalUnidadesReponer)}</strong> unidades en total
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th style={{ textAlign: "center" }}>Stock</th>
                    <th style={{ textAlign: "center" }}>Vel/día</th>
                    <th style={{ textAlign: "center" }}>Días restantes</th>
                    <th style={{ textAlign: "center" }}>Comprar</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {reposicion.map((item) => (
                    <tr key={item.id} style={{ background: item.days_of_stock <= 7 ? "rgba(239,68,68,0.05)" : undefined }}>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{item.seller_sku || item.id}</td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: item.available_quantity === 0 ? "#ef4444" : undefined }}>{fNumber(item.available_quantity)}</td>
                      <td style={{ textAlign: "center", color: "var(--muted)" }}>{item.daily_velocity.toFixed(1)}</td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: item.days_of_stock <= 7 ? "#ef4444" : item.days_of_stock <= 15 ? "#f97316" : "#f59e0b" }}>{item.days_of_stock >= 999 ? "---" : item.days_of_stock}</td>
                      <td style={{ textAlign: "center", fontWeight: 800, color: "var(--accent)" }}>+{fNumber(item.sugerido)}</td>
                      <td>{item.permalink && <a href={item.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-a)", fontSize: "0.78rem" }}>Ver</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">Nada urgente: ningún producto se queda sin stock en los próximos {coverageDays} días. 👍</div>
        )}
      </section>

      {/* Filters & Controls */}
      <section className="panel">
        <header className="panel-head">
          <h2>Inventario por publicacion</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
              {fNumber(displayed.length)} de {fNumber(items.length)}
            </span>
            <button className="btn" onClick={() => fetchData(true)} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>
              Actualizar
            </button>
          </div>
        </header>

        {/* Search + Filter + Sort */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Buscar producto, SKU, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="dropdown-search"
            style={{ flex: "1 1 200px", maxWidth: 320 }}
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="dropdown-trigger"
            style={{ flex: "0 0 auto", minWidth: 140 }}
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="dropdown-trigger"
            style={{ flex: "0 0 auto", minWidth: 160 }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Quick filter pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {FILTER_OPTIONS.map((o) => {
            const count = o.value === "all"
              ? items.length
              : items.filter((i) => i.stock_alert === o.value).length;
            if (count === 0 && o.value !== "all") return null;
            const cfg = ALERT_CONFIG[o.value];
            const isActive = filter === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setFilter(o.value)}
                className="pill"
                style={{
                  cursor: "pointer",
                  background: isActive ? (cfg?.bg || "rgba(56,189,248,0.14)") : "transparent",
                  color: isActive ? (cfg?.color || "var(--accent-a)") : "var(--muted)",
                  borderColor: isActive ? (cfg?.color || "var(--accent-a)") : undefined,
                }}
              >
                {o.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Estado</th>
                <th>Producto</th>
                <th>SKU</th>
                <th>Categoria</th>
                <th>Precio</th>
                <th style={{ textAlign: "center" }}>Stock</th>
                <th style={{ textAlign: "center" }}>Vtas 30d</th>
                <th style={{ textAlign: "center" }}>Vel/dia</th>
                <th style={{ textAlign: "center" }}>Dias stock</th>
                <th>Ultima venta</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length ? (
                displayed.map((item) => {
                  const alert = ALERT_CONFIG[item.stock_alert] || ALERT_CONFIG.ok;
                  return (
                    <tr key={item.id} style={{ background: item.stock_alert === "sin_stock" ? "rgba(239,68,68,0.04)" : undefined }}>
                      <td>
                        <span
                          className="pill"
                          style={{
                            color: alert.color,
                            background: alert.bg,
                            borderColor: alert.color,
                            fontWeight: 600,
                          }}
                        >
                          {alert.label}
                        </span>
                      </td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.title}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                        {item.seller_sku || item.id}
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>{item.category_name}</td>
                      <td>{fCurrency(item.price)}</td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: item.available_quantity === 0 ? "#ef4444" : undefined }}>
                        {fNumber(item.available_quantity)}
                      </td>
                      <td style={{ textAlign: "center" }}>{fNumber(item.sold_30d)}</td>
                      <td style={{ textAlign: "center", color: "var(--muted)" }}>
                        {item.daily_velocity > 0 ? item.daily_velocity.toFixed(1) : "-"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          fontWeight: 700,
                          color: item.days_of_stock <= 7 ? "#ef4444"
                            : item.days_of_stock <= 15 ? "#f97316"
                            : item.days_of_stock <= 30 ? "#f59e0b"
                            : item.days_of_stock >= 999 ? "var(--muted)"
                            : "#22c55e",
                        }}>
                          {item.days_of_stock >= 999 ? "---" : item.days_of_stock}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                        {item.last_sale ? new Date(item.last_sale).toLocaleDateString("es-CO") : "-"}
                      </td>
                      <td>
                        {item.permalink && (
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--accent-a)", fontSize: "0.78rem" }}
                          >
                            Ver
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="11" className="table-empty">
                    No hay publicaciones que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
