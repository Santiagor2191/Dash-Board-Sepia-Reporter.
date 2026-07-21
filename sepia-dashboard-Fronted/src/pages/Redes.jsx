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
import HeatmapTable from "../components/HeatmapTable";
import CompetidoresEditor from "../components/CompetidoresEditor";
import Avatar from "../components/Avatar";
import { getMetaRedes, getSocialPosts, getSocialBenchmark, getSocialBenchmarkHistorial, getMarcaHistorial, getCompetidorPosts } from "../api";
import { calcDelta, fCurrency, fNumber, fmtYmd, daysAgo, prettyDate } from "../utils";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "posts", label: "Posts" },
  { id: "competidores", label: "Competidores" },
];

const POST_COLUMNS = [
  {
    key: "miniatura_url",
    label: "",
    render: (value) =>
      value ? <img src={value} alt="" width={40} height={40} style={{ borderRadius: 6, objectFit: "cover" }} /> : "—",
  },
  { key: "fecha_publicacion", label: "Fecha", render: (v) => (v ? String(v).slice(0, 10) : "—") },
  { key: "plataforma", label: "Plataforma", render: (v) => (v === "instagram" ? "Instagram" : "Facebook") },
  { key: "reach", label: "Reach", heatmap: true, align: "right" },
  { key: "likes", label: "Likes", heatmap: true, align: "right" },
  { key: "comentarios", label: "Comentarios", heatmap: true, align: "right" },
  { key: "saves", label: "Saves", heatmap: true, align: "right" },
  { key: "shares", label: "Shares", heatmap: true, align: "right" },
];

// Tabla de posts propios con heatmap — pestaña "Posts". Se carga solo
// cuando la pestaña está activa (no gasta una consulta si nunca se abre).
const PostsTab = () => {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSocialPosts()
      .then((payload) => { if (!cancelled) setPosts(payload.posts || []); })
      .catch((err) => { if (!cancelled) setError(err?.message || "No se pudieron cargar los posts."); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="empty-state">{error}</div>;
  if (posts === null) return <div className="empty-state">Cargando posts...</div>;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Posts publicados</h2>
        <span>Con heatmap por columna — el color más intenso marca el valor más alto de esa métrica</span>
      </header>
      <HeatmapTable
        columns={POST_COLUMNS}
        rows={posts}
        getRowKey={(row) => `${row.plataforma}:${row.account_id}:${row.post_id}`}
        emptyMessage="Todavía no hay posts sincronizados. El sync corre una vez al día — si acabás de configurar esto, esperá al próximo /cron/social-sync."
      />
    </section>
  );
};

// Benchmark de competidores + editor — pestaña "Competidores".
// Misma paleta ya usada para años en VentasMetaAds.jsx — la reusamos para que
// cada perfil tenga un color de avatar estable y consistente con el resto del
// dashboard, en vez de inventar una paleta nueva para esto solo.
const AVATAR_PALETTE = ["#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#fb7185", "#6366f1"];

const avatarColorFor = (key) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const fPercent = (v) => (v != null ? `${(v * 100).toFixed(1)}%` : null);

// Mayor engagement entre las plataformas cargadas de un perfil (hoy solo
// Instagram lo calcula — Facebook siempre da null, ver PlatformCard).
const engagementDe = (perfil) => {
  const valores = Object.values(perfil.plataformas)
    .map((d) => d.engagement_aprox)
    .filter((v) => v != null);
  return valores.length ? Math.max(...valores) : null;
};

// La base de datos guarda un competidor+plataforma por fila (decisión del
// eng-review: no hay concepto de "perfil" unico). Acá se agrupan por nombre
// visible (o handle si no tiene nombre) SOLO para mostrar, sin tocar el dato
// real — si Santiago carga el mismo nombre en Instagram y Facebook, las 2
// filas se ven como un solo perfil con 2 plataformas adentro.
const buildProfiles = (competidores) => {
  const map = new Map();
  (competidores || []).forEach((c) => {
    const nombre = (c.nombre_visible || c.handle || "").trim();
    const key = nombre.toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, { id: key, nombre, fotoUrl: null, plataformas: {} });
    const perfil = map.get(key);
    perfil.plataformas[c.plataforma] = { ...c, historialKey: `comp:${c.competidor_id}` };
    // Si hay foto de más de una plataforma para el mismo perfil, se prioriza
    // Instagram (perfil más completo) — no importa el orden en que llegaron.
    if (c.foto_url && (!perfil.fotoUrl || c.plataforma === "instagram")) perfil.fotoUrl = c.foto_url;
  });
  return [...map.values()];
};

