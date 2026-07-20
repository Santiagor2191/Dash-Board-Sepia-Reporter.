import axios from "axios";
import { createTtlCache } from "../utils/ttlCache.js";

const GRAPH_BASE = "https://graph.facebook.com/v23.0";
const CACHE_TTL_MS = 15 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// La API de insights de Instagram entrega máximo ~30 días por consulta.
// ponytail: si el rango pedido es más largo, se recorta a los últimos 30 días
// (el payload lo informa); si algún día se necesita más, se trocea en ventanas.
const MAX_IG_DAYS = 30;

// Tope de posts por corrida de sync — evita pedir insights de a cientos de
// posts de una y pegarle al límite de la API de Meta sin necesidad.
const MAX_POSTS_POR_SYNC = 50;

const fmtYmd = (d) => d.toISOString().slice(0, 10);

const ACTION_CONVERSACION = "onsite_conversion.messaging_conversation_started_7d";

const mapPauta = (payload) =>
  (payload?.data || []).map((row) => ({
    plataforma: row.publisher_platform,
    alcance: Number(row.reach) || 0,
    impresiones: Number(row.impressions) || 0,
    gasto: Number(row.spend) || 0,
    conversaciones:
      Number((row.actions || []).find((a) => a.action_type === ACTION_CONVERSACION)?.value) || 0,
  }));

const friendlyGraphError = (error) => {
  const graphError = error?.response?.data?.error;
  if (graphError?.code === 190) {
    return "El token de Meta venció o fue invalidado. Genera uno nuevo y actualiza META_ACCESS_TOKEN.";
  }
  return graphError?.message || error?.message || "Error consultando la API de Meta.";
};

