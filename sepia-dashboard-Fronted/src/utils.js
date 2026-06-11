export const MONTHS = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" }, { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" }, { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" }, { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" }, { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

export const COMPARISON_OPTIONS = [
  { id: "month", label: "Mensual" },
  { id: "quarter", label: "Trimestral" },
  { id: "year", label: "Anual" },
];

export const ALL_MONTH_VALUES = MONTHS.map((m) => m.value);
export const MOBILE_BREAKPOINT = 960;

export const fCurrency = (n) => `$ ${Math.round(n || 0).toLocaleString("es-CO")}`;
export const fNumber = (n) => (n || 0).toLocaleString("es-CO");
export const fDate = (d) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
export const fMonthLabel = (year, month) => new Date(year, month - 1, 1).toLocaleDateString("es-CO", { month: "short", year: "numeric" }).replace(".", "");
export const fQuarterLabel = (date) => `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;

export const getPeriodStart = (value, comparison) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  if (comparison === "quarter") { date.setMonth(Math.floor(date.getMonth() / 3) * 3, 1); return date; }
  if (comparison === "year") { date.setMonth(0, 1); return date; }
  date.setDate(1);
  return date;
};

export const addPeriods = (value, amount, comparison) => {
  const date = getPeriodStart(value, comparison);
  if (comparison === "quarter") { date.setMonth(date.getMonth() + amount * 3, 1); return date; }
  if (comparison === "year") { date.setFullYear(date.getFullYear() + amount, 0, 1); return date; }
  date.setMonth(date.getMonth() + amount, 1);
  return date;
};

export const getPeriodLabel = (value, comparison) => {
  const date = getPeriodStart(value, comparison);
  if (comparison === "quarter") return fQuarterLabel(date);
  if (comparison === "year") return String(date.getFullYear());
  return fMonthLabel(date.getFullYear(), date.getMonth() + 1);
};

export const calcDelta = (currentValue, previousValue) => {
  if (!currentValue && !previousValue) return 0;
  if (!previousValue) return currentValue ? 100 : 0;
  return ((currentValue - previousValue) / previousValue) * 100;
};

export const getOrderTone = (status) => {
  if (status === "paid") return "paid";
  if (status === "cancelled") return "cancelled";
  return "pending";
};

// Exporta a CSV con BOM UTF-8 para que Excel abra acentos correctamente
export const exportToCsv = (filename, headers, rows) => {
  const escape = (val) => {
    const s = String(val ?? "").replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(","));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