// Promedio de un campo sobre los posts recientes — misma cuenta que se hace
// del lado del servidor para likes_promedio/comentarios_promedio de los
// competidores (últimos ~12 posts), para que el número sea comparable.
const promedioDe = (posts, campo) => {
  if (!posts?.length) return null;
  const total = posts.reduce((acc, p) => acc + (p[campo] || 0), 0);
  return Number((total / posts.length).toFixed(1));
};

// "Tu marca" se arma con los datos que YA se cargaron para la pestaña
// Resumen (ig/fb) — no dispara una consulta nueva. Reusa la misma cuenta de
// cadencia semanal que ya se calcula para las Recomendaciones, para que el
// numero sea comparable con lo que muestran los competidores.
const buildTuMarcaProfile = (ig, fb) => {
  if (!ig && !fb) return null;
  const plataformas = {};
  if (ig) {
    plataformas.instagram = {
      seguidores: ig.seguidores,
      engagement_aprox: ig.alcance > 0 ? ig.interacciones / ig.alcance : null,
      posts_count: ig.publicaciones_total,
      cadencia_semanal: cadenciaSemanalDePosts(ig.posts),
      likes_promedio: promedioDe(ig.posts, "likes"),
      comentarios_promedio: promedioDe(ig.posts, "comentarios"),
      historialKey: "own:instagram",
    };
  }
  if (fb) {
    plataformas.facebook = {
      seguidores: fb.seguidores,
      engagement_aprox: null,
      posts_count: null,
      cadencia_semanal: null,
      historialKey: "own:facebook",
    };
  }
  return {
    id: "__tu_marca__",
    nombre: ig?.username ? `@${ig.username}` : "Sepia",
    fotoUrl: ig?.foto || null,
    esTuMarca: true,
    plataformas,
  };
};

const PLATFORM_LABEL = { instagram: "Instagram", facebook: "Facebook" };
const PLATFORM_TAG = { instagram: "IG", facebook: "FB" };