export const createMetaSocialService = ({ accessToken, adAccountId }) => {
  const cache = createTtlCache({ ttlMs: CACHE_TTL_MS });

  const graphGet = async (path, params = {}, token = accessToken) => {
    const { data } = await axios.get(`${GRAPH_BASE}/${path}`, {
      params: { access_token: token, ...params },
      timeout: 30_000,
    });
    return data;
  };

  // Llamadas agrupadas en un solo pedido HTTP (batch de Meta). Cada item de
  // `requests` es { method, relative_url }; la respuesta trae un array en el
  // mismo orden, cada uno con { code, body } — un item puede fallar sin tirar
  // abajo a los demás (por eso el caller debe revisar `code` por separado).
  const graphBatch = async (requests, token = accessToken) => {
    if (!requests.length) return [];
    const { data } = await axios.post(
      GRAPH_BASE,
      new URLSearchParams({
        access_token: token,
        batch: JSON.stringify(requests),
      }),
      { timeout: 30_000 },
    );
    return data || [];
  };

  const parseBatchJson = (item) => {
    if (!item || item.code !== 200) return null;
    try {
      return JSON.parse(item.body);
    } catch {
      return null;
    }
  };

  // Resuelve la Página de Facebook con Instagram vinculado (se reusa tanto
  // para el resumen en vivo del dashboard como para el sync a Neon).
  const resolvePageAndIg = async () => {
    const accounts = await graphGet("me/accounts", {
      fields:
        "id,name,access_token,fan_count,followers_count,instagram_business_account{id,username,followers_count,media_count,profile_picture_url}",
    });
    const pages = accounts.data || [];
    const page = pages.find((p) => p.instagram_business_account) || pages[0];
    return { page, ig: page?.instagram_business_account || null };
  };

  // Totales de IG para una ventana de fechas (se usa para el periodo actual y el anterior)
  const igWindow = (igId, since, until) =>
    Promise.all([
      graphGet(`${igId}/insights`, { metric: "reach", period: "day", since, until }).catch(() => null),
      graphGet(`${igId}/insights`, { metric: "follower_count", period: "day", since, until }).catch(() => null),
      graphGet(`${igId}/insights`, {
        metric: "profile_views,accounts_engaged,likes,comments,total_interactions,views",
        metric_type: "total_value",
        period: "day",
        since,
        until,
      }).catch(() => null),
    ]);

  const fetchFresh = async (since, until, recortado) => {
    const { page, ig } = await resolvePageAndIg();
    if (!page) return { configured: true, error: "El token no tiene acceso a ninguna página de Facebook." };

    // Ventana anterior de igual duración, para los % de cambio
    const dias = Math.round((new Date(until) - new Date(since)) / DAY_MS) + 1;
    const prevUntil = fmtYmd(new Date(new Date(since).getTime() - DAY_MS));
    const prevSince = fmtYmd(new Date(new Date(prevUntil).getTime() - (dias - 1) * DAY_MS));

    // Meta retiró las métricas orgánicas de página de la API (devuelven vacío/0).
    // Lo que Business Suite muestra como "actividad de Facebook" es sobre todo
    // el alcance de la pauta → se lee de la cuenta publicitaria por plataforma.
    const pautaWindow = (s, u) =>
      adAccountId
        ? graphGet(`${adAccountId}/insights`, {
            level: "account",
            breakdowns: "publisher_platform",
            fields: "reach,impressions,spend,actions",
            time_range: JSON.stringify({ since: s, until: u }),
          }).catch(() => null)
        : null;

    const [actual, previo, media, pautaPorPlataforma, pautaPrevia, fbPosts] = await Promise.all([
      ig ? igWindow(ig.id, since, until) : [null, null, null],
      ig ? igWindow(ig.id, prevSince, prevUntil) : [null, null, null],
      ig
        ? graphGet(`${ig.id}/media`, {
            fields: "caption,media_type,like_count,comments_count,timestamp,permalink",
            limit: 12,
          }).catch(() => null)
        : null,
      pautaWindow(since, until),
      pautaWindow(prevSince, prevUntil),
      graphGet(`${page.id}/published_posts`, {
        fields: "message,created_time,permalink_url",
        limit: 5,
      }, page.access_token).catch(() => null),
    ]);

    const sumSeries = (payload, name) => {
      const serie = (payload?.data || []).find((m) => m.name === name);
      return (serie?.values || []).reduce((acc, v) => acc + (Number(v.value) || 0), 0);
    };

    // Resume la ventana [reach, followers, totales] en un objeto de métricas
    const resumenVentana = ([reachSeries, followSeries, totals]) => {
      const totalValue = (name) => {
        const item = (totals?.data || []).find((m) => m.name === name);
        return Number(item?.total_value?.value) || 0;
      };
      return {
        alcance: sumSeries(reachSeries, "reach"),
        nuevos_seguidores: sumSeries(followSeries, "follower_count"),
        visitas_perfil: totalValue("profile_views"),
        cuentas_interactuaron: totalValue("accounts_engaged"),
        likes: totalValue("likes"),
        comentarios: totalValue("comments"),
        interacciones: totalValue("total_interactions"),
        vistas: totalValue("views"),
      };
    };

    const igActual = resumenVentana(actual);
    const igPrevio = resumenVentana(previo);

    const alcancePorDia = (((actual[0])?.data || [])[0]?.values || []).map((v) => ({
      fecha: String(v.end_time || "").slice(0, 10),
      alcance: Number(v.value) || 0,
    }));

    return {
      configured: true,
      periodo: { since, until, recortado },
      instagram: ig
        ? {
            username: ig.username,
            seguidores: Number(ig.followers_count) || 0,
            publicaciones_total: Number(ig.media_count) || 0,
            foto: ig.profile_picture_url || null,
            ...igActual,
            previo: igPrevio,
            periodo_previo: { since: prevSince, until: prevUntil },
            alcance_por_dia: alcancePorDia,
            posts: (media?.data || []).map((m) => ({
              fecha: m.timestamp,
              tipo: m.media_type,
              caption: (m.caption || "").slice(0, 80),
              likes: Number(m.like_count) || 0,
              comentarios: Number(m.comments_count) || 0,
              link: m.permalink,
            })),
          }
        : null,
      facebook: {
        nombre: page.name,
        seguidores: Number(page.followers_count || page.fan_count) || 0,
        posts: (fbPosts?.data || []).map((p) => ({
          fecha: p.created_time,
          mensaje: (p.message || "").slice(0, 80),
          link: p.permalink_url,
        })),
      },
      pauta_por_plataforma: mapPauta(pautaPorPlataforma),
      pauta_previa: mapPauta(pautaPrevia),
    };
  };

  const getSocial = async ({ since, until } = {}) => {
    if (!accessToken) {
      return { configured: false, mensaje: "Falta META_ACCESS_TOKEN en el .env del backend." };
    }

    // Rango por defecto: últimos 30 días. IG no acepta más de ~30 días por consulta.
    let hasta = DATE_RE.test(until || "") ? until : fmtYmd(new Date());
    let desde = DATE_RE.test(since || "") ? since : fmtYmd(new Date(Date.now() - 29 * DAY_MS));
    let recortado = false;
    const dias = Math.round((new Date(hasta) - new Date(desde)) / DAY_MS) + 1;
    if (dias > MAX_IG_DAYS) {
      desde = fmtYmd(new Date(new Date(hasta).getTime() - (MAX_IG_DAYS - 1) * DAY_MS));
      recortado = true;
    }

    const cacheKey = `${desde}:${hasta}`;
    const cached = cache.get(cacheKey);
    if (cached?.fresh) {
      // El flag "recortado" depende del rango pedido, no del cacheado
      return { ...cached.data, periodo: { ...cached.data.periodo, recortado } };
    }

    try {
      const data = await fetchFresh(desde, hasta, recortado);
      cache.set(cacheKey, data);
      return data;
    } catch (error) {
      if (cached) return cached.data; // dato vencido como respaldo, mejor que nada
      return { configured: true, error: friendlyGraphError(error) };
    }
  };

  // ---------------------------------------------------------------------
  // Fetchers "crudos" para el job de sync (socialSyncService.js). A
  // diferencia de getSocial(), no truncan ni dan formato de UI — devuelven
  // los datos tal cual hacen falta para persistir en social_posts.
  // ---------------------------------------------------------------------

  // Posts propios (IG + FB) con insights por post, vía batch request (1A).
  // No usa el cache (el sync corre una vez al día, no tiene sentido cachear).
  const fetchPostsForSync = async () => {
    if (!accessToken) {
      return { configured: false, mensaje: "Falta META_ACCESS_TOKEN en el .env del backend." };
    }

    const { page, ig } = await resolvePageAndIg();
    if (!page) return { configured: true, error: "El token no tiene acceso a ninguna página de Facebook." };

    const [igMedia, fbPosts] = await Promise.all([
      ig
        ? graphGet(`${ig.id}/media`, {
            fields:
              "caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count",
            limit: MAX_POSTS_POR_SYNC,
          }).catch(() => null)
        : null,
      graphGet(`${page.id}/published_posts`, {
        fields: "message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true)",
        limit: MAX_POSTS_POR_SYNC,
      }, page.access_token).catch(() => null),
    ]);

    const igItems = igMedia?.data || [];
    // reach/saved/shares vienen en una llamada de insights APARTE por post —
    // se piden todas juntas en un solo batch request (decisión 1A).
    const insightsBatch = igItems.length
      ? await graphBatch(
          igItems.map((m) => ({
            method: "GET",
            relative_url: `${m.id}/insights?metric=reach,saved,shares`,
          })),
        ).catch(() => [])
      : [];

    const igPosts = igItems.map((m, idx) => {
      const insights = parseBatchJson(insightsBatch[idx]);
      const metricValue = (name) =>
        Number((insights?.data || []).find((row) => row.name === name)?.values?.[0]?.value) || null;
      return {
        plataforma: "instagram",
        account_id: ig.id,
        post_id: m.id,
        fecha_publicacion: m.timestamp || null,
        permalink: m.permalink || null,
        miniatura_url: m.thumbnail_url || m.media_url || null,
        media_type: m.media_type || null,
        media_product_type: m.media_product_type || null,
        caption: m.caption || null,
        likes: Number(m.like_count) || 0,
        comentarios: Number(m.comments_count) || 0,
        // null (no undefined) cuando el insight puntual falló — así el sync
        // guarda "no disponible" en vez de perder la fila entera.
        reach: metricValue("reach"),
        saves: metricValue("saved"),
        shares: metricValue("shares"),
      };
    });

    const fbItems = fbPosts?.data || [];
    const fbMapped = fbItems.map((p) => ({
      plataforma: "facebook",
      account_id: page.id,
      post_id: p.id,
      fecha_publicacion: p.created_time || null,
      permalink: p.permalink_url || null,
      miniatura_url: p.full_picture || null,
      media_type: null,
      media_product_type: null,
      caption: p.message || null,
      likes: Number(p.likes?.summary?.total_count) || 0,
      comentarios: Number(p.comments?.summary?.total_count) || 0,
      // Facebook no expone reach/saves/shares por post orgánico vía Graph API
      // pública desde que Meta retiró las métricas orgánicas de página.
      reach: null,
      saves: null,
      shares: null,
    }));

    return { configured: true, posts: [...igPosts, ...fbMapped] };
  };

  // Benchmark de un competidor. Instagram vía Business Discovery (no
  // requiere autorización del competidor); Facebook solo seguidores
  // (dato público). Se llama una vez por competidor activo desde
  // socialSyncService.js, que aísla los errores de cada uno (3A).
  const fetchCompetitorBenchmark = async ({ plataforma, handle }) => {
    if (!accessToken) throw new Error("Falta META_ACCESS_TOKEN en el .env del backend.");

    try {
      if (plataforma === "instagram") {
        const { ig } = await resolvePageAndIg();
        if (!ig) throw new Error("No hay cuenta de Instagram vinculada para consultar Business Discovery.");
        const data = await graphGet(`${ig.id}`, {
          fields: `business_discovery.username(${handle}){followers_count,media_count,profile_picture_url,media.limit(12){like_count,comments_count,timestamp}}`,
        });
        const bd = data?.business_discovery;
        if (!bd) throw new Error(`No se encontró la cuenta @${handle} (¿no es una cuenta Business/Creator?).`);
        const posts = bd.media?.data || [];
        const totalLikesComments = posts.reduce(
          (acc, p) => acc + (Number(p.like_count) || 0) + (Number(p.comments_count) || 0),
          0,
        );
        const seguidores = Number(bd.followers_count) || 0;
        const engagementAprox = seguidores > 0 && posts.length ? totalLikesComments / posts.length / seguidores : null;
        const cadenciaSemanal = computeCadenciaSemanal(posts.map((p) => p.timestamp));
        return {
          seguidores,
          posts_count: Number(bd.media_count) || 0,
          engagement_aprox: engagementAprox,
          cadencia_semanal: cadenciaSemanal,
          foto_url: bd.profile_picture_url || null,
        };
      }

      if (plataforma === "facebook") {
        // Dato público, no requiere permisos especiales sobre la página ajena.
        const data = await graphGet(handle, { fields: "followers_count,fan_count,picture.type(large)" });
        return {
          seguidores: Number(data.followers_count || data.fan_count) || 0,
          posts_count: null,
          engagement_aprox: null,
          cadencia_semanal: null,
          foto_url: data.picture?.data?.url || null,
        };
      }

      throw new Error(`Plataforma desconocida: ${plataforma}`);
    } catch (error) {
      throw new Error(friendlyGraphError(error));
    }
  };

  // Seguidores propios (IG + FB) para el snapshot diario de "Tu marca" — un
  // solo llamado liviano a me/accounts, sin insights ni rango de fechas.
  const fetchOwnFollowers = async () => {
    if (!accessToken) throw new Error("Falta META_ACCESS_TOKEN en el .env del backend.");
    try {
      const { page, ig } = await resolvePageAndIg();
      return {
        instagram: ig ? Number(ig.followers_count) || 0 : null,
        facebook: page ? Number(page.followers_count || page.fan_count) || 0 : null,
      };
    } catch (error) {
      throw new Error(friendlyGraphError(error));
    }
  };

  return { getSocial, fetchPostsForSync, fetchCompetitorBenchmark, fetchOwnFollowers };
};

// Posts por semana en las últimas ~4 semanas de la muestra traída (no es un
// promedio histórico real, es una aproximación con lo poco que Business
// Discovery entrega — documentado como tal en el design doc).
const computeCadenciaSemanal = (timestamps) => {
  const fechas = timestamps.filter(Boolean).map((t) => new Date(t).getTime());
  if (fechas.length < 2) return null;
  const rangoDias = (Math.max(...fechas) - Math.min(...fechas)) / DAY_MS;
  if (rangoDias <= 0) return null;
  return Number(((fechas.length / rangoDias) * 7).toFixed(2));
};
