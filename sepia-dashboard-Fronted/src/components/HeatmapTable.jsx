// Tabla genérica con heatmap por columna (no por fila): cada columna marcada
// heatmap:true se colorea según el valor relativo DENTRO de esa columna, así
// se pueden comparar métricas de escalas distintas (ej. Reach vs. Engagement)
// de un vistazo. Mismo patrón visto en la demo de MB Suite.
//
// columns: [{ key, label, heatmap?, align?, render?(value, row) }]
// rows: array de objetos, cada uno debe tener la propiedad `key` (o pasar getRowKey)

const clampIntensity = (value, min, max) => {
  if (min === max) return 45; // una sola fila (o todas iguales) -> color plano, sin división por cero
  const ratio = (value - min) / (max - min);
  // 12%-60% para que hasta el valor más bajo se note como celda de heatmap,
  // y el más alto no quede ilegible por exceso de saturación.
  return 12 + ratio * 48;
};

const computeRanges = (columns, rows) => {
  const ranges = {};
  columns.forEach((col) => {
    if (!col.heatmap) return;
    const valores = rows
      .map((row) => row[col.key])
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    ranges[col.key] = valores.length
      ? { min: Math.min(...valores), max: Math.max(...valores) }
      : null;
  });
  return ranges;
};

export default function HeatmapTable({
  columns,
  rows,
  getRowKey = (row) => row.key,
  emptyMessage = "Sin datos todavía.",
}) {
  if (!rows || rows.length === 0) {
    return <div className="table-empty">{emptyMessage}</div>;
  }

  const ranges = computeRanges(columns, rows);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.align === "right" ? { textAlign: "right" } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((col) => {
                const value = row[col.key];
                const range = col.heatmap ? ranges[col.key] : null;
                const isNumeric = typeof value === "number" && Number.isFinite(value);
                const style = { ...(col.align === "right" ? { textAlign: "right" } : {}) };
                if (range && isNumeric) {
                  const intensity = clampIntensity(value, range.min, range.max);
                  style.backgroundColor = `color-mix(in srgb, var(--accent) ${intensity}%, transparent)`;
                }
                return (
                  <td key={col.key} style={style}>
                    {col.render ? col.render(value, row) : isNumeric ? value : (value ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
