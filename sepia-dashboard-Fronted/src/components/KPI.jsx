export default function KPI({ stripeClass, label, value, delta, deltaLabel = "", deltaText = null }) {
  const hasNumericDelta = Number.isFinite(delta);
  const trendClass = hasNumericDelta
    ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat")
    : "flat";
  const baseText = hasNumericDelta
    ? (delta > 0 ? `+${delta.toFixed(1)}%` : delta < 0 ? `${delta.toFixed(1)}%` : "0.0%")
    : "Sin base comparativa";
  const text = deltaText ?? (deltaLabel ? `${baseText} ${deltaLabel}` : baseText);
  return (
    <article className={`kpi-card ${stripeClass}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-delta ${trendClass}`}>{text}</div>
    </article>
  );
}
