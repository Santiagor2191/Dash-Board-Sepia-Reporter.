import { useMemo, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import KPI from "../components/KPI";
import { getInventory } from "../api";
import {
  fCurrency, fNumber, fDate, calcDelta,
  getPeriodStart, getPeriodLabel, addPeriods, getOrderTone,
  COMPARISON_OPTIONS,
} from "../utils";

const STOCK_ALERT_CONFIG = {
  sin_stock: { label: "Sin stock", color: "#ef4444" },
  critico:   { label: "Crítico",   color: "#f97316" },
  bajo:      { label: "Bajo",      color: "#f59e0b" },
};

const getOrdersPanelTitle = (comparison) => {
  if (comparison === "quarter") return "Ordenes por trimestre";
  if (comparison === "year") return "Ordenes por ano";
  return "Ordenes por mes";
};

export default function Dashboard() {
  const { filteredAll, ordersSource, appliedComparison, time, costosMap } = useOutletContext();

  const [stockAlerts, setStockAlerts] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getInventory()
      .then((data) => {
        if (cancelled) return;
        const alerts = (data.items || [])
          .filter((i) => i.status === "active" && i.stock_alert in STOCK_ALERT_CONFIG)
          .sort((a, b) => {
            const order = { sin_stock: 0, critico: 1, bajo: 2 };
            return (order[a.stock_alert] ?? 3) - (order[b.stock_alert] ?? 3)
              || a.available_quantity - b.available_quantity;
          });
        setStockAlerts(alerts);
      })
      .catch(() => { if (!cancelled) setStockAlerts(null); })
      .finally(() => { if (!cancelled) setStockLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sortedOrders = useMemo(() => [...filteredAll].sort((a, b) => new Date(b.date) - new Date(a.date)), [filteredAll]);

  const comparisonPeriods = useMemo(() => {
    const periods = new Map();
    filteredAll.forEach((order) => {
      const ps = getPeriodStart(order.date, appliedComparison);
      periods.set(ps.getTime(), ps);
    });
    return [...periods.values()].sort((a, b) => a - b);
  }, [filteredAll, appliedComparison]);

  const previousPeriodKeys = useMemo(
    () => new Set(comparisonPeriods.map((ps) => addPeriods(ps, -1, appliedComparison).getTime())),
    [comparisonPeriods, appliedComparison],
  );

  const previousAll = useMemo(() => {
    if (!previousPeriodKeys.size) return [];
    return ordersSource.filter((o) => previousPeriodKeys.has(getPeriodStart(o.date, appliedComparison).getTime()));
  }, [ordersSource, previousPeriodKeys, appliedComparison]);

  const totalOrders = filteredAll.length;
  const totalRevenue = filteredAll.reduce((s, o) => s + o.amount, 0);
  const totalIngresado = filteredAll.reduce((s, o) => s + (o.paidAmount || 0), 0);
  const totalCargos = filteredAll.reduce((s, o) => s + (o.cargosVenta || 0), 0);
  const ticketAverage = totalOrders ? totalIngresado / totalOrders : 0;

  const costoProducto = useMemo(() => {
    let total = 0;
    for (const o of filteredAll) {
      const costo = costosMap?.[o.item.id];
      if (costo) total += costo * o.qty;
    }
    return total;
  }, [filteredAll, costosMap]);

  const prevCostoProducto = useMemo(() => {
    let total = 0;
    for (const o of previousAll) {
      const costo = costosMap?.[o.item.id];
      if (costo) total += costo * o.qty;
    }
    return total;
  }, [previousAll, costosMap]);

  const prevRevenue = previousAll.reduce((s, o) => s + o.amount, 0);
  const prevIngresado = previousAll.reduce((s, o) => s + (o.paidAmount || 0), 0);
  const prevCargos = previousAll.reduce((s, o) => s + (o.cargosVenta || 0), 0);
  const prevOrdersCount = previousAll.length;
  const prevTicket = prevOrdersCount ? prevIngresado / prevOrdersCount : 0;

  const utilidadNeta = totalRevenue - costoProducto;
  const prevUtilidadNeta = prevRevenue - prevCostoProducto;
  const margenPct = totalIngresado ? (utilidadNeta / totalIngresado) * 100 : 0;
  const prevMargenPct = prevIngresado ? (prevUtilidadNeta / prevIngresado) * 100 : 0;

  const kpis = [
    { stripeClass: "stripe-a", label: "Ordenes Totales", value: fNumber(totalOrders), delta: calcDelta(totalOrders, prevOrdersCount) },
    { stripeClass: "stripe-b", label: "Ingresos Sepia", value: fCurrency(totalRevenue), delta: calcDelta(totalRevenue, prevRevenue) },
    { stripeClass: "stripe-c", label: "Precio de Venta", value: fCurrency(totalIngresado), delta: calcDelta(totalIngresado, prevIngresado) },
    { stripeClass: "stripe-d", label: "Ticket Promedio", value: fCurrency(ticketAverage), delta: calcDelta(ticketAverage, prevTicket) },
    { stripeClass: "stripe-e", label: "Cargos por Venta", value: fCurrency(totalCargos), delta: calcDelta(totalCargos, prevCargos) },
    { stripeClass: "stripe-a", label: "Costo Producto", value: fCurrency(costoProducto), delta: calcDelta(costoProducto, prevCostoProducto) },
    { stripeClass: "stripe-b", label: "Utilidad Neta", value: fCurrency(utilidadNeta), delta: calcDelta(utilidadNeta, prevUtilidadNeta) },
    { stripeClass: "stripe-c", label: "Margen %", value: `${margenPct.toFixed(1)}%`, delta: calcDelta(margenPct, prevMargenPct) },
  ];

  const periodSeries = useMemo(() => {
    const map = new Map();
    filteredAll.forEach((o) => {
      const ps = getPeriodStart(o.date, appliedComparison);
      const key = ps.getTime();
      const prev = map.get(key) || { key, label: getPeriodLabel(ps, appliedComparison), orders: 0, revenue: 0, start: ps };
      prev.orders += 1;
      prev.revenue += o.amount;
      map.set(key, prev);
    });
    const limit = appliedComparison === "month" ? 12 : appliedComparison === "quarter" ? 8 : 5;
    return [...map.values()].sort((a, b) => a.start - b.start).slice(-limit);
  }, [filteredAll, appliedComparison]);
  const maxPeriodOrders = Math.max(...periodSeries.map((p) => p.orders), 1);

  const categorySeries = useMemo(() => {
    const map = {};
    filteredAll.forEach((o) => {
      const cat = o.item.category || "Sin categoria";
      if (!map[cat]) map[cat] = { category: cat, revenue: 0 };
      map[cat].revenue += o.amount;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [filteredAll]);
  const maxCatRevenue = Math.max(...categorySeries.map((c) => c.revenue), 1);

  return (
    <>
      <section className="kpi-grid">{kpis.map((k) => <KPI key={k.label} {...k} />)}</section>

      <section className="panel-grid">
        <article className="panel">
          <header className="panel-head"><h2>{getOrdersPanelTitle(appliedComparison)}</h2><span>{time}</span></header>
          {periodSeries.length ? (
            <div className="bar-chart">
              {periodSeries.map((item) => (
                <div key={item.key} className="bar-col">
                  <span className="bar-value">{item.orders}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max((item.orders / maxPeriodOrders) * 120, 6)}px` }} /></div>
                  <span className="bar-label">{item.label}</span>
                </div>
              ))}
            </div>
          ) : <div className="empty-state">No hay ordenes para los filtros actuales.</div>}
        </article>

        <article className="panel">
          <header className="panel-head"><h2>Ventas por categoria</h2><span>Top 6</span></header>
          {categorySeries.length ? (
            <div className="category-list">
              {categorySeries.map((item) => (
                <div key={item.category} className="category-item">
                  <div className="category-label-row"><span>{item.category}</span><span>{fCurrency(item.revenue)}</span></div>
                  <div className="category-track"><div className="category-fill" style={{ width: `${(item.revenue / maxCatRevenue) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <div className="empty-state">No hay ventas para clasificar en este rango.</div>}
        </article>
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Ultimas ordenes</h2><span>{fNumber(sortedOrders.length)} registros</span></header>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Orden</th><th>Producto</th><th>QTY</th><th>Monto</th><th>Estado</th></tr></thead>
            <tbody>
              {sortedOrders.length ? sortedOrders.slice(0, 30).map((order) => (
                <tr key={`${order.id}-${order.date}`}>
                  <td>{fDate(new Date(order.date))}</td>
                  <td>#{String(order.id).slice(-6)}</td>
                  <td>{order.item.title}</td>
                  <td>{order.qty}</td>
                  <td>{fCurrency(order.amount)}</td>
                  <td><span className={`pill ${getOrderTone(order.status)}`}>{order.status.toUpperCase()}</span></td>
                </tr>
              )) : (
                <tr><td colSpan="6" className="table-empty">No hay ordenes para mostrar con los filtros actuales.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Alertas de stock</h2>
          {!stockLoading && stockAlerts !== null && (
            <span>{stockAlerts.length ? `${stockAlerts.length} productos` : "Sin alertas ✓"}</span>
          )}
        </header>
        {stockLoading ? (
          <div className="empty-state">Cargando inventario...</div>
        ) : stockAlerts === null ? (
          <div className="empty-state">Conecta Mercado Libre para ver alertas de stock.</div>
        ) : stockAlerts.length === 0 ? (
          <div className="empty-state">Todo el inventario está en niveles normales.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Stock</th><th>Estado</th><th>Días restantes</th></tr></thead>
              <tbody>
                {stockAlerts.slice(0, 15).map((item) => {
                  const cfg = STOCK_ALERT_CONFIG[item.stock_alert];
                  return (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>{fNumber(item.available_quantity)}</td>
                      <td><span className="pill" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span></td>
                      <td>{item.days_of_stock > 0 ? `${Math.round(item.days_of_stock)}d` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
