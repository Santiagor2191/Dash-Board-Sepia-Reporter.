import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KPI from "../components/KPI";
import { getClientesContabilidadDashboard, getMetaAdsLive } from "../api";
import { calcDelta, fCurrency, fNumber, MONTHS, ALL_MONTH_VALUES } from "../utils";

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const YEAR_PALETTE = ["#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#fb7185", "#6366f1"];

const formatCompact = (value) => {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
};

const tooltipStyle = {
  background: "var(--glass)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  color: "var(--text)",
  padding: "10px 12px",
  fontSize: 12,
};

const METRIC_OPTIONS = [
  { id: "ventaTotal",      label: "Venta neta" },
  { id: "costoProducto",   label: "Costo producto" },
  { id: "costoPublicidad", label: "Costo publicidad" },
  { id: "utilidadNeta",    label: "Utilidad neta" },
];

const KPI_COMPARISON_OPTIONS = [
  { id: "month", label: "Mes anterior", monthsBack: 1, deltaLabel: "vs mes anterior" },
  { id: "quarter", label: "Trimestre anterior", monthsBack: 3, deltaLabel: "vs trimestre anterior" },
  { id: "year", label: "Año anterior", monthsBack: 12, deltaLabel: "vs año anterior" },
];

const toggleInArray = (arr, value) =>
  arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

const buildPeriodKey = (year, month) => `${year}-${month}`;

const shiftPeriodKey = (year, month, monthsOffset) => {
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + monthsOffset, 1);
  return buildPeriodKey(date.getFullYear(), date.getMonth() + 1);
};

const accumulateTotals = (rows) => rows.reduce(
  (acc, item) => ({
    ventaTotal: acc.ventaTotal + item.ventaTotal,
    costoProducto: acc.costoProducto + item.costoProducto,
    costoPublicidad: acc.costoPublicidad + item.costoPublicidad,
    utilidadNeta: acc.utilidadNeta + item.utilidadNeta,
  }),
  { ventaTotal: 0, costoProducto: 0, costoPublicidad: 0, utilidadNeta: 0 },
);

