import { useEffect, useMemo, useState } from "react";
import { getOrderHistory, getMe, getStatus, redirectToMercadoLibreAuth } from "../api";
import { fCurrency, fNumber, fDate, getOrderTone } from "../utils";

const isPaidMeliOrder = (order) =>
  order?.status === "paid" ||
  order?.tags?.includes("paid") ||
  (order?.payments || []).some((p) => p?.status === "approved" || p?.status_detail === "accredited");

const normalizeMeliOrder = (order) => {
  const items = order?.order_items || [];
  if (!items.length) return [];
  const status = isPaidMeliOrder(order) ? "paid" : String(order?.status || "pending").toLowerCase();
  const buyer = order?.buyer?.nickname || order?.buyer?.id || `buyer-${order.id}`;
  const date = order.date_created || order.date_closed || new Date().toISOString();
  const orderTotal = Number(order.total_amount) || Number(order.paid_amount) || 0;

  return items.map((orderItem, idx) => {
    const item = orderItem?.item;
    const qty = Number(orderItem?.quantity) || 1;
    const unitPrice = Number(orderItem?.unit_price) || 0;
    const lineAmount = unitPrice * qty || (idx === 0 ? orderTotal : 0);
    return {
      id: `${order.id}-${idx}`,
      orderId: order.id,
      date,
      status,
      amount: lineAmount,
      item: {
        id: item?.id || `ML-${order.id}-${idx}`,
        sku: item?.seller_sku || "-",
        title: item?.title || "Producto Mercado Libre",
        price: unitPrice,
        category: item?.category_name || item?.category_id || "Mercado Libre",
      },
      qty,
      buyer,
      isMultiItem: items.length > 1,
      itemIndex: idx,
      totalItems: items.length,
    };
  });
};

export default function Ordenes() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      try {
        const status = await getStatus();
        if (!status.conectado) {
          setError("No conectado a Mercado Libre. Autenticate en /auth/mercadolibre");
          setLoading(false);
          return;
        }
        const [, ordersPayload] = await Promise.all([getMe(), getOrderHistory(2500)]);
        if (cancelled) return;
        const normalized = (ordersPayload.results || []).flatMap(normalizeMeliOrder);
        setOrders(normalized);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Error al cargar ordenes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOrders();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (filterStatus === "all") return orders;
    return orders.filter((o) => o.status === filterStatus);
  }, [orders, filterStatus]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)), [filtered]);

  const handleConnectMeli = () => {
    redirectToMercadoLibreAuth();
  };

  if (loading) return <div className="empty-state">Cargando ordenes desde Mercado Libre...</div>;
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
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>Ordenes en tiempo real</h2>
          <span>{fNumber(sorted.length)} ordenes · API MeLi</span>
        </header>

        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {["all", "paid", "cancelled", "pending"].map((s) => (
            <button
              key={s}
              type="button"
              className={`comparison-btn ${filterStatus === s ? "active" : ""}`}
              onClick={() => setFilterStatus(s)}
              style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "6px 12px" }}
            >
              {s === "all" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Orden</th>
                <th>Producto</th>
                <th>Comprador</th>
                <th>QTY</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length ? sorted.slice(0, 200).map((row) => (
                <tr
                  key={row.id}
                  style={row.isMultiItem ? { borderLeft: "3px solid var(--accent, #a78bfa)" } : {}}
                >
                  <td>{row.itemIndex === 0 ? fDate(new Date(row.date)) : ""}</td>
                  <td>
                    {row.itemIndex === 0 ? `#${String(row.orderId).slice(-6)}` : ""}
                    {row.isMultiItem && (
                      <span style={{ fontSize: "11px", color: "var(--muted)", marginLeft: "4px" }}>
                        {row.itemIndex + 1}/{row.totalItems}
                      </span>
                    )}
                  </td>
                  <td>{row.item.title}</td>
                  <td>{row.itemIndex === 0 ? row.buyer : ""}</td>
                  <td>{row.qty}</td>
                  <td>{fCurrency(row.amount)}</td>
                  <td>
                    {row.itemIndex === 0 && (
                      <span className={`pill ${getOrderTone(row.status)}`}>{row.status.toUpperCase()}</span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="table-empty">No hay ordenes para mostrar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
