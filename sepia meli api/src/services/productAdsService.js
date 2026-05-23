/**
 * Product Ads Service — API v2 de Mercado Libre
 *
 * Endpoints oficiales (vigentes desde junio 2025):
 *   GET /advertising/advertisers?product_id=PADS
 *       -> { advertisers: [{ advertiser_id, site_id, advertiser_name }] }
 *
 *   GET /marketplace/advertising/{site_id}/advertisers/{advertiser_id}/product_ads/campaigns/search
 *       Headers: api-version: 2
 *       Params: limit, offset, date_from, date_to, metrics, metrics_summary
 *       -> { paging, results: [{ id, name, status, budget, metrics: {...} }] }
 *
 *   GET /marketplace/advertising/{site_id}/advertisers/{advertiser_id}/product_ads/ads/search
 *       Headers: api-version: 2
 *       Params: limit, offset, date_from, date_to, metrics, campaign_id, filters[status]=active
 *       -> { paging, results: [{ id, item_id, campaign_id, status, metrics: {...} }] }
 *
 * Docs: https://global-selling.mercadolibre.com/devsite/campaigns-ads-and-metrics
 */

const ADS_METRICS = "clicks,prints,cost,cpc,roas,direct_amount,indirect_amount,total_amount";

const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (data?.results && Array.isArray(data.results)) return data.results;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    // Podria ser un objeto con 'advertisers' u otra key
    if (data.advertisers) return data.advertisers;
    return [data];
  }
  return [];
};

