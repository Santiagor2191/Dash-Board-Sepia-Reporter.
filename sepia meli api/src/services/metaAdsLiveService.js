import axios from "axios";

const GRAPH_BASE = "https://graph.facebook.com/v23.0";
const CACHE_TTL_MS = 15 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Métricas de conversión reales para campañas Click-to-WhatsApp.
// Las de pixel/sitio (purchase, add_to_cart) NO aplican: viven en 0 y es esperado.
const ACTION_CONVERSACION = "onsite_conversion.messaging_conversation_started_7d";
const ACTION_PEDIDO = "onsite_conversion.messaging_order_created_v2";

const pickAction = (list, actionType) => {
  const found = (list || []).find((item) => item.action_type === actionType);
  return found ? Number(found.value) || 0 : 0;
};

const friendlyGraphError = (error) => {
  const graphError = error?.response?.data?.error;
  if (graphError?.code === 190) {
    return "El token de Meta venció o fue invalidado. Genera uno nuevo en developers.facebook.com y actualiza META_ACCESS_TOKEN.";
  }
  return graphError?.message || error?.message || "Error consultando la API de Meta.";
};

export const createMetaAdsLiveService = ({ accessToken, adAccountId }) => {
  const cacheByRange = new Map(); // clave "since:until" -> { data, at }

  const graphGet = async (path, params = {}) => {
    const { data } = await axios.get(`${GRAPH_BASE}/${path}`, {
      params: { access_token: accessToken, ...params },
      timeout: 30_000,
    });
    return data;
  };

  const fetchFresh = async (rangeParams, periodo) => {
    const [insights, campaigns, adsets] = await Promise.all([
      graphGet(`${adAccountId}/insights`, {
        level: "ad",
        limit: 100,
        fields:
          "ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpm,frequency,actions,cost_per_action_type",
        ...rangeParams,
      }),
      graphGet(`${adAccountId}/campaigns`, {
        limit: 50,
        fields: "name,effective_status,recommendations",
      }),
      graphGet(`${adAccountId}/adsets`, {
        limit: 50,
        fields: "name,effective_status,recommendations",
      }),
    ]);

    const anuncios = (insights.data || []).map((row) => {
      const gasto = Number(row.spend) || 0;
      const conversaciones = pickAction(row.actions, ACTION_CONVERSACION);
      const pedidos = pickAction(row.actions, ACTION_PEDIDO);
      return {
        ad_id: row.ad_id,
        anuncio: row.ad_name,
        conjunto: row.adset_name,
        campana: row.campaign_name,
        gasto,
        impresiones: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        ctr: Number(row.ctr) || 0,
        cpm: Number(row.cpm) || 0,
        frecuencia: Number(row.frequency) || 0,
        conversaciones,
        costo_conversacion: conversaciones > 0 ? gasto / conversaciones : null,
        pedidos,
        costo_pedido: pedidos > 0 ? gasto / pedidos : null,
      };
    });

    const recomendaciones = [...(campaigns.data || []), ...(adsets.data || [])]
      .filter((entity) => entity.effective_status === "ACTIVE" && entity.recommendations?.length)
      .flatMap((entity) =>
        entity.recommendations.map((rec) => ({
          objeto: entity.name,
          titulo: rec.title,
          mensaje: rec.message,
          importancia: rec.importance || null,
          confianza: rec.confidence || null,
        })),
      );

    return { configured: true, periodo, anuncios, recomendaciones };
  };

  const getLive = async ({ since, until } = {}) => {
    if (!accessToken) {
      return {
        configured: false,
        mensaje:
          "Falta META_ACCESS_TOKEN en el .env del backend. Genera el token en developers.facebook.com (app Ads For Manus, permiso ads_read).",
      };
    }

    const hasCustomRange = DATE_RE.test(since || "") && DATE_RE.test(until || "");
    const rangeParams = hasCustomRange
      ? { time_range: JSON.stringify({ since, until }) }
      : { date_preset: "last_30d" };
    const periodo = hasCustomRange ? `${since} a ${until}` : "last_30d";
    const cacheKey = hasCustomRange ? `${since}:${until}` : "last_30d";

    const cached = cacheByRange.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

    try {
      const data = await fetchFresh(rangeParams, periodo);
      // ponytail: cache simple acotado; si crece mucho se vacía y ya
      if (cacheByRange.size > 30) cacheByRange.clear();
      cacheByRange.set(cacheKey, { data, at: Date.now() });
      return data;
    } catch (error) {
      if (cached) return cached.data;
      return { configured: true, error: friendlyGraphError(error) };
    }
  };

  return { getLive };
};
