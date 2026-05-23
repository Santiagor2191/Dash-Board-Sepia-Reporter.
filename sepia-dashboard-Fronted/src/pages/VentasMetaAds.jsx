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
import { getClientesContabilidadDashboard } from "../api";
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
