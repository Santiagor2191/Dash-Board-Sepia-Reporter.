import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KPI from "../components/KPI";
import MetaDateRangePicker from "../components/MetaDateRangePicker";
import { getMetaRedes } from "../api";
import { calcDelta, fCurrency, fNumber, fmtYmd, daysAgo, prettyDate } from "../utils";

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
const DAY_MS = 24 * 60 * 60 * 1000;

// --- Recomendaciones calculadas con reglas sobre los datos reales ---
// nivel: "bien" (verde, sigue así) | "accion" (ámbar, hay oportunidad)
const buildRecomendaciones = (ig, pauta) => {
  const recs = [];
  if (!ig) return recs;

  // 1) Cadencia de publicación (sobre las últimas publicaciones)
  const posts30 = (ig.posts || []).filter(
    (p) => new Date(p.fecha).getTime() > Date.now() - 30 * DAY_MS,
  ).length;
  const porSemana = posts30 / 4.3;
  if (posts30 > 0 && porSemana < 3) {
    recs.push({
      nivel: "accion",
      titulo: "Publica más seguido",
      detalle: `Publicaste ${posts30} ${posts30 === 1 ? "vez" : "veces"} en los últimos 30 días (~${porSemana.toFixed(1)} por semana). Para moda y accesorios, 3–4 publicaciones por semana es el ritmo que mantiene vivo el alcance.`,
    });
  } else if (posts30 > 0) {
    recs.push({
      nivel: "bien",
      titulo: "Buen ritmo de publicación",
      detalle: `${posts30} publicaciones en 30 días (~${porSemana.toFixed(1)} por semana). Mantenlo.`,
    });
  }

  // 2) Formato ganador (solo si hay al menos 2 posts de un tipo para comparar)
  const porTipo = new Map();
  (ig.posts || []).forEach((p) => {
    const e = porTipo.get(p.tipo) || { n: 0, inter: 0 };
    e.n += 1;
    e.inter += p.likes + p.comentarios;
    porTipo.set(p.tipo, e);
  });
  const tipos = [...porTipo.entries()]
    .filter(([, v]) => v.n >= 2)
    .map(([tipo, v]) => ({ tipo, promedio: v.inter / v.n, n: v.n }))
    .sort((a, b) => b.promedio - a.promedio);
  if (tipos.length >= 2 && tipos[0].promedio > tipos[1].promedio * 1.4) {
    recs.push({
      nivel: "accion",
      titulo: `Tu formato ganador: ${TIPO_LABEL[tipos[0].tipo] || tipos[0].tipo}`,
      detalle: `Tus ${TIPO_LABEL[tipos[0].tipo]?.toLowerCase() || tipos[0].tipo}s promedian ${tipos[0].promedio.toFixed(0)} interacciones vs ${tipos[1].promedio.toFixed(0)} de ${TIPO_LABEL[tipos[1].tipo]?.toLowerCase() || tipos[1].tipo}s. Dale prioridad a ese formato.`,
    });
  }

  // 3) Tendencia de alcance vs periodo anterior
  if (ig.previo) {
    const deltaAlcance = calcDelta(ig.alcance, ig.previo.alcance);
    if (deltaAlcance <= -20) {
      recs.push({
        nivel: "accion",
        titulo: "El alcance viene cayendo",
        detalle: `Alcanzaste ${fNumber(ig.alcance)} cuentas, ${Math.abs(deltaAlcance).toFixed(0)}% menos que el periodo anterior (${fNumber(ig.previo.alcance)}). Suele recuperarse publicando más reels o probando horarios distintos.`,
      });
    } else if (deltaAlcance >= 20) {
      recs.push({
        nivel: "bien",
        titulo: "El alcance viene creciendo",
        detalle: `+${deltaAlcance.toFixed(0)}% vs el periodo anterior. Lo que estás publicando está conectando — revisa qué posts lo dispararon y repite la fórmula.`,
      });
    }
  }

  // 4) Engagement sobre alcance
  if (ig.alcance > 0) {
    const engagement = (ig.interacciones / ig.alcance) * 100;
    if (engagement < 1) {
      recs.push({
        nivel: "accion",
        titulo: "Engagement bajo",
        detalle: `De cada 100 cuentas alcanzadas, ${engagement.toFixed(1)} interactúan (referencia sana: 1–3%). Prueba llamados a la acción claros: pregunta en el caption, invita a guardar o comentar.`,
      });
    } else if (engagement >= 3) {
      recs.push({
        nivel: "bien",
        titulo: "Engagement sano",
        detalle: `${engagement.toFixed(1)}% de las cuentas alcanzadas interactúan — por encima de la referencia de 1–3%.`,
      });
    }
  }

  // 5) Reparto de la pauta entre plataformas
  const fb = (pauta || []).find((p) => p.plataforma === "facebook");
  const igp = (pauta || []).find((p) => p.plataforma === "instagram");
  if (fb && igp && fb.gasto + igp.gasto > 0) {
    const shareFb = (fb.gasto / (fb.gasto + igp.gasto)) * 100;
    if (shareFb > 80) {
      recs.push({
        nivel: "accion",
        titulo: `Meta pone el ${shareFb.toFixed(0)}% de tu pauta en Facebook`,
        detalle: `Si sientes que Instagram te convierte mejor, revisa las ubicaciones de tus campañas en el administrador de anuncios — con ubicación automática, Meta persigue el CPM barato, no la venta.`,
      });
    }
  }

  return recs;
};

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
  const pauta = useMemo(
    () => (Array.isArray(data?.pauta_por_plataforma) ? data.pauta_por_plataforma : []),
    [data],
  );

  const alcanceSerie = useMemo(
    () => (ig?.alcance_por_dia || []).map((p) => ({ ...p, dia: p.fecha.slice(5) })),
    [ig],
  );

  const recomendaciones = useMemo(() => buildRecomendaciones(ig, pauta), [ig, pauta]);

  const mejorPostLink = useMemo(() => {
    const posts = ig?.posts || [];
    if (posts.length < 3) return null;
    const mejor = [...posts].sort(
      (a, b) => (b.likes + b.comentarios) - (a.likes + a.comentarios),
    )[0];
    return mejor && (mejor.likes + mejor.comentarios) > 0 ? mejor.link : null;
  }, [ig]);

  const header = (
    <section className="panel">
      <header className="panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {ig?.foto && (
            <img
              src={ig.foto}
              alt=""
              width={44}
              height={44}
              style={{ borderRadius: "50%", border: "1px solid var(--line)" }}
            />
          )}
          <div>
            <h2 style={{ margin: 0 }}>
              {ig ? (
                <a
                  href={`https://www.instagram.com/${ig.username}/`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--text)", textDecoration: "none" }}
                >
                  @{ig.username}
                </a>
              ) : "Redes de Sepia"}
            </h2>
            <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
              {ig ? `${fNumber(ig.seguidores)} seguidores · ${fNumber(ig.publicaciones_total)} publicaciones · ` : ""}
              {prettyDate(data?.periodo?.since || range.since)} – {prettyDate(data?.periodo?.until || range.until)}
              {data?.periodo?.recortado ? " · Meta entrega máximo 30 días por consulta" : ""}
            </span>
          </div>
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

  const deltaVs = "vs periodo anterior";

  // Cuadro Facebook: pauta en la plataforma facebook, actual vs periodo anterior
  const pautaFb = pauta.find((p) => p.plataforma === "facebook");
  const pautaFbPrev = (data.pauta_previa || []).find((p) => p.plataforma === "facebook");
  const kpisFb = pautaFb ? [
    {
      label: "Alcance (pauta)",
      value: fNumber(pautaFb.alcance),
      delta: pautaFbPrev ? calcDelta(pautaFb.alcance, pautaFbPrev.alcance) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Impresiones (pauta)",
      value: fNumber(pautaFb.impresiones),
      delta: pautaFbPrev ? calcDelta(pautaFb.impresiones, pautaFbPrev.impresiones) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Conversaciones desde FB",
      value: fNumber(pautaFb.conversaciones),
      delta: pautaFbPrev ? calcDelta(pautaFb.conversaciones, pautaFbPrev.conversaciones) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Gasto en FB",
      value: fCurrency(pautaFb.gasto),
      delta: pautaFbPrev ? calcDelta(pautaFb.gasto, pautaFbPrev.gasto) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Costo x 1.000 personas",
      value: pautaFb.alcance > 0 ? fCurrency((pautaFb.gasto / pautaFb.alcance) * 1000) : "—",
      delta: pautaFbPrev && pautaFbPrev.alcance > 0 && pautaFb.alcance > 0
        ? calcDelta(pautaFb.gasto / pautaFb.alcance, pautaFbPrev.gasto / pautaFbPrev.alcance)
        : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Seguidores de la página",
      value: fNumber(fb?.seguidores || 0),
      deltaText: "Total actual",
    },
  ] : [];

  const kpisIg = ig ? [
    {
      label: "Alcance",
      value: fNumber(ig.alcance),
      delta: ig.previo ? calcDelta(ig.alcance, ig.previo.alcance) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Vistas",
      value: fNumber(ig.vistas),
      delta: ig.previo ? calcDelta(ig.vistas, ig.previo.vistas) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Interacciones",
      value: fNumber(ig.interacciones),
      delta: ig.previo ? calcDelta(ig.interacciones, ig.previo.interacciones) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Visitas al perfil",
      value: fNumber(ig.visitas_perfil),
      delta: ig.previo ? calcDelta(ig.visitas_perfil, ig.previo.visitas_perfil) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Nuevos seguidores",
      value: `+${fNumber(ig.nuevos_seguidores)}`,
      delta: ig.previo ? calcDelta(ig.nuevos_seguidores, ig.previo.nuevos_seguidores) : null,
      deltaLabel: deltaVs,
    },
    {
      label: "Engagement",
      value: ig.alcance > 0 ? `${((ig.interacciones / ig.alcance) * 100).toFixed(1)}%` : "—",
      deltaText: `${fNumber(ig.likes)} likes · ${fNumber(ig.comentarios)} comentarios`,
    },
  ] : [];

  return (
    <>
      {header}

      {ig ? (
        <>
          <section className="kpi-grid">
            {kpisIg.map((kpi) => <KPI key={kpi.label} {...kpi} />)}
          </section>

          {recomendaciones.length > 0 && (
            <section className="panel">
              <header className="panel-head">
                <h2>Recomendaciones</h2>
                <span>Calculadas con tus datos del periodo</span>
              </header>
              <div className="category-list">
                {recomendaciones.map((rec) => (
                  <div className="category-item" key={rec.titulo}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          marginTop: 6,
                          flexShrink: 0,
                          background: rec.nivel === "bien" ? "#22c55e" : "#f59e0b",
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>{rec.titulo}</div>
                        <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "3px 0 0", maxWidth: "72ch" }}>
                          {rec.detalle}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <header className="panel-head">
              <h2>Alcance por día</h2>
              <span>Cuentas alcanzadas cada día en Instagram</span>
            </header>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={alcanceSerie} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="alcanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c9793f" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#c9793f" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(148,163,184,0.3)" }} />
                  <Area
                    type="monotone"
                    dataKey="alcance"
                    name="Alcance"
                    stroke="#c9793f"
                    strokeWidth={2.25}
                    fill="url(#alcanceFill)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Últimas publicaciones</h2>
              <span>Las 12 más recientes de Instagram</span>
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
                    <th style={{ textAlign: "right" }}>Interacciones</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(ig.posts || []).map((p) => {
                    const esMejor = p.link && p.link === mejorPostLink;
                    return (
                      <tr key={p.link || p.fecha}>
                        <td style={{ whiteSpace: "nowrap" }}>{String(p.fecha || "").slice(0, 10)}</td>
                        <td>{TIPO_LABEL[p.tipo] || p.tipo}</td>
                        <td style={{ color: "var(--muted)" }}>
                          {p.caption || "—"}
                          {esMejor && (
                            <span className="status-badge live" style={{ marginLeft: 8, padding: "2px 8px", fontSize: "0.7rem" }}>
                              la mejor del grupo
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>{fNumber(p.likes)}</td>
                        <td style={{ textAlign: "right" }}>{fNumber(p.comentarios)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fNumber(p.likes + p.comentarios)}</td>
                        <td>{p.link && <a href={p.link} target="_blank" rel="noreferrer">ver</a>}</td>
                      </tr>
                    );
                  })}
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
            <div>
              <h2>Facebook — {fb.nombre}</h2>
              <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                {fNumber(fb.seguidores)} seguidores · el alcance de Facebook viene de tu pauta (los anuncios corren en el feed de Facebook)
              </span>
            </div>
          </header>
          {kpisFb.length > 0 && (
            <section className="kpi-grid" style={{ marginBottom: 16 }}>
              {kpisFb.map((kpi) => <KPI key={kpi.label} {...kpi} />)}
            </section>
          )}
          {pauta.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pauta por plataforma</th>
                    <th style={{ textAlign: "right" }}>Alcance</th>
                    <th style={{ textAlign: "right" }}>Impresiones</th>
                    <th style={{ textAlign: "right" }}>Gasto</th>
                    <th style={{ textAlign: "right" }}>Costo x 1.000 personas</th>
                  </tr>
                </thead>
                <tbody>
                  {pauta.map((p) => (
                    <tr key={p.plataforma}>
                      <td style={{ textTransform: "capitalize", fontWeight: 600 }}>{p.plataforma}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fNumber(p.alcance)}</td>
                      <td style={{ textAlign: "right" }}>{fNumber(p.impresiones)}</td>
                      <td style={{ textAlign: "right" }}>{fCurrency(p.gasto)}</td>
                      <td style={{ textAlign: "right" }}>
                        {p.alcance > 0 ? fCurrency((p.gasto / p.alcance) * 1000) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 16 }}>Sin pauta activa en el periodo.</div>
          )}
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 10, maxWidth: "90ch" }}>
            Meta retiró de su API las métricas orgánicas de páginas de Facebook (interacciones, visitas, videos) — por eso no se muestran aquí. Lo que ves en Business Suite como actividad de Facebook corresponde principalmente a esta pauta.
          </p>
        </section>
      )}
    </>
  );
}
