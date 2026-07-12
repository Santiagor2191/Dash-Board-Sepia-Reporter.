import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KPI from "../components/KPI";
import MetaDateRangePicker from "../components/MetaDateRangePicker";
import { getMetaRedes } from "../api";
import { fNumber, fmtYmd, daysAgo, prettyDate } from "../utils";

const DEFAULT_RANGE = () => ({
  presetId: "30d",
  label: "Últimos 30 días",
  since: fmtYmd(daysAgo(29)),
  until: fmtYmd(new Date()),
});

const tooltipStyle = {
  background: "var(--glass)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  color: "var(--text)",
  padding: "10px 12px",
  fontSize: 12,
};

const TIPO_LABEL = { IMAGE: "Foto", VIDEO: "Video", CAROUSEL_ALBUM: "Carrusel" };

export default function Redes() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(DEFAULT_RANGE);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const payload = await getMetaRedes(range.since, range.until);
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setData({ error: err?.message || "No se pudo consultar Meta." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [range.since, range.until]);

  const ig = data?.instagram;
  const fb = data?.facebook;

  const alcanceSerie = useMemo(
    () => (ig?.alcance_por_dia || []).map((p) => ({ ...p, dia: p.fecha.slice(5) })),
    [ig],
  );

  const header = (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Redes de Sepia</h2>
          <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
            Instagram y Facebook · {prettyDate(data?.periodo?.since || range.since)} – {prettyDate(data?.periodo?.until || range.until)}
            {data?.periodo?.recortado ? " · Meta entrega máximo 30 días por consulta, se muestran los últimos 30 del rango" : ""}
          </span>
        </div>
        <MetaDateRangePicker range={range} onApply={setRange} />
      </header>
    </section>
  );

  if (loading) return <>{header}<div className="empty-state">Consultando redes en Meta...</div></>;
  if (!data) return null;
  if (data.configured === false || data.error) {
    return <>{header}<div className="empty-state">{data.mensaje || data.error}</div></>;
  }

  const kpisIg = ig ? [
    { label: "Seguidores", value: fNumber(ig.seguidores), deltaText: `@${ig.username}` },
    { label: "Nuevos seguidores", value: `+${fNumber(ig.nuevos_seguidores)}`, deltaText: range.label },
    { label: "Alcance", value: fNumber(ig.alcance), deltaText: "Cuentas únicas alcanzadas" },
    { label: "Vistas", value: fNumber(ig.vistas), deltaText: "Reels, historias y posts" },
    { label: "Visitas al perfil", value: fNumber(ig.visitas_perfil), deltaText: range.label },
    { label: "Interacciones", value: fNumber(ig.interacciones), deltaText: `${fNumber(ig.likes)} likes · ${fNumber(ig.comentarios)} comentarios` },
  ] : [];

  return (
    <>
      {header}

      {ig ? (
        <>
          <section className="kpi-grid">
            {kpisIg.map((kpi) => <KPI key={kpi.label} {...kpi} />)}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Alcance por día — Instagram</h2>
              <span>Cuentas alcanzadas cada día del periodo</span>
            </header>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={alcanceSerie} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="dia" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(148,163,184,0.3)" }} />
                  <Line type="monotone" dataKey="alcance" name="Alcance" stroke="#ec4899" strokeWidth={2.5} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Últimas publicaciones de Instagram</h2>
              <span>Las 12 más recientes · ordenadas por fecha</span>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Publicación</th>
                    <th style={{ textAlign: "right" }}>Likes</th>
                    <th style={{ textAlign: "right" }}>Comentarios</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(ig.posts || []).map((p) => (
                    <tr key={p.link || p.fecha}>
                      <td style={{ whiteSpace: "nowrap" }}>{String(p.fecha || "").slice(0, 10)}</td>
                      <td>{TIPO_LABEL[p.tipo] || p.tipo}</td>
                      <td style={{ color: "var(--muted)" }}>{p.caption || "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fNumber(p.likes)}</td>
                      <td style={{ textAlign: "right" }}>{fNumber(p.comentarios)}</td>
                      <td>{p.link && <a href={p.link} target="_blank" rel="noreferrer">ver</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="empty-state">No hay cuenta de Instagram vinculada a la página de Facebook.</div>
      )}

      {fb && (
        <section className="panel">
          <header className="panel-head">
            <h2>Facebook — {fb.nombre}</h2>
            <span>{fNumber(fb.seguidores)} seguidores</span>
          </header>
          <div className="category-list">
            <div className="category-item">
              <div className="category-label-row">
                <span style={{ color: "var(--muted)" }}>Interacciones con publicaciones</span>
                <span style={{ fontWeight: 600 }}>{fNumber(fb.interacciones)}</span>
              </div>
            </div>
            <div className="category-item">
              <div className="category-label-row">
                <span style={{ color: "var(--muted)" }}>Visitas a la página</span>
                <span style={{ fontWeight: 600 }}>{fNumber(fb.visitas_pagina)}</span>
              </div>
            </div>
            <div className="category-item">
              <div className="category-label-row">
                <span style={{ color: "var(--muted)" }}>Reproducciones de video</span>
                <span style={{ fontWeight: 600 }}>{fNumber(fb.reproducciones_video)}</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
