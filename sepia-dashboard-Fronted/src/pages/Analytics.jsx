import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import KPI from "../components/KPI";
import { fCurrency, fNumber, getPeriodStart, getPeriodLabel, exportToCsv } from "../utils";

export default function Analytics() {
  const { filteredAll, appliedComparison } = useOutletContext();

  const paidOrders = useMemo(() => filteredAll.filter((o) => o.status === "paid"), [filteredAll]);

  // Revenue por periodo
  const revenueSeries = useMemo(() => {
    const map = new Map();
    filteredAll.forEach((o) => {
      const ps = getPeriodStart(o.date, appliedComparison);
      const key = ps.getTime();
      const prev = map.get(key) || { key, label: getPeriodLabel(ps, appliedComparison), revenue: 0, orders: 0, start: ps };
      prev.revenue += o.amount;
      prev.orders += 1;
      map.set(key, prev);
    });
    return [...map.values()].sort((a, b) => a.start - b.start);
  }, [filteredAll, appliedComparison]);

  const maxRevenue = Math.max(...revenueSeries.map((r) => r.revenue), 1);

  // Top 10 productos
  const topProducts = useMemo(() => {
    const map = {};
    filteredAll.forEach((o) => {
      const title = o.item.title;
      if (!map[title]) map[title] = { title, revenue: 0, qty: 0, orders: 0 };
      map[title].revenue += o.amount;
      map[title].qty += o.qty;
      map[title].orders += 1;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filteredAll]);

  // Metricas globales
  const totalRevenue = filteredAll.reduce((s, o) => s + o.amount, 0);
  const totalQty = filteredAll.reduce((s, o) => s + o.qty, 0);
  const avgTicket = filteredAll.length ? totalRevenue / filteredAll.length : 0;
  const paidRevenue = paidOrders.reduce((s, o) => s + (o.paidAmount || o.amount), 0);
  const conversionRate = filteredAll.length ? (paidOrders.length / filteredAll.length) * 100 : 0;

  return (
    <>
      <section className="kpi-grid">
        <KPI stripeClass="stripe-a" label="Revenue Total" value={fCurrency(totalRevenue)} delta={0} />
        <KPI stripeClass="stripe-b" label="Ingresado Neto" value={fCurrency(paidRevenue)} delta={0} />
        <KPI stripeClass="stripe-c" label="Unidades Vendidas" value={fNumber(totalQty)} delta={0} />
        <KPI stripeClass="stripe-d" label="Ticket Promedio" value={fCurrency(avgTicket)} delta={0} />
        <KPI stripeClass="stripe-e" label="Tasa Conversion" value={`${conversionRate.toFixed(1)}%`} delta={0} />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Revenue por periodo</h2>
          <div className="panel-head-actions">
            <span>{fNumber(revenueSeries.length)} periodos</span>
            <button type="button" className="btn btn-muted btn-xs" onClick={() => exportToCsv(
              "revenue-por-periodo.csv",
              ["Periodo", "Revenue COP", "Ordenes"],
              revenueSeries.map((r) => [r.label, r.revenue, r.orders])
            )}>↓ CSV</button>
          </div>
        </header>
        {revenueSeries.length ? (
          <div className="bar-chart">
            {revenueSeries.slice(-12).map((item) => (
              <div key={item.key} className="bar-col">
                <span className="bar-value">{fCurrency(item.revenue)}</span>
                <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max((item.revenue / maxRevenue) * 120, 6)}px` }} /></div>
                <span className="bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        ) : <div className="empty-state">Sin datos para el periodo.</div>}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Top 10 productos</h2>
          <div className="panel-head-actions">
            <span>Por revenue</span>
            <button type="button" className="btn btn-muted btn-xs" onClick={() => exportToCsv(
              "top-productos.csv",
              ["Producto", "Ordenes", "Unidades", "Revenue COP"],
              topProducts.map((p) => [p.title, p.orders, p.qty, p.revenue])
            )}>↓ CSV</button>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Ordenes</th><th>Unidades</th><th>Revenue</th></tr></thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.title}>
                  <td>{p.title}</td>
                  <td>{fNumber(p.orders)}</td>
                  <td>{fNumber(p.qty)}</td>
                  <td>{fCurrency(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
