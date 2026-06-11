import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import KPI from "../components/KPI";
import {
  getRentabilidadResumen,
  getRentabilidadEstructuraCostos,
  getRentabilidadTopRentables,
  getRentabilidadConPerdida,
  getRentabilidadPremiumVsClasica,
  getRentabilidadCostoPorVentas,
} from "../api";
import { fCurrency, fNumber, exportToCsv } from "../utils";

const PIE_COLORS = ["#0ea5e9", "#f59e0b", "#14b8a6", "#ef4444", "#8b5cf6", "#ec4899", "#22c55e"];

const COST_LABELS = {
  pct_costo_producto: "Costo Producto",
  pct_comision_ml: "Comision ML",
  pct_envio: "Envio",
  pct_publicidad: "Publicidad",
  pct_financieros: "Financieros",
  pct_impuestos: "Impuestos",
  pct_margen_neto: "Margen Neto",
};

export default function Rentabilidad() {
  const [resumen, setResumen] = useState(null);
  const [costos, setCostos] = useState(null);
  const [topRentables, setTopRentables] = useState([]);
  const [conPerdida, setConPerdida] = useState([]);
  const [premiumVsClasica, setPremiumVsClasica] = useState([]);
  const [costoPorVentas, setCostoPorVentas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [res, est, top, perd, pvc, cpv] = await Promise.all([
          getRentabilidadResumen(),
          getRentabilidadEstructuraCostos(),
          getRentabilidadTopRentables(),
          getRentabilidadConPerdida(),
          getRentabilidadPremiumVsClasica(),
          getRentabilidadCostoPorVentas(),
        ]);
        if (cancelled) return;
        setResumen(res);
        setCostos(est);
        setTopRentables(top?.items || []);
        setConPerdida(perd?.items || []);
        setPremiumVsClasica(pvc?.items || []);
        setCostoPorVentas(cpv);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Error cargando datos de rentabilidad");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="empty-state">Cargando rentabilidad...</div>;
  if (error) return <div className="empty-state">Error: {error}</div>;

  const pieData = costos
    ? Object.entries(COST_LABELS)
        .filter(([key]) => key !== "pct_margen_neto")
        .map(([key, label]) => ({ name: label, value: Math.abs(costos[key] || 0) }))
        .filter((d) => d.value > 0)
    : [];

  return (
    <>
      {/* KPI Costo por Ventas - ultimos 30 dias */}
      {costoPorVentas && (
        <section className="kpi-grid">
          <KPI stripeClass="stripe-a" label="Ingreso Total (30d)" value={fCurrency(costoPorVentas.ingreso_total)} delta={0} />
          <KPI stripeClass="stripe-b" label="Costo Productos (30d)" value={fCurrency(costoPorVentas.costo_total_productos_vendidos)} delta={0} />
          <KPI stripeClass="stripe-c" label="Utilidad Real (30d)" value={fCurrency(costoPorVentas.utilidad_real_total)} delta={0} />
          <KPI stripeClass="stripe-d" label="Margen Real (30d)" value={`${costoPorVentas.margen_real}%`} delta={0} />
        </section>
      )}

      {/* Resumen general de publicaciones */}
      {resumen && (
        <section className="kpi-grid">
          <KPI stripeClass="stripe-a" label="Publicaciones Activas" value={fNumber(resumen.publicaciones_activas)} delta={0} />
          <KPI stripeClass="stripe-b" label="Rentables" value={fNumber(resumen.rentables)} delta={0} />
          <KPI stripeClass="stripe-c" label="Con Perdida" value={fNumber(resumen.con_perdida)} delta={0} />
          <KPI stripeClass="stripe-d" label="Utilidad Promedio" value={fCurrency(resumen.utilidad_promedio)} delta={0} />
          <KPI stripeClass="stripe-e" label="Utilidad Total Potencial" value={fCurrency(resumen.utilidad_total_potencial)} delta={0} />
        </section>
      )}

      {/* Estructura de costos - Pie chart */}
      <section className="panel">
        <header className="panel-head">
          <h2>Estructura de Costos</h2>
          <span>% sobre precio de venta</span>
        </header>
        {pieData.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
            <div style={{ flex: "1 1 340px", minHeight: 300 }}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, value }) => `${name} ${value}%`}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val) => `${val}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {costos && (
              <div style={{ flex: "0 0 auto" }}>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Concepto</th><th>%</th></tr></thead>
                    <tbody>
                      {Object.entries(COST_LABELS).map(([key, label]) => (
                        <tr key={key} style={key === "pct_margen_neto" ? { fontWeight: 700 } : undefined}>
                          <td>{label}</td>
                          <td>{costos[key]}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : <div className="empty-state">Sin datos de estructura de costos.</div>}
      </section>

      {/* Top 10 mas rentables */}
      <section className="panel">
        <header className="panel-head">
          <h2>Top 10 Mas Rentables</h2>
          <div className="panel-head-actions">
            <span>Por utilidad</span>
            <button type="button" className="btn btn-muted btn-xs" onClick={() => exportToCsv(
              "top-rentables.csv",
              ["ID", "Titulo", "Precio Venta COP", "Utilidad COP", "Margen %"],
              topRentables.map((p) => [p.id_publicaciones, p.titulo, p.precio_venta_real, p.utilidad_sepia, p.margen_pct])
            )}>↓ CSV</button>
          </div>
        </header>
        {topRentables.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titulo</th>
                  <th>Precio Venta</th>
                  <th>Utilidad</th>
                  <th>Margen %</th>
                </tr>
              </thead>
              <tbody>
                {topRentables.map((p) => (
                  <tr key={p.id_publicaciones}>
                    <td>{p.id_publicaciones}</td>
                    <td>{p.titulo}</td>
                    <td>{fCurrency(p.precio_venta_real)}</td>
                    <td style={{ color: "#22c55e" }}>{fCurrency(p.utilidad_sepia)}</td>
                    <td>{p.margen_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">Sin datos de productos rentables.</div>}
      </section>

      {/* Productos con perdida */}
      <section className="panel">
        <header className="panel-head">
          <h2>Productos con Perdida</h2>
          <div className="panel-head-actions">
            <span>{conPerdida.length} productos</span>
            {conPerdida.length > 0 && (
              <button type="button" className="btn btn-muted btn-xs" onClick={() => exportToCsv(
                "productos-con-perdida.csv",
                ["ID", "Titulo", "Precio Venta COP", "Costo Total COP", "Utilidad COP"],
                conPerdida.map((p) => [p.id_publicaciones, p.titulo, p.precio_venta_real, p.costo_total, p.utilidad_sepia])
              )}>↓ CSV</button>
            )}
          </div>
        </header>
        {conPerdida.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titulo</th>
                  <th>Precio Venta</th>
                  <th>Costo Total</th>
                  <th>Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {conPerdida.map((p) => (
                  <tr key={p.id_publicaciones}>
                    <td>{p.id_publicaciones}</td>
                    <td>{p.titulo}</td>
                    <td>{fCurrency(p.precio_venta_real)}</td>
                    <td>{fCurrency(p.costo_total)}</td>
                    <td style={{ color: "#ef4444" }}>{fCurrency(p.utilidad_sepia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No hay productos con perdida.</div>}
      </section>

      {/* Premium vs Clasica - bar chart */}
      <section className="panel">
        <header className="panel-head"><h2>Premium vs Clasica</h2><span>Comparacion por tipo de publicacion</span></header>
        {premiumVsClasica.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
            <div style={{ flex: "1 1 400px", minHeight: 300 }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={premiumVsClasica}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="tipo_de_publicacion" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(val) => fCurrency(val)} />
                  <Legend />
                  <Bar dataKey="utilidad_promedio" name="Utilidad Promedio" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="utilidad_total" name="Utilidad Total" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Tipo</th><th>Cantidad</th><th>Util. Promedio</th><th>Util. Total</th></tr></thead>
                  <tbody>
                    {premiumVsClasica.map((r) => (
                      <tr key={r.tipo_de_publicacion}>
                        <td>{r.tipo_de_publicacion}</td>
                        <td>{fNumber(r.cantidad)}</td>
                        <td>{fCurrency(r.utilidad_promedio)}</td>
                        <td>{fCurrency(r.utilidad_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : <div className="empty-state">Sin datos de comparacion por tipo.</div>}
      </section>
    </>
  );
}
