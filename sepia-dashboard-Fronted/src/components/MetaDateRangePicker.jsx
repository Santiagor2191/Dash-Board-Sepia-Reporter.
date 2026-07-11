import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtYmd, daysAgo, prettyDate } from "../utils";

// Selector de rango de fechas estilo Meta Ads Manager:
// lista de presets + rango personalizado, con Cancelar/Actualizar.

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

export default function MetaDateRangePicker({ range, onApply, extraPresets = [] }) {
  const presets = useMemo(
    () => [...buildDateRanges(), ...extraPresets],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState(range.presetId);
  const [draftSince, setDraftSince] = useState(range.since);
  const [draftUntil, setDraftUntil] = useState(range.until);
  const btnRef = useRef(null);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 8 });

  const openPanel = () => {
    // El panel se monta en document.body (portal) para quedar por encima de
    // cualquier tarjeta; se ancla a la posición del botón al abrirlo.
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPanelPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
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
      <button ref={btnRef} type="button" className="comparison-btn active" onClick={openPanel}>
        {range.label} · {prettyDate(range.since)} – {prettyDate(range.until)} ▾
      </button>

      {open && createPortal(
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              right: panelPos.right,
              top: panelPos.top,
              zIndex: 1000,
              display: "flex",
              gap: 14,
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--glass-border)",
              background: "var(--bg)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
              minWidth: 380,
              maxWidth: "calc(100vw - 16px)",
              flexWrap: "wrap",
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
        </>,
        document.body,
      )}
    </div>
  );
}
