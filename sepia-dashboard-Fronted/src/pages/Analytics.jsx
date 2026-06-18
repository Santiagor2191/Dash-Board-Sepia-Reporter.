import { useMemo, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import KPI from "../components/KPI";
import { getInteligencia } from "../api";
import { fCurrency, fNumber, getPeriodStart, getPeriodLabel, exportToCsv, isRealProduct } from "../utils";

export default function Analytics() {
  const { filteredAll, appliedComparison } = useOutletContext();

  // Inteligencia de negocio (calculada en el backend: ultimos 3 meses vs 3 anteriores).
  // Es global, no depende de los filtros de arriba.
  const [intel, setIntel] = useState(null);
  const [intelError, setIntelError] = useState(false);
  useEffect(() => {
    let active = true;
    getInteligencia()
      .then((data) => { if (active) setIntel(data); })
      .catch(() => { if (active) setIntelError(true); });
    return () => { active = false; };
  }, []);

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
      if (!isRealProduct(title)) return;
      if (!map[title]) map[title] = { title, revenue: 0, qty: 0, orders: 0 };
      map[title].revenue += o.amount;
      map[title].qty += o.qty;
      map[title].orders += 1;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filteredAll]);

  // Devoluciones y cancelaciones (órdenes que no se concretaron)
  const devoluciones = useMemo(() => {
    const cancelled = filteredAll.filter((o) => o.status === "cancelled");
    const tasa = filteredAll.length ? (cancelled.length / filteredAll.length) * 100 : 0;
    const map = {};
    filteredAll.forEach((o) => {
      const t = o.item.title;
      if (!map[t]) map[t] = { producto: t, total: 0, canceladas: 0 };
      map[t].total += 1;
      if (o.status === "cancelled") map[t].canceladas += 1;
    });
    const porProducto = Object.values(map)
      .filter((p) => p.canceladas > 0)
      .map((p) => ({ ...p, tasa: (p.canceladas / p.total) * 100 }))
      .sort((a, b) => b.canceladas - a.canceladas)
      .slice(0, 10);
    return { count: cancelled.length, total: filteredAll.length, tasa, porProducto };
  }, [filteredAll]);

  // Clientes que repiten (solo compradores identificables; ignora los anónimos)
  const clientes = useMemo(() => {
    const map = {};
    filteredAll.forEach((o) => {
      const b = o.buyer;
      if (!b || b.startsWith("buyer-")) return;
      if (!map[b]) map[b] = { cliente: b, compras: 0, revenue: 0 };
      map[b].compras += 1;
      map[b].revenue += o.amount;
    });
    const lista = Object.values(map);
    const total = lista.length;
    const repiten = lista.filter((c) => c.compras >= 2).length;
    const tasaRepeticion = total ? (repiten / total) * 100 : 0;
    const top = [...lista].sort((a, b) => b.compras - a.compras || b.revenue - a.revenue).slice(0, 10);
    return { total, repiten, tasaRepeticion, top };
  }, [filteredAll]);

  // Metricas globales
  const totalRevenue = filteredAll.reduce((s, o) => s + o.amount, 0);
  const totalQty = filteredAll.reduce((s, o) => s + o.qty, 0);
  // Mismo cálculo que la página principal: bruto de TODAS las órdenes, y ticket = bruto / órdenes.
  const totalIngresado = filteredAll.reduce((s, o) => s + (o.paidAmount || 0), 0);
  const avgTicket = filteredAll.length ? totalIngresado / filteredAll.length : 0;
  const conversionRate = filteredAll.length ? (paidOrders.length / filteredAll.length) * 100 : 0;

  const maxEstacional = Math.max(...(intel?.estacionalidad?.map((e) => e.revenue) || []), 1);
  const maxCiudadRev = Math.max(...(intel?.ciudadesRentables?.map((c) => c.revenue) || []), 1);

  return (
    <>
      <section className="kpi-grid">
        <KPI stripeClass="stripe-a" label="Ingresos Sepia" value={fCurrency(totalRevenue)} delta={0} />
        <KPI stripeClass="stripe-b" label="Precio de Venta" value={fCurrency(totalIngresado)} delta={0} />
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

      <section className="panel-grid">
        <article className="panel">
          <header className="panel-head">
            <h2>Devoluciones y cancelaciones</h2>
            <span>{devoluciones.tasa.toFixed(1)}% del periodo</span>
          </header>
          <div className="summary-cards">
            <div className="mini-card"><div>Canceladas</div><strong>{fNumber(devoluciones.count)}</strong></div>
            <div className="mini-card"><div>Total órdenes</div><strong>{fNumber(devoluciones.total)}</strong></div>
            <div className="mini-card"><div>Tasa</div><strong>{devoluciones.tasa.toFixed(1)}%</strong></div>
          </div>
          {devoluciones.porProducto.length ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Producto que más se cancela/devuelve</th><th style={{ textAlign: "center" }}>Veces</th><th style={{ textAlign: "center" }}>Tasa</th></tr></thead>
                <tbody>
                  {devoluciones.porProducto.map((p) => (
                    <tr key={p.producto}>
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.producto}</td>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{p.canceladas}</td>
                      <td style={{ textAlign: "center" }}><span className="kpi-delta down">{p.tasa.toFixed(0)}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state" style={{ marginTop: 12 }}>Sin cancelaciones en el periodo. 👍</div>}
        </article>

        <article className="panel">
          <header className="panel-head">
            <h2>Clientes que repiten</h2>
            <span>{clientes.tasaRepeticion.toFixed(1)}% recompra</span>
          </header>
          <div className="summary-cards">
            <div className="mini-card"><div>Clientes únicos</div><strong>{fNumber(clientes.total)}</strong></div>
            <div className="mini-card"><div>Repiten (2+)</div><strong>{fNumber(clientes.repiten)}</strong></div>
            <div className="mini-card"><div>Recompra</div><strong>{clientes.tasaRepeticion.toFixed(1)}%</strong></div>
          </div>
          {clientes.top.length ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Mejores clientes</th><th style={{ textAlign: "center" }}>Compras</th><th>Total</th></tr></thead>
                <tbody>
                  {clientes.top.map((c) => (
                    <tr key={c.cliente}>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.cliente}</td>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{c.compras}</td>
                      <td>{fCurrency(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state" style={{ marginTop: 12 }}>Sin clientes identificables en el periodo.</div>}
        </article>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Inteligencia del negocio</h2>
          <span>Últimos 3 meses vs 3 anteriores · no usa los filtros de arriba</span>
        </header>
        {intelError ? (
          <div className="empty-state">No se pudo cargar la inteligencia. Revisa la conexión con el servidor.</div>
        ) : !intel ? (
          <div className="empty-state">Cargando inteligencia…</div>
        ) : null}
      </section>

      {intel && (
        <>
          <section className="panel">
            <header className="panel-head">
              <h2>Estacionalidad — venta promedio por mes</h2>
              <span>En qué meses vendes más</span>
            </header>
            {intel.estacionalidad?.length ? (
              <div className="bar-chart">
                {intel.estacionalidad.map((m) => (
                  <div key={m.num_mes} className="bar-col">
                    <span className="bar-value">{fCurrency(m.revenue)}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max((m.revenue / maxEstacional) * 120, 6)}px` }} /></div>
                    <span className="bar-label">{m.mes}</span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state">Sin datos suficientes.</div>}
          </section>

          <section className="panel-grid">
            <article className="panel">
              <header className="panel-head">
                <h2>Productos en caída</h2>
                <span>Venían bien y están bajando</span>
              </header>
              {intel.productosEnCaida?.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Antes</th><th>Ahora</th><th>Cambio</th></tr></thead>
                    <tbody>
                      {intel.productosEnCaida.map((p) => (
                        <tr key={p.producto}>
                          <td>{p.producto}</td>
                          <td>{fCurrency(p.revenue_anterior)}</td>
                          <td>{fCurrency(p.revenue_actual)}</td>
                          <td><span className="kpi-delta down">{p.cambio.toFixed(0)}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty-state">Ningún producto en caída. 👍</div>}
            </article>

            <article className="panel">
              <header className="panel-head">
                <h2>Ciudades top</h2>
                <span>De dónde son tus compradores</span>
              </header>
              {intel.ciudadesRentables?.length ? (
                <div className="category-list">
                  {intel.ciudadesRentables.map((c) => (
                    <div key={c.ciudad} className="category-item">
                      <div className="category-label-row"><span>{c.ciudad} <small style={{ opacity: 0.6 }}>({c.porcentaje}%)</small></span><span>{fCurrency(c.revenue)}</span></div>
                      <div className="category-track"><div className="category-fill" style={{ width: `${(c.revenue / maxCiudadRev) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              ) : <div className="empty-state">Sin datos de ciudad.</div>}
            </article>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Combos — productos que se compran juntos</h2>
              <span>Ideas para armar paquetes y subir el ticket</span>
            </header>
            {intel.crossSell?.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Producto A</th><th>Producto B</th><th>Veces juntos</th><th>Venta combinada</th></tr></thead>
                  <tbody>
                    {intel.crossSell.map((c) => (
                      <tr key={`${c.producto_a}-${c.producto_b}`}>
                        <td>{c.producto_a}</td>
                        <td>{c.producto_b}</td>
                        <td>{fNumber(c.veces)}</td>
                        <td>{fCurrency(c.revenue_combinado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state">Aún no hay patrones de compra conjunta.</div>}
          </section>
        </>
      )}
    </>
  );
}
