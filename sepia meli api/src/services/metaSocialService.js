import axios from "axios";

const GRAPH_BASE = "https://graph.facebook.com/v23.0";
const CACHE_TTL_MS = 15 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// La API de insights de Instagram entrega máximo ~30 días por consulta.
// ponytail: si el rango pedido es más largo, se recorta a los últimos 30 días
// (el payload lo informa); si algún día se necesita más, se trocea en ventanas.
const MAX_IG_DAYS = 30;

const fmtYmd = (d) => d.toISOString().slice(0, 10);

const friendlyGraphError = (error) => {
  const graphError = error?.response?.data?.error;
  if (graphError?.code === 190) {
    return "El token de Meta venció o fue invalidado. Genera uno nuevo y actualiza META_ACCESS_TOKEN.";
  }
  return graphError?.message || error?.message || "Error consultando la API de Meta.";
};

export const createMetaSocialService = ({ accessToken }) => {
  const cache = new Map(); // "since:until" -> { data, at }

  const graphGet = async (path, params = {}, token = accessToken) => {
    const { data } = await axios.get(`${GRAPH_BASE}/${path}`, {
      params: { access_token: token, ...params },
      timeout: 30_000,
    });
    return data;
  };

  const fetchFresh = async (since, until, recortado) => {
    // Página con Instagram vinculado (Sepia Moda y Más)
    const accounts = await graphGet("me/accounts", {
      fields:
        "id,name,access_token,fan_count,followers_count,instagram_business_account{id,username,followers_count,media_count,profile_picture_url}",
    });
    const pages = accounts.data || [];
    const page = pages.find((p) => p.instagram_business_account) || pages[0];
    if (!page) return { configured: true, error: "El token no tiene acceso a ninguna página de Facebook." };

    const ig = page.instagram_business_account;
    const rango = { since, until };

    const [reachSeries, followSeries, totals, media, fbInsights, fbPosts] = await Promise.all([
      ig
        ? graphGet(`${ig.id}/insights`, { metric: "reach", period: "day", ...rango }).catch(() => null)
        : null,
      ig
        ? graphGet(`${ig.id}/insights`, { metric: "follower_count", period: "day", ...rango }).catch(() => null)
        : null,
      ig
        ? graphGet(`${ig.id}/insights`, {
            metric: "profile_views,accounts_engaged,likes,comments,total_interactions,views",
            metric_type: "total_value",
            period: "day",
            ...rango,
          }).catch(() => null)
        : null,
      ig
        ? graphGet(`${ig.id}/media`, {
            fields: "caption,media_type,like_count,comments_count,timestamp,permalink",
            limit: 12,
          }).catch(() => null)
        : null,
      graphGet(`${page.id}/insights`, {
        metric: "page_post_engagements,page_views_total,page_video_views",
        period: "day",
        ...rango,
      }, page.access_token).catch(() => null),
      graphGet(`${page.id}/published_posts`, {
        fields: "message,created_time,permalink_url",
        limit: 5,
      }, page.access_token).catch(() => null),
    ]);

    const sumSeries = (payload, name) => {
      const serie = (payload?.data || []).find((m) => m.name === name);
      return (serie?.values || []).reduce((acc, v) => acc + (Number(v.value) || 0), 0);
    };

    const totalValue = (name) => {
      const item = (totals?.data || []).find((m) => m.name === name);
      return Number(item?.total_value?.value) || 0;
    };

    const alcancePorDia = ((reachSeries?.data || [])[0]?.values || []).map((v) => ({
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
            alcance: sumSeries(reachSeries, "reach"),
            nuevos_seguidores: sumSeries(followSeries, "follower_count"),
            visitas_perfil: totalValue("profile_views"),
            cuentas_interactuaron: totalValue("accounts_engaged"),
            likes: totalValue("likes"),
            comentarios: totalValue("comments"),
            interacciones: totalValue("total_interactions"),
            vistas: totalValue("views"),
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
        interacciones: sumSeries(fbInsights, "page_post_engagements"),
        visitas_pagina: sumSeries(fbInsights, "page_views_total"),
        reproducciones_video: sumSeries(fbInsights, "page_video_views"),
        posts: (fbPosts?.data || []).map((p) => ({
          fecha: p.created_time,
          mensaje: (p.message || "").slice(0, 80),
          link: p.permalink_url,
        })),
      },
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
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      // El flag "recortado" depende del rango pedido, no del cacheado
      return { ...cached.data, periodo: { ...cached.data.periodo, recortado } };
    }

    try {
      const data = await fetchFresh(desde, hasta, recortado);
      if (cache.size > 30) cache.clear();
      cache.set(cacheKey, { data, at: Date.now() });
      return data;
    } catch (error) {
      if (cached) return cached.data;
      return { configured: true, error: friendlyGraphError(error) };
    }
  };

  return { getSocial };
};