export const createProductAdsService = ({ meliClient, dbPool }) => {

  /**
   * Obtiene advertiser_id y site_id del usuario actual para Product Ads.
   */
  const getAdvertiserInfo = async () => {
    const data = await meliClient.mlGet("/advertising/advertisers", { product_id: "PADS" });
    const advertisers = data?.advertisers || toArray(data);

    if (!advertisers.length) {
      return null;
    }
    // Tomar el primer advertiser (normalmente solo hay uno por usuario)
    return advertisers[0];
  };

  /**
   * Helper para llamar endpoints de Product Ads v2 con el header api-version: 2
   */
  const adsGet = async (siteId, advertiserId, resource, queryParams = {}) => {
    const basePath = `/marketplace/advertising/${siteId}/advertisers/${advertiserId}/product_ads`;
    const url = `${basePath}/${resource}`;
    return meliClient.mlGet(url, queryParams, true, { "api-version": "2" });
  };

  const getAdsData = async () => {
    // 1. Obtener usuario
    let user;
    try {
      user = await meliClient.mlGet("/users/me");
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.response?.data?.error || error.message;
      console.error("[Ads Service] Error obteniendo usuario:", status, detail);
      if (status === 401 || status === 403) {
        throw new Error("Tu sesion de Mercado Libre caduco o no tiene permisos. Re-conecta tu cuenta.");
      }
      throw new Error(`No se pudo obtener tu usuario de Mercado Libre: ${detail}`);
    }
    console.log(`[Ads Service] Usuario ML: ${user.id} (${user.nickname})`);

    // 2. Obtener advertiser_id y site_id
    let advertiser;
    try {
      advertiser = await getAdvertiserInfo();
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.response?.data?.error || error.message;
      console.error("[Ads Service] Error obteniendo advertiser:", status, detail);
      if (status === 404) {
        throw new Error("Tu cuenta no tiene Product Ads activado. Activa Mercado Ads desde Mercado Libre > Publicidad.");
      }
      throw new Error(`Error consultando advertiser de publicidad: ${detail}`);
    }

    if (!advertiser) {
      throw new Error("No se encontro un perfil de publicidad (advertiser) para tu cuenta. Activa Product Ads desde Mercado Libre > Publicidad.");
    }

    const { advertiser_id: advertiserId, site_id: siteId } = advertiser;
    console.log(`[Ads Service] Advertiser: ${advertiserId}, Site: ${siteId}`);

    // 3. Rango de fechas (ultimos 30 dias)
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const dateTo = toDate.toISOString().split("T")[0];
    const dateFrom = fromDate.toISOString().split("T")[0];

    // 4. Obtener campanas con metricas
    let campaignsRaw;
    try {
      campaignsRaw = await adsGet(siteId, advertiserId, "campaigns/search", {
        limit: 50,
        offset: 0,
        date_from: dateFrom,
        date_to: dateTo,
        metrics: ADS_METRICS,
        metrics_summary: true,
      });
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.response?.data?.error || error.message;
      console.error("[Ads Service] Error obteniendo campanas:", status, detail);
      if (status === 404) {
        return { summary: { spend: 0, revenue: 0, roas: 0 }, campaigns: [] };
      }
      throw new Error(`Error obteniendo campanas de publicidad: ${detail}`);
    }

    const campaigns = toArray(campaignsRaw);
    console.log(`[Ads Service] Campanas encontradas: ${campaigns.length}`);

    if (campaigns.length === 0) {
      return { summary: { spend: 0, revenue: 0, roas: 0 }, campaigns: [] };
    }

    // 5. Procesar campanas y sus metricas (ya vienen incluidas en la respuesta v2)
    const combinedCampaigns = [];
    let totalSpend = 0;
    let totalRevenue = 0;
    let totalClicks = 0;
    let totalImpressions = 0;

    for (const camp of campaigns) {
      const met = camp.metrics || {};
      const cSpend = met.cost || 0;
      const cRevenue = met.total_amount || met.direct_amount || 0;
      const cClicks = met.clicks || 0;
      const cImpressions = met.prints || 0;

      totalSpend += cSpend;
      totalRevenue += cRevenue;
      totalClicks += cClicks;
      totalImpressions += cImpressions;

      // 6. Obtener anuncios individuales de esta campana
      let adsList = [];
      try {
        const adsRaw = await adsGet(siteId, advertiserId, "ads/search", {
          limit: 50,
          offset: 0,
          campaign_id: camp.id,
          "filters[status]": "active",
          date_from: dateFrom,
          date_to: dateTo,
          metrics: ADS_METRICS,
        });

        const adsArray = toArray(adsRaw);
        adsList = adsArray.map(ad => {
          const adMet = ad.metrics || {};
          return {
            id: ad.id || ad.ad_id,
            item_id: ad.item_id,
            status: ad.status,
            spend: adMet.cost || 0,
            impressions: adMet.prints || 0,
            clicks: adMet.clicks || 0,
            roas: adMet.roas || 0,
            revenue: adMet.total_amount || adMet.direct_amount || 0,
          };
        });
      } catch (err) {
        console.error(`[Ads Service] Error obteniendo ads para campana ${camp.id}:`, err.response?.status, err.response?.data || err.message);
      }

      combinedCampaigns.push({
        id: camp.id,
        name: camp.name || `Campana ${camp.id}`,
        status: camp.status,
        budget: camp.budget || 0,
        strategy: camp.strategy,
        spend: cSpend,
        revenue: cRevenue,
        impressions: cImpressions,
        clicks: cClicks,
        roas: met.roas || 0,
        cpc: met.cpc || 0,
        publications: adsList,
      });
    }

    return {
      summary: {
        spend: totalSpend,
        revenue: totalRevenue,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        clicks: totalClicks,
        impressions: totalImpressions,
      },
      campaigns: combinedCampaigns,
    };
  };

  /**
   * Diagnostico: prueba cada endpoint de ads por separado y reporta cuales funcionan.
   */
  const diagnose = async () => {
    const results = {};

    // Test 1: /users/me
    try {
      const user = await meliClient.mlGet("/users/me");
      results.user = { ok: true, userId: user.id, nickname: user.nickname, siteId: user.site_id };
    } catch (err) {
      results.user = { ok: false, status: err.response?.status, error: err.response?.data?.message || err.message };
      return results;
    }

    // Test 2: /advertising/advertisers (obtener advertiser_id)
    try {
      const data = await meliClient.mlGet("/advertising/advertisers", { product_id: "PADS" });
      const advertisers = data?.advertisers || toArray(data);
      results.advertiser = {
        ok: advertisers.length > 0,
        count: advertisers.length,
        data: advertisers[0] || null,
        hint: advertisers.length === 0
          ? "No se encontro perfil de advertiser. Activa Product Ads desde Mercado Libre > Publicidad."
          : undefined,
      };

      if (advertisers.length > 0) {
        const { advertiser_id, site_id } = advertisers[0];

        // Test 3: campaigns/search
        try {
          const now = new Date().toISOString().split("T")[0];
          const ago = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
          const camps = await meliClient.mlGet(
            `/marketplace/advertising/${site_id}/advertisers/${advertiser_id}/product_ads/campaigns/search`,
            { limit: 3, offset: 0, date_from: ago, date_to: now, metrics: "clicks,cost", metrics_summary: true },
            true,
            { "api-version": "2" },
          );
          const arr = toArray(camps);
          results.campaigns = { ok: true, count: arr.length, sampleKeys: arr[0] ? Object.keys(arr[0]) : [] };
        } catch (err) {
          results.campaigns = { ok: false, status: err.response?.status, error: err.response?.data?.message || err.response?.data?.error || err.message };
        }
      }
    } catch (err) {
      results.advertiser = { ok: false, status: err.response?.status, error: err.response?.data?.message || err.response?.data?.error || err.message };
    }

    return results;
  };

  return { getAdsData, diagnose };
};
