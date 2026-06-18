import { useMemo, useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import KPI from "../components/KPI";
import { getInventory } from "../api";
import {
  fCurrency, fNumber, calcDelta,
  getPeriodStart, getPeriodLabel, addPeriods,
  COMPARISON_OPTIONS, exportToCsv, isRealProduct,
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
  const { filteredAll, ordersSource, appliedComparison, time, costosMap, costosTitleMap } = useOutletContext();

  const normalizeTitle = (t) => {
    if (!t) return "";
    return t.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 45);
  };

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
  const totalUnits = filteredAll.reduce((s, o) => s + (o.qty || 0), 0);
  const totalRevenue = filteredAll.reduce((s, o) => s + o.amount, 0);
  const totalIngresado = filteredAll.reduce((s, o) => s + (o.paidAmount || 0), 0);
  const totalCargos = filteredAll.reduce((s, o) => s + (o.cargosVenta || 0), 0);
  const ticketAverage = totalOrders ? totalIngresado / totalOrders : 0;

  const getCosto = useCallback((o) =>
    costosMap?.[o.item.id] ?? costosTitleMap?.[normalizeTitle(o.item.title)] ?? 0,
  [costosMap, costosTitleMap]);

  const costoProducto = useMemo(() => {
    let total = 0;
    for (const o of filteredAll) total += getCosto(o) * o.qty;
    return total;
  }, [filteredAll, getCosto]);

  const prevCostoProducto = useMemo(() => {
    let total = 0;
    for (const o of previousAll) total += getCosto(o) * o.qty;
    return total;
  }, [previousAll, getCosto]);

  const prevRevenue = previousAll.reduce((s, o) => s + o.amount, 0);
  const prevIngresado = previousAll.reduce((s, o) => s + (o.paidAmount || 0), 0);
  const prevCargos = previousAll.reduce((s, o) => s + (o.cargosVenta || 0), 0);
  const prevOrdersCount = previousAll.length;
  const prevUnits = previousAll.reduce((s, o) => s + (o.qty || 0), 0);
  const prevTicket = prevOrdersCount ? prevIngresado / prevOrdersCount : 0;

  const utilidadNeta = totalRevenue - costoProducto;
  const prevUtilidadNeta = prevRevenue - prevCostoProducto;

  const kpis = [
    { stripeClass: "stripe-c", label: "Precio de Venta", value: fCurrency(totalIngresado), delta: calcDelta(totalIngresado, prevIngresado) },
    { stripeClass: "stripe-b", label: "Ingresos Sepia", value: fCurrency(totalRevenue), delta: calcDelta(totalRevenue, prevRevenue) },
    { stripeClass: "stripe-e", label: "Cargos por Venta", value: fCurrency(totalCargos), delta: calcDelta(totalCargos, prevCargos) },
    { stripeClass: "stripe-a", label: "Costo Producto", value: fCurrency(costoProducto), delta: calcDelta(costoProducto, prevCostoProducto) },
    { stripeClass: "stripe-b", label: "Utilidad Neta", value: fCurrency(utilidadNeta), delta: calcDelta(utilidadNeta, prevUtilidadNeta) },
    { stripeClass: "stripe-a", label: "Ordenes Totales", value: fNumber(totalOrders), delta: calcDelta(totalOrders, prevOrdersCount) },
    { stripeClass: "stripe-d", label: "Unidades Vendidas", value: fNumber(totalUnits), delta: calcDelta(totalUnits, prevUnits) },
    { stripeClass: "stripe-d", label: "Ticket Promedio", value: fCurrency(ticketAverage), delta: calcDelta(ticketAverage, prevTicket) },
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

  const topProductos = useMemo(() => {
    const map = {};
    filteredAll.forEach((o) => {
      const name = o.item.title;
      if (!isRealProduct(name)) return;
      if (!map[name]) map[name] = { producto: name, unidades: 0, revenue: 0 };
      map[name].unidades += o.qty || 0;
      map[name].revenue += o.amount || 0;
    });
    return Object.values(map).sort((a, b) => b.unidades - a.unidades).slice(0, 15);
  }, [filteredAll]);

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
        <header className="panel-head">
          <h2>Productos más vendidos</h2>
          <div className="panel-head-actions">
            <span>Top {topProductos.length} por unidades</span>
            <button type="button" className="btn btn-muted btn-xs" onClick={() => exportToCsv(
              "productos-top.csv",
              ["#", "Producto", "Unidades", "Ventas COP"],
              topProductos.map((p, i) => [i + 1, p.producto, p.unidades, p.revenue])
            )}>↓ CSV</button>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Ventas</th></tr></thead>
            <tbody>
              {topProductos.length ? topProductos.map((p, i) => (
                <tr key={p.producto}>
                  <td>{i + 1}</td>
                  <td>{p.producto}</td>
                  <td>{fNumber(p.unidades)}</td>
                  <td>{fCurrency(p.revenue)}</td>
                </tr>
              )) : (
                <tr><td colSpan="4" className="table-empty">No hay productos para mostrar con los filtros actuales.</td></tr>
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