// Evolución de seguidores — social_benchmark guarda una fila nueva por cada
// corrida de sync (no pisa la anterior), así que esto se va llenando solo
// con los días. Con menos de 2 puntos no hay curva que dibujar todavía.
// El historial se trae una sola vez arriba en CompetidoresTab (para todos
// los competidores a la vez) y se pasa acá como prop, no se refetchea.
const SeguidoresHistorial = ({ historialKey, historial }) => {
  if (!historialKey || !historial || historial.length < 2) return null;

  const serie = historial.map((h) => ({ ...h, dia: String(h.fecha_snapshot).slice(5, 10) }));

  return (
    <div style={{ width: "100%", height: 90, marginTop: 12 }}>
      <div className="profile-metric-label" style={{ marginBottom: 4 }}>Seguidores en el tiempo</div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={serie} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`segFill-${historialKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c9793f" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#c9793f" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="dia" tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fNumber(v)} />
          <Area
            type="monotone"
            dataKey="seguidores"
            stroke="#c9793f"
            strokeWidth={2}
            fill={`url(#segFill-${historialKey})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// Reusa colores ya presentes en AVATAR_PALETTE — mismo lenguaje visual que
// el resto del dashboard en vez de inventar una paleta nueva para esto solo.
const FORMATO_COLOR = { reels: "#8b5cf6", carousel: "#14b8a6", imagen: "#f59e0b" };
const FORMATO_LABEL = { reels: "Reels", carousel: "Carrusel", imagen: "Imagen" };

// Barra apilada con el % de cada formato en los últimos posts del competidor
// (viene calculado del lado del servidor, sobre los últimos 12 posts que
// trae Business Discovery). Solo Instagram — Facebook no expone esto acá.
const MezclaFormatos = ({ datos }) => {
  const partes = [
    { key: "reels", pct: datos.pct_reels },
    { key: "carousel", pct: datos.pct_carousel },
    { key: "imagen", pct: datos.pct_imagen },
  ].filter((p) => p.pct != null && p.pct > 0);

  if (!partes.length) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="profile-metric-label" style={{ marginBottom: 6 }}>Mezcla de formatos</div>
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden" }}>
        {partes.map((p) => (
          <div key={p.key} style={{ width: `${p.pct}%`, background: FORMATO_COLOR[p.key] }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {partes.map((p) => (
          <span key={p.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.76rem", color: "var(--muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: FORMATO_COLOR[p.key], display: "inline-block" }} />
            {FORMATO_LABEL[p.key]} · {p.pct}%
          </span>
        ))}
      </div>
    </div>
  );
};

// Grilla de las últimas publicaciones del competidor — competidor_posts
// guarda el último estado de cada post (se pisa en cada sync, no es
// histórico). Se carga por separado del resto de la tarjeta porque son
// varias filas y no todos los perfiles la necesitan a la vez.
const PublicacionesRecientes = ({ competidorId }) => {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    if (!competidorId) return;
    let cancelled = false;
    getCompetidorPosts(competidorId)
      .then((payload) => { if (!cancelled) setPosts(payload.posts || []); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [competidorId]);

  if (!competidorId || !posts || posts.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="profile-metric-label" style={{ marginBottom: 8 }}>Publicaciones recientes</div>
      <div className="competitor-posts-grid">
        {posts.map((p) => (
          <a
            key={p.post_id}
            href={p.permalink || undefined}
            target="_blank"
            rel="noreferrer"
            className="competitor-post-card"
          >
            {p.miniatura_url ? (
              <img src={p.miniatura_url} alt={p.caption ? p.caption.slice(0, 60) : "Publicación del competidor"} />
            ) : (
              <div className="competitor-post-placeholder">Sin imagen</div>
            )}
            <div className="competitor-post-meta">
              <span>♥ {fNumber(p.likes)}</span>
              <span>💬 {fNumber(p.comentarios)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

const PlatformCard = ({ plataforma, datos, historial }) => {
  const metricas = [
    { label: "Seguidores", value: datos.seguidores != null ? fNumber(datos.seguidores) : null },
    { label: "Engagement rate", value: fPercent(datos.engagement_aprox) },
    { label: "Likes promedio", value: datos.likes_promedio != null ? fNumber(datos.likes_promedio) : null },
    { label: "Comentarios prom.", value: datos.comentarios_promedio != null ? fNumber(datos.comentarios_promedio) : null },
    { label: "Posts/semana", value: datos.cadencia_semanal ?? null },
    { label: "Publicaciones", value: datos.posts_count != null ? fNumber(datos.posts_count) : null },
  ];
  const faltanDatos = metricas.every((m, i) => i === 0 || m.value == null);

  return (
    <div className="platform-card">
      <div className="platform-card-head">
        <span className={`platform-tag ${plataforma}`}>{PLATFORM_TAG[plataforma]}</span>
        {PLATFORM_LABEL[plataforma]}
      </div>
      <div className="profile-metric-grid">
        {metricas.map((m) => (
          <div className="profile-metric" key={m.label}>
            <div className="profile-metric-label">{m.label}</div>
            <div className={`profile-metric-value ${m.value == null ? "unavailable" : ""}`}>
              {m.value ?? "—"}
            </div>
          </div>
        ))}
      </div>
      <SeguidoresHistorial historialKey={datos.historialKey} historial={historial} />
      <MezclaFormatos datos={datos} />
      {plataforma === "instagram" && (
        <PublicacionesRecientes key={datos.historialKey} competidorId={datos.competidor_id} />
      )}
      {plataforma === "facebook" && faltanDatos && (
        <p className="platform-card-note">
          Meta solo entrega seguidores de páginas ajenas sin un trámite de revisión aparte — el resto de las métricas no está disponible.
        </p>
      )}
      {datos.last_error && (
        <p className="platform-card-note">Sin sincronizar: {datos.last_error}</p>
      )}
    </div>
  );
};

// Diferencia entre el primer y el último snapshot de seguidores que tengamos
// guardado — no está atado a ningún rango de fechas elegido, es "lo que
// llevamos registrado desde que se agregó el competidor".
const cambioDeSeguidores = (historial) => {
  if (!historial || historial.length < 2) return null;
  return historial[historial.length - 1].seguidores - historial[0].seguidores;
};

const fDelta = (n) => (n > 0 ? `+${fNumber(n)}` : fNumber(n));

// Tabla comparativa estilo "Puntos de referencia" de Meta Business Suite —
// una fila por página (perfil x plataforma), igual que allá.
const ComparisonTable = ({ perfiles, historiales }) => {
  const filas = perfiles.flatMap((p) =>
    Object.entries(p.plataformas).map(([plataforma, datos]) => ({
      perfil: p,
      plataforma,
      datos,
      cambio: cambioDeSeguidores(historiales[datos.historialKey]),
    })),
  );
  filas.sort((a, b) => (b.datos.seguidores || 0) - (a.datos.seguidores || 0));

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Página</th>
            <th>Plataforma</th>
            <th style={{ textAlign: "right" }}>Seguidores</th>
            <th style={{ textAlign: "right" }}>Cambio</th>
            <th style={{ textAlign: "right" }}>Publicaciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.perfil.id}:${f.plataforma}`}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar
                    fotoUrl={f.perfil.fotoUrl}
                    nombre={f.perfil.nombre}
                    color={f.perfil.esTuMarca ? "var(--accent)" : avatarColorFor(f.perfil.id)}
                    size="sm"
                  />
                  {f.perfil.nombre}
                  {f.perfil.esTuMarca && <span className="pill brand">Tu marca</span>}
                </div>
              </td>
              <td>{PLATFORM_LABEL[f.plataforma]}</td>
              <td style={{ textAlign: "right" }}>{f.datos.seguidores != null ? fNumber(f.datos.seguidores) : "—"}</td>
              <td style={{ textAlign: "right", color: f.cambio > 0 ? "#22c55e" : f.cambio < 0 ? "#f87171" : undefined }}>
                {f.cambio != null ? fDelta(f.cambio) : "—"}
              </td>
              <td style={{ textAlign: "right" }}>{f.datos.posts_count != null ? fNumber(f.datos.posts_count) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CompetidoresTab = ({ ig, fb }) => {
  const [competidores, setCompetidores] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [gestionAbierta, setGestionAbierta] = useState(false);
  const [tablaAbierta, setTablaAbierta] = useState(false);
  const [historiales, setHistoriales] = useState({});
  const [plataformaSeleccionada, setPlataformaSeleccionada] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSocialBenchmark()
      .then((payload) => { if (!cancelled) setCompetidores(payload.competidores || []); })
      .catch(() => { if (!cancelled) setCompetidores([]); });
    return () => { cancelled = true; };
  }, []);

  // Un solo fetch de historial por competidor, apenas se conoce la lista —
  // lo usan tanto el mini-gráfico de la tarjeta como la tabla comparativa,
  // así que se trae una vez arriba en vez de repetirlo en cada uno. Se
  // mergea con lo que ya haya en el mapa (no lo pisa) porque el historial
  // propio se carga en un efecto aparte, en paralelo.
  useEffect(() => {
    if (!competidores || competidores.length === 0) return;
    let cancelled = false;
    Promise.all(
      competidores.map((c) =>
        getSocialBenchmarkHistorial(c.competidor_id)
          .then((payload) => [`comp:${c.competidor_id}`, payload.historial || []])
          .catch(() => [`comp:${c.competidor_id}`, []]),
      ),
    ).then((pares) => {
      if (!cancelled) setHistoriales((prev) => ({ ...prev, ...Object.fromEntries(pares) }));
    });
    return () => { cancelled = true; };
  }, [competidores]);

  // Historial de seguidores de la propia cuenta — se trae una sola vez, no
  // depende de la lista de competidores.
  useEffect(() => {
    let cancelled = false;
    getMarcaHistorial()
      .then((payload) => {
        if (cancelled) return;
        const porPlataforma = { instagram: [], facebook: [] };
        (payload.historial || []).forEach((h) => {
          if (porPlataforma[h.plataforma]) porPlataforma[h.plataforma].push(h);
        });
        setHistoriales((prev) => ({
          ...prev,
          "own:instagram": porPlataforma.instagram,
          "own:facebook": porPlataforma.facebook,
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tuMarca = useMemo(() => buildTuMarcaProfile(ig, fb), [ig, fb]);
  // Competidores ordenados de mayor a menor engagement — el que no tiene
  // dato todavía (sin sincronizar) va al final, no arriba mezclado.
  const propios = useMemo(
    () => [...buildProfiles(competidores)].sort((a, b) => {
      const ea = engagementDe(a);
      const eb = engagementDe(b);
      if (ea == null && eb == null) return 0;
      if (ea == null) return 1;
      if (eb == null) return -1;
      return eb - ea;
    }),
    [competidores],
  );
  const perfiles = useMemo(
    () => (tuMarca ? [tuMarca, ...propios] : propios),
    [propios, tuMarca],
  );
  const liderId = propios.length && engagementDe(propios[0]) != null ? propios[0].id : null;

  if (competidores === null) return <div className="empty-state">Cargando competidores...</div>;

  const activo = perfiles.find((p) => p.id === seleccionado) || perfiles[0] || null;

  // Pestaña de plataforma dentro de la tarjeta — se resetea sola cuando el
  // perfil activo cambia y esa plataforma ya no aplica, sin necesitar un
  // efecto: si lo guardado no es válido para el perfil actual, cae a la
  // primera plataforma que tenga cargada.
  const plataformasActivo = activo ? Object.keys(activo.plataformas) : [];
  const plataformaMostrada = plataformasActivo.includes(plataformaSeleccionada)
    ? plataformaSeleccionada
    : plataformasActivo[0] || null;

  // "Tu marca" no cuenta como competidor real — si todavía no cargaste
  // ninguno, mostramos el formulario directo (sin el toggle de en medio),
  // porque sin eso esta pestaña no tiene nada que comparar todavía.
  const sinCompetidoresReales = (competidores?.length || 0) === 0;

  return (
    <>
      {perfiles.length > 0 && (
        <section className="panel" style={{ marginBottom: 14 }}>
          <header className="panel-head">
            <div>
              <h2>Competidores</h2>
              <span>Instagram completo · Facebook solo seguidores</span>
            </div>
            {!sinCompetidoresReales && (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn-xs" onClick={() => setTablaAbierta((v) => !v)}>
                  {tablaAbierta ? "Ver tarjetas" : "Ver tabla comparativa"}
                </button>
                <button type="button" className="btn-xs" onClick={() => setGestionAbierta((v) => !v)}>
                  {gestionAbierta ? "Ocultar gestión" : "+ Agregar / gestionar"}
                </button>
              </div>
            )}
          </header>

          {tablaAbierta ? (
            <ComparisonTable perfiles={perfiles} historiales={historiales} />
          ) : (
            <>
              <div className="profile-chip-row">
                {perfiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`profile-chip ${activo?.id === p.id ? "active" : ""}`}
                    onClick={() => setSeleccionado(p.id)}
                  >
                    <Avatar
                      fotoUrl={p.fotoUrl}
                      nombre={p.nombre}
                      color={p.esTuMarca ? "var(--accent)" : avatarColorFor(p.id)}
                      size="sm"
                    />
                    {p.nombre}
                    {p.id === liderId && <span className="pill leader">Líder</span>}
                  </button>
                ))}
              </div>

              {activo && (
                <>
                  <div className="profile-card-header">
                    <div className="profile-identity">
                      <Avatar
                        fotoUrl={activo.fotoUrl}
                        nombre={activo.nombre}
                        color={activo.esTuMarca ? "var(--accent)" : avatarColorFor(activo.id)}
                        size="lg"
                      />
                      <div>
                        <h3>
                          {activo.nombre}
                          {activo.esTuMarca && <span className="pill brand">Tu marca</span>}
                          {activo.id === liderId && <span className="pill leader">Líder en engagement</span>}
                        </h3>
                        <p>
                          {Object.keys(activo.plataformas).map((pl) => PLATFORM_LABEL[pl]).join(" · ") || "Sin plataformas cargadas"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {plataformasActivo.length > 1 && (
                    <div className="tabs" style={{ marginBottom: 12 }}>
                      {plataformasActivo.map((pl) => (
                        <button
                          key={pl}
                          type="button"
                          className={`tab-btn ${plataformaMostrada === pl ? "active" : ""}`}
                          onClick={() => setPlataformaSeleccionada(pl)}
                        >
                          {PLATFORM_LABEL[pl]}
                        </button>
                      ))}
                    </div>
                  )}

                  {plataformaMostrada && (
                    <div className="platform-section">
                      <PlatformCard
                        plataforma={plataformaMostrada}
                        datos={activo.plataformas[plataformaMostrada]}
                        historial={historiales[activo.plataformas[plataformaMostrada].historialKey]}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}

      {(sinCompetidoresReales || gestionAbierta) && <CompetidoresEditor />}
    </>
  );
};

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

// Posts por semana sobre los últimos 30 días de "posts" (usado tanto por las
// Recomendaciones como por el perfil "Tu marca" en Competidores, para que el
// número sea el mismo en los dos lados).
const cadenciaSemanalDePosts = (posts) => {
  const posts30 = (posts || []).filter(
    (p) => new Date(p.fecha).getTime() > Date.now() - 30 * DAY_MS,
  ).length;
  return posts30 > 0 ? Number((posts30 / 4.3).toFixed(1)) : null;
};

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
  const [tab, setTab] = useState("resumen");

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

  const tabBar = (
    <div className="tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab-btn ${tab === t.id ? "active" : ""}`}
          onClick={() => setTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // Posts y Competidores tienen su propia carga de datos, independiente del
  // resumen en vivo de Meta — no hace falta esperar a que "data" resuelva.
  if (tab === "posts") return <>{header}{tabBar}<PostsTab /></>;
  if (tab === "competidores") return <>{header}{tabBar}<CompetidoresTab ig={ig} fb={fb} /></>;

  if (loading) return <>{header}{tabBar}<div className="empty-state">Consultando redes en Meta...</div></>;
  if (!data) return null;
  if (data.configured === false || data.error) {
    return <>{header}{tabBar}<div className="empty-state">{data.mensaje || data.error}</div></>;
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
      {tabBar}

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