export default function VentasMetaAds() {
  const [clientesData, setClientesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metric, setMetric] = useState("ventaTotal");
  const [effMetric, setEffMetric] = useState("roas");
  const [kpiComparison, setKpiComparison] = useState("month");

  // null = aún no inicializado (carga inicial). [] = el usuario explícitamente no quiere ninguno.
  const [selectedYears, setSelectedYears] = useState(null);
  const [selectedMonths, setSelectedMonths] = useState(ALL_MONTH_VALUES);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await getClientesContabilidadDashboard();
        if (!cancelled) setClientesData(payload);
      } catch (err) {
        if (!cancelled) setError(err?.message || "No se pudo cargar Datos clientes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Mapas (anio, num_mes) -> valores agregados desde "Datos clientes"
  const ventaPorPeriodo = useMemo(() => {
    const map = new Map();
    (clientesData?.enviosPorMes || []).forEach((row) => {
      if (!row?.periodo) return;
      const [y, m] = row.periodo.split("-");
      const key = `${Number(y)}-${Number(m)}`;
      map.set(key, Number(row.valor_total || 0));
    });
    return map;
  }, [clientesData]);

  const costoPorPeriodo = useMemo(() => {
    const map = new Map();
    (clientesData?.productosPorPeriodo || []).forEach((row) => {
      const anio = Number(row?.anio || 0);
      const numMes = Number(row?.num_mes || 0);
      if (!anio || !numMes) return;
      const key = `${anio}-${numMes}`;
      map.set(key, (map.get(key) || 0) + Number(row?.costo_total || 0));
    });
    return map;
  }, [clientesData]);

  const publicidadPorPeriodo = useMemo(() => {
    const map = new Map();
    (clientesData?.publicidadPorMes || []).forEach((row) => {
      if (!row?.periodo) return;
      const [y, m] = row.periodo.split("-");
      const key = `${Number(y)}-${Number(m)}`;
      map.set(key, Number(row.total_pago || 0));
    });
    return map;
  }, [clientesData]);

  const allRows = useMemo(() => {
    // Unión de meses con cualquier dato (venta, costo o publicidad)
    const keys = new Set([
      ...ventaPorPeriodo.keys(),
      ...costoPorPeriodo.keys(),
      ...publicidadPorPeriodo.keys(),
    ]);

    const rows = [...keys].map((key) => {
      const [yStr, mStr] = key.split("-");
      const anio = Number(yStr);
      const numMes = Number(mStr);

      const ventaTotal = ventaPorPeriodo.get(key) ?? 0;
      const costoProducto = costoPorPeriodo.get(key) ?? 0;
      const costoPublicidad = publicidadPorPeriodo.get(key) ?? 0;
      const utilidadNeta = ventaTotal - costoProducto - costoPublicidad;
      const roas = costoPublicidad > 0 ? ventaTotal / costoPublicidad : 0;
      const inversion = costoProducto + costoPublicidad;
      const roi = inversion > 0 ? (utilidadNeta / inversion) * 100 : 0;
      const margen = ventaTotal > 0 ? (utilidadNeta / ventaTotal) * 100 : 0;

      return {
        anio,
        numMes,
        mesNombre: MONTH_SHORT[numMes - 1] || String(numMes),
        ventaTotal,
        costoProducto,
        costoPublicidad,
        utilidadNeta,
        roas,
        roi,
        margen,
      };
    });

    rows.sort((a, b) => a.anio - b.anio || a.numMes - b.numMes);
    return rows;
  }, [ventaPorPeriodo, costoPorPeriodo, publicidadPorPeriodo]);

  const yearsInData = useMemo(
    () => [...new Set(allRows.map((r) => r.anio))].filter(Boolean).sort((a, b) => a - b),
    [allRows],
  );

  // Inicializar selección de años cuando llegan los datos por primera vez
  useEffect(() => {
    if (yearsInData.length && selectedYears === null) {
      setSelectedYears(yearsInData);
    }
  }, [yearsInData, selectedYears]);

  // Sólo hace fallback durante la carga inicial; tras inicializar respeta lo elegido (incluido vacío)
  const effectiveYears = selectedYears ?? yearsInData;
  const effectiveMonths = selectedMonths;

  const yearsSet = useMemo(() => new Set(effectiveYears), [effectiveYears]);
  const monthsSet = useMemo(() => new Set(effectiveMonths), [effectiveMonths]);

  const filteredRows = useMemo(
    () => allRows.filter((r) => yearsSet.has(r.anio) && monthsSet.has(r.numMes)),
    [allRows, yearsSet, monthsSet],
  );

  const yearsToShow = useMemo(
    () => effectiveYears.filter((y) => yearsInData.includes(y)).sort((a, b) => a - b),
    [effectiveYears, yearsInData],
  );

  const totals = useMemo(() => accumulateTotals(filteredRows), [filteredRows]);

  const roasPromedio = totals.costoPublicidad > 0
    ? totals.ventaTotal / totals.costoPublicidad
    : 0;
  const margenPromedio = totals.ventaTotal > 0
    ? (totals.utilidadNeta / totals.ventaTotal) * 100
    : 0;

  const activeKpiComparison = useMemo(
    () => KPI_COMPARISON_OPTIONS.find((option) => option.id === kpiComparison) ?? KPI_COMPARISON_OPTIONS[0],
    [kpiComparison],
  );

  const rowsByPeriod = useMemo(() => {
    const map = new Map();
    allRows.forEach((row) => {
      map.set(buildPeriodKey(row.anio, row.numMes), row);
    });
    return map;
  }, [allRows]);

  const comparisonRows = useMemo(() => {
    const comparisonKeys = new Set(
      filteredRows.map((row) => shiftPeriodKey(row.anio, row.numMes, -activeKpiComparison.monthsBack)),
    );
    return [...comparisonKeys].map((key) => rowsByPeriod.get(key)).filter(Boolean);
  }, [filteredRows, rowsByPeriod, activeKpiComparison]);

  const comparisonTotals = useMemo(() => accumulateTotals(comparisonRows), [comparisonRows]);

  const comparisonRoasPromedio = comparisonTotals.costoPublicidad > 0
    ? comparisonTotals.ventaTotal / comparisonTotals.costoPublicidad
    : 0;

  const hasComparisonBase = comparisonRows.length > 0;

  const buildKpiDelta = (currentValue, previousValue) => (
    hasComparisonBase ? calcDelta(currentValue, previousValue) : null
  );

  const kpiDeltaText = hasComparisonBase ? null : "Sin base comparativa";

  const kpis = [
    {
      stripeClass: "stripe-a",
      label: "Venta Total",
      value: fCurrency(totals.ventaTotal),
      delta: buildKpiDelta(totals.ventaTotal, comparisonTotals.ventaTotal),
      deltaLabel: activeKpiComparison.deltaLabel,
      deltaText: kpiDeltaText,
    },
    {
      stripeClass: "stripe-b",
      label: "Costo Producto",
      value: fCurrency(totals.costoProducto),
      delta: buildKpiDelta(totals.costoProducto, comparisonTotals.costoProducto),
      deltaLabel: activeKpiComparison.deltaLabel,
      deltaText: kpiDeltaText,
    },
    {
      stripeClass: "stripe-e",
      label: "Costo Publicidad",
      value: fCurrency(totals.costoPublicidad),
      delta: buildKpiDelta(totals.costoPublicidad, comparisonTotals.costoPublicidad),
      deltaLabel: activeKpiComparison.deltaLabel,
      deltaText: kpiDeltaText,
    },
    {
      stripeClass: "stripe-c",
      label: "Utilidad Neta",
      value: fCurrency(totals.utilidadNeta),
      delta: buildKpiDelta(totals.utilidadNeta, comparisonTotals.utilidadNeta),
      deltaLabel: activeKpiComparison.deltaLabel,
      deltaText: kpiDeltaText,
    },
    {
      stripeClass: "stripe-d",
      label: "ROAS Promedio",
      value: `${roasPromedio.toFixed(2)}x`,
      delta: buildKpiDelta(roasPromedio, comparisonRoasPromedio),
      deltaLabel: activeKpiComparison.deltaLabel,
      deltaText: kpiDeltaText,
    },
  ];

  const yoySeries = useMemo(() => {
    const months = MONTHS.filter((m) => monthsSet.has(m.value));
    return months.map(({ value: monthNum, label }) => {
      const point = { mes: label.slice(0, 3) };
      yearsToShow.forEach((year) => {
        const row = filteredRows.find((r) => r.anio === year && r.numMes === monthNum);
        point[`y${year}`] = row ? row[metric] : null;
      });
      return point;
    });
  }, [filteredRows, yearsToShow, monthsSet, metric]);

  const efficiencySeries = useMemo(() => {
    const months = MONTHS.filter((m) => monthsSet.has(m.value));
    return months.map(({ value: monthNum, label }) => {
      const point = { mes: label.slice(0, 3) };
      yearsToShow.forEach((year) => {
        const row = filteredRows.find((r) => r.anio === year && r.numMes === monthNum);
        point[`y${year}`] = row ? row[effMetric] : null;
      });
      return point;
    });
  }, [filteredRows, yearsToShow, monthsSet, effMetric]);

  // Top 10 productos vendidos en el periodo filtrado, datos del Excel "Datos clientes"
  const productosPorPeriodo = useMemo(
    () => (Array.isArray(clientesData?.productosPorPeriodo) ? clientesData.productosPorPeriodo : []),
    [clientesData],
  );

  const topProducts = useMemo(() => {
    const map = new Map();
    productosPorPeriodo.forEach((row) => {
      const anio = Number(row?.anio || 0);
      const mes = Number(row?.num_mes || 0);
      const producto = row?.producto;
      if (!producto || !yearsSet.has(anio) || !monthsSet.has(mes)) return;

      const entry = map.get(producto) || { title: producto, qty: 0, revenue: 0, orders: 0 };
      entry.qty += Number(row?.cantidad || 0);
      entry.revenue += Number(row?.total || 0);
      entry.orders += Number(row?.ordenes || 0);
      map.set(producto, entry);
    });
    return [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 10);
  }, [productosPorPeriodo, yearsSet, monthsSet]);

  const resetFilters = () => {
    setSelectedYears(yearsInData);
    setSelectedMonths(ALL_MONTH_VALUES);
  };

  const filterSummary = (() => {
    if (!filteredRows.length) return "Sin filas";
    const yLabel = yearsToShow.length === yearsInData.length
      ? "Todos los años"
      : yearsToShow.join(", ") || "—";
    const mActive = [...monthsSet].sort((a, b) => a - b);
    const mLabel = mActive.length === ALL_MONTH_VALUES.length
      ? "Todos los meses"
      : mActive.map((n) => MONTH_SHORT[n - 1]).join(", ");
    return `${yLabel} · ${mLabel} · ${filteredRows.length} meses con datos`;
  })();

  if (loading) return <div className="empty-state">Cargando Ventas Meta Ads...</div>;
  if (error) return <div className="empty-state">Error: {error}</div>;
  if (!allRows.length) return <div className="empty-state">No hay datos mensuales para mostrar.</div>;

  const metricLabel = METRIC_OPTIONS.find((m) => m.id === metric)?.label || "Valor";

  return (
    <>
      <MetaAdsLiveSection />

      <section className="panel filter-panel">
        <CompactFilterRow
          label="Años"
          options={yearsInData.map((y) => ({ value: y, label: String(y) }))}
          selected={effectiveYears}
          onToggle={(v) => setSelectedYears((prev) => toggleInArray(prev ?? yearsInData, v))}
          onAll={() => setSelectedYears(yearsInData)}
          onClear={() => setSelectedYears([])}
        />
        <CompactFilterRow
          label="Meses"
          options={MONTHS.map((m) => ({ value: m.value, label: m.label.slice(0, 3) }))}
          selected={effectiveMonths}
          onToggle={(v) => setSelectedMonths((prev) => toggleInArray(prev, v))}
          onAll={() => setSelectedMonths(ALL_MONTH_VALUES)}
          onClear={() => setSelectedMonths([])}
        />
        <div className="filter-row">
          <span className="filter-row-label">Comparar</span>
          <div className="comparison-group comparison-group-compact">
            {KPI_COMPARISON_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`comparison-btn ${kpiComparison === option.id ? "active" : ""}`}
                onClick={() => setKpiComparison(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="filter-row-note">Aplica al porcentaje debajo de cada KPI.</span>
        </div>
        <div className="filter-summary">
          <strong>{filterSummary}</strong>
          <button
            type="button"
            className="filter-mini"
            style={{ float: "right" }}
            onClick={resetFilters}
          >
            restablecer
          </button>
        </div>
      </section>

      {!filteredRows.length ? (
        <div className="empty-state">Sin datos para los filtros seleccionados.</div>
      ) : (
        <>
          <section className="kpi-grid">
            {kpis.map((kpi) => <KPI key={kpi.label} {...kpi} />)}
          </section>

          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>{metricLabel} por mes — comparativa anual</h2>
                <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                  {yearsToShow.length} {yearsToShow.length === 1 ? "año" : "años"} · {filteredRows.length} meses con datos
                </span>
              </div>
              <div className="comparison-group" style={{ flexWrap: "wrap" }}>
                {METRIC_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`comparison-btn ${metric === opt.id ? "active" : ""}`}
                    onClick={() => setMetric(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </header>
            <div style={{ width: "100%", height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yoySeries} margin={{ top: 12, right: 16, left: 8, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="mes" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickFormatter={formatCompact}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [value == null ? "—" : fCurrency(value), name]}
                    cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {yearsToShow.map((year, idx) => (
                    <Bar
                      key={year}
                      dataKey={`y${year}`}
                      name={String(year)}
                      fill={YEAR_PALETTE[idx % YEAR_PALETTE.length]}
                      radius={[6, 6, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel-grid">
            <article className="panel">
              <header className="panel-head">
                <div>
                  <h2>Eficiencia publicitaria — comparativa anual</h2>
                  <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                    {effMetric === "roas" ? "ROAS por mes" : "ROI por mes"}
                  </span>
                </div>
                <div className="comparison-group">
                  <button
                    type="button"
                    className={`comparison-btn ${effMetric === "roas" ? "active" : ""}`}
                    onClick={() => setEffMetric("roas")}
                  >
                    ROAS
                  </button>
                  <button
                    type="button"
                    className={`comparison-btn ${effMetric === "roi" ? "active" : ""}`}
                    onClick={() => setEffMetric("roi")}
                  >
                    ROI
                  </button>
                </div>
              </header>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={efficiencySeries} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="mes" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <YAxis
                      tick={{ fill: "var(--muted)", fontSize: 11 }}
                      tickFormatter={(v) =>
                        effMetric === "roas" ? `${Number(v).toFixed(1)}x` : `${Number(v).toFixed(0)}%`
                      }
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => {
                        if (value == null) return ["—", name];
                        return effMetric === "roas"
                          ? [`${Number(value).toFixed(2)}x`, name]
                          : [`${Number(value).toFixed(1)}%`, name];
                      }}
                      cursor={{ stroke: "rgba(148,163,184,0.3)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {yearsToShow.map((year, idx) => (
                      <Line
                        key={year}
                        type="monotone"
                        dataKey={`y${year}`}
                        name={String(year)}
                        stroke={YEAR_PALETTE[idx % YEAR_PALETTE.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel">
              <header className="panel-head">
                <h2>Resumen del periodo</h2>
                <span>Acumulados</span>
              </header>
              <div className="category-list">
                <SummaryRow label="Margen neto promedio" value={`${margenPromedio.toFixed(1)}%`} />
                <SummaryRow label="ROAS acumulado" value={`${roasPromedio.toFixed(2)}x`} />
                <SummaryRow
                  label="% Costo producto / Venta"
                  value={`${totals.ventaTotal > 0 ? ((totals.costoProducto / totals.ventaTotal) * 100).toFixed(1) : "0.0"}%`}
                />
                <SummaryRow
                  label="% Publicidad / Venta"
                  value={`${totals.ventaTotal > 0 ? ((totals.costoPublicidad / totals.ventaTotal) * 100).toFixed(1) : "0.0"}%`}
                />
                <SummaryRow label="Meses analizados" value={fNumber(filteredRows.length)} />
                <SummaryRow label="Años incluidos" value={yearsToShow.join(", ") || "—"} />
              </div>
            </article>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Top 10 productos más vendidos</h2>
              <span>Datos clientes · periodo seleccionado · ordenados por unidades</span>
            </header>
            {topProducts.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Producto</th>
                      <th style={{ textAlign: "right" }}>Órdenes</th>
                      <th style={{ textAlign: "right" }}>Unidades</th>
                      <th style={{ textAlign: "right" }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, idx) => (
                      <tr key={p.title}>
                        <td style={{ color: "var(--muted)" }}>{idx + 1}</td>
                        <td>{p.title}</td>
                        <td style={{ textAlign: "right" }}>{fNumber(p.orders)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fNumber(p.qty)}</td>
                        <td style={{ textAlign: "right" }}>{fCurrency(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 16 }}>
                {productosPorPeriodo.length
                  ? "No hay productos vendidos en el periodo filtrado."
                  : "No se pudieron cargar los datos de clientes (Excel)."}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

// --- Selector de fechas estilo Meta Ads Manager ---

const fmtYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const buildDateRanges = () => {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // lunes de esta semana
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const lastSunday = new Date(monday);
  lastSunday.setDate(monday.getDate() - 1);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { id: "hoy", label: "Hoy", since: fmtYmd(today), until: fmtYmd(today) },
    { id: "ayer", label: "Ayer", since: fmtYmd(daysAgo(1)), until: fmtYmd(daysAgo(1)) },
    { id: "7d", label: "Últimos 7 días", since: fmtYmd(daysAgo(6)), until: fmtYmd(today) },
    { id: "14d", label: "Últimos 14 días", since: fmtYmd(daysAgo(13)), until: fmtYmd(today) },
    { id: "28d", label: "Últimos 28 días", since: fmtYmd(daysAgo(27)), until: fmtYmd(today) },
    { id: "30d", label: "Últimos 30 días", since: fmtYmd(daysAgo(29)), until: fmtYmd(today) },
    { id: "90d", label: "Últimos 90 días", since: fmtYmd(daysAgo(89)), until: fmtYmd(today) },
    { id: "semana", label: "Esta semana", since: fmtYmd(monday), until: fmtYmd(today) },
    { id: "semana_pasada", label: "La semana pasada", since: fmtYmd(lastMonday), until: fmtYmd(lastSunday) },
    { id: "mes", label: "Este mes", since: fmtYmd(firstOfMonth), until: fmtYmd(today) },
    { id: "mes_pasado", label: "El mes pasado", since: fmtYmd(firstOfLastMonth), until: fmtYmd(endOfLastMonth) },
  ];
};

const prettyDate = (ymd) => {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]?.toLowerCase() || m} ${y}`;
};

function MetaDateRangePicker({ range, onApply }) {
  const presets = useMemo(buildDateRanges, []);
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState(range.presetId);
  const [draftSince, setDraftSince] = useState(range.since);
  const [draftUntil, setDraftUntil] = useState(range.until);

  const openPanel = () => {
    setDraftPreset(range.presetId);
    setDraftSince(range.since);
    setDraftUntil(range.until);
    setOpen(true);
  };

  const pickPreset = (preset) => {
    setDraftPreset(preset.id);
    setDraftSince(preset.since);
    setDraftUntil(preset.until);
  };

  const apply = () => {
    if (!draftSince || !draftUntil || draftSince > draftUntil) return;
    const preset = presets.find(
      (p) => p.id === draftPreset && p.since === draftSince && p.until === draftUntil,
    );
    onApply({
      presetId: preset ? preset.id : "personalizado",
      label: preset ? preset.label : "Personalizado",
      since: draftSince,
      until: draftUntil,
    });
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="comparison-btn active" onClick={openPanel}>
        {range.label} · {prettyDate(range.since)} – {prettyDate(range.until)} ▾
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              zIndex: 50,
              display: "flex",
              gap: 14,
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "var(--glass)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
              minWidth: 380,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto", paddingRight: 6 }}>
              {presets.map((preset) => {
                const active = draftPreset === preset.id && draftSince === preset.since && draftUntil === preset.until;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => pickPreset(preset)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      background: active ? "rgba(148,163,184,0.16)" : "transparent",
                      color: "var(--text)",
                      fontSize: "0.82rem",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        border: active ? "4px solid #0ea5e9" : "2px solid var(--muted)",
                        flexShrink: 0,
                      }}
                    />
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>Rango personalizado</span>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", color: "var(--muted)" }}>
                  Desde
                  <input
                    type="date"
                    value={draftSince}
                    max={draftUntil || undefined}
                    onChange={(e) => { setDraftSince(e.target.value); setDraftPreset("personalizado"); }}
                    style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", colorScheme: "dark" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", color: "var(--muted)" }}>
                  Hasta
                  <input
                    type="date"
                    value={draftUntil}
                    min={draftSince || undefined}
                    max={fmtYmd(new Date())}
                    onChange={(e) => { setDraftUntil(e.target.value); setDraftPreset("personalizado"); }}
                    style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", colorScheme: "dark" }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="filter-mini" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="button" className="comparison-btn active" onClick={apply}>Actualizar</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const DEFAULT_LIVE_RANGE = () => ({
  presetId: "30d",
  label: "Últimos 30 días",
  since: fmtYmd(daysAgo(29)),
  until: fmtYmd(new Date()),
});

// Sección "en vivo": métricas reales de la cuenta publicitaria (API de Meta)
// + recomendaciones generadas por la propia IA de Meta. Independiente de los filtros del Excel.
function MetaAdsLiveSection() {
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(DEFAULT_LIVE_RANGE);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMetaAdsLive(range.since, range.until)
      .then((payload) => { if (!cancelled) setLive(payload); })
      .catch((err) => { if (!cancelled) setLive({ error: err?.message || "No se pudo consultar Meta." }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.since, range.until]);

  const anuncios = useMemo(() => {
    const rows = Array.isArray(live?.anuncios) ? [...live.anuncios] : [];
    // Mejor costo por pedido primero; sin pedidos al final
    rows.sort((a, b) => (a.costo_pedido ?? Infinity) - (b.costo_pedido ?? Infinity));
    return rows;
  }, [live]);

  const header = (
    <header className="panel-head">
      <div>
        <h2>Campañas Meta en vivo</h2>
        <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
          API de Meta · {prettyDate(range.since)} – {prettyDate(range.until)} · campañas Click-to-WhatsApp
        </span>
      </div>
      <MetaDateRangePicker range={range} onApply={setRange} />
    </header>
  );

  if (loading) {
    return (
      <section className="panel">
        {header}
        <div className="empty-state" style={{ padding: 16 }}>Consultando campañas en Meta...</div>
      </section>
    );
  }
  if (!live) return null;

  if (live.configured === false || live.error) {
    return (
      <section className="panel">
        {header}
        <div className="empty-state" style={{ padding: 16 }}>{live.mensaje || live.error}</div>
      </section>
    );
  }

  const totalGasto = anuncios.reduce((acc, a) => acc + a.gasto, 0);
  const totalConv = anuncios.reduce((acc, a) => acc + a.conversaciones, 0);
  const totalPedidos = anuncios.reduce((acc, a) => acc + a.pedidos, 0);
  const totalClicks = anuncios.reduce((acc, a) => acc + a.clicks, 0);
  const totalImpresiones = anuncios.reduce((acc, a) => acc + a.impresiones, 0);

  const kpisLive = [
    { label: "Gasto", value: fCurrency(totalGasto) },
    { label: "Conversaciones", value: fNumber(totalConv) },
    { label: "Costo x Conversación", value: totalConv > 0 ? fCurrency(totalGasto / totalConv) : "—" },
    { label: "Pedidos", value: fNumber(totalPedidos) },
    { label: "Costo x Pedido", value: totalPedidos > 0 ? fCurrency(totalGasto / totalPedidos) : "—" },
    { label: "CTR promedio", value: totalImpresiones > 0 ? `${((totalClicks / totalImpresiones) * 100).toFixed(2)}%` : "—" },
  ].map((kpi) => ({ ...kpi, deltaText: range.label }));

  // Alerta: Meta reparte presupuesto hacia el CPM barato, no hacia el que más cierra.
  // Señal: un anuncio concentra >40% del gasto con costo/pedido >2x el mejor del grupo.
  const mejor = anuncios.find((a) => a.costo_pedido != null);
  const desalineado = mejor
    ? anuncios.find((a) =>
        totalGasto > 0 &&
        a.gasto / totalGasto > 0.4 &&
        a.ad_id !== mejor.ad_id &&
        (a.costo_pedido == null || a.costo_pedido > mejor.costo_pedido * 2))
    : null;

  const recomendaciones = Array.isArray(live.recomendaciones) ? live.recomendaciones : [];

  return (
    <>
      <section className="panel">
        {header}

        <section className="kpi-grid" style={{ marginBottom: 16 }}>
          {kpisLive.map((kpi) => <KPI key={kpi.label} {...kpi} />)}
        </section>

        {desalineado && (
          <div
            className="empty-state"
            style={{
              padding: 14,
              marginBottom: 14,
              border: "1px solid #f59e0b",
              borderRadius: 12,
              color: "var(--text)",
            }}
          >
            ⚠️ <strong>{desalineado.anuncio}</strong> concentra el{" "}
            {((desalineado.gasto / totalGasto) * 100).toFixed(0)}% del gasto pero su costo por pedido
            {" "}es {desalineado.costo_pedido == null ? "indefinido (0 pedidos)" : `${fCurrency(desalineado.costo_pedido)}`},
            {" "}mucho peor que <strong>{mejor.anuncio}</strong> ({fCurrency(mejor.costo_pedido)}).
            {" "}Meta reparte el presupuesto hacia el CPM barato, no hacia el que más vende — considera pausar el anuncio ineficiente.
          </div>
        )}

        {anuncios.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Anuncio</th>
                  <th style={{ textAlign: "right" }}>% Gasto</th>
                  <th style={{ textAlign: "right" }}>Gasto</th>
                  <th style={{ textAlign: "right" }}>CTR</th>
                  <th style={{ textAlign: "right" }}>Frecuencia</th>
                  <th style={{ textAlign: "right" }}>Conversaciones</th>
                  <th style={{ textAlign: "right" }}>Costo x Conv.</th>
                  <th style={{ textAlign: "right" }}>Pedidos</th>
                  <th style={{ textAlign: "right" }}>Costo x Pedido</th>
                </tr>
              </thead>
              <tbody>
                {anuncios.map((a) => (
                  <tr key={a.ad_id}>
                    <td>
                      {a.anuncio}
                      <div style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{a.campana}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {totalGasto > 0 ? `${((a.gasto / totalGasto) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>{fCurrency(a.gasto)}</td>
                    <td style={{ textAlign: "right" }}>{`${Number(a.ctr).toFixed(2)}%`}</td>
                    <td style={{ textAlign: "right", color: a.frecuencia > 3 ? "#f87171" : undefined }}>
                      {a.frecuencia ? a.frecuencia.toFixed(1) : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>{fNumber(a.conversaciones)}</td>
                    <td style={{ textAlign: "right" }}>{a.costo_conversacion != null ? fCurrency(a.costo_conversacion) : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fNumber(a.pedidos)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{a.costo_pedido != null ? fCurrency(a.costo_pedido) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 16 }}>Sin anuncios con actividad en el periodo seleccionado.</div>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Recomendaciones de la IA de Meta</h2>
          <span>Generadas por Meta para tus campañas activas</span>
        </header>
        {recomendaciones.length ? (
          <div className="category-list">
            {recomendaciones.map((rec, idx) => (
              <div className="category-item" key={`${rec.objeto}-${idx}`}>
                <div className="category-label-row">
                  <span style={{ fontWeight: 600 }}>{rec.titulo || "Recomendación"}</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{rec.objeto}</span>
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "4px 0 0" }}>{rec.mensaje}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 16 }}>
            Meta no tiene recomendaciones pendientes para tus campañas activas ahora mismo. Eso suele ser buena señal.
          </div>
        )}
      </section>
    </>
  );
}

function CompactFilterRow({ label, options, selected, onToggle, onAll, onClear }) {
  return (
    <div className="filter-row">
      <span className="filter-row-label">{label}</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`filter-chip ${selected.includes(opt.value) ? "active" : ""}`}
          onClick={() => onToggle(opt.value)}
        >
          {opt.label}
        </button>
      ))}
      <div className="filter-row-actions">
        <button type="button" className="filter-mini" onClick={onAll}>todos</button>
        <button type="button" className="filter-mini" onClick={onClear}>ninguno</button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="category-item">
      <div className="category-label-row">
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value}</span>
      </div>
    </div>
  );
}
