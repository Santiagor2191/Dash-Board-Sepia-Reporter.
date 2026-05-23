import express from "express";
import { sendInternalError } from "../security/httpErrors.js";

const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const CONVERSION_CACHE_TTL_MS = 10 * 60 * 1000;
const ITEM_SEARCH_PAGE_LIMIT = 50;
const ITEM_BATCH_SIZE = 20;
const ITEM_BATCH_CONCURRENCY = 4;
const CATEGORY_LOOKUP_CONCURRENCY = 6;
const VISITS_LOOKUP_CONCURRENCY = 8;

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!items.length) return [];

  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
};

const computeStockAlert = (item) => {
  if (item.status !== "active") return "inactive";
  if (item.available_quantity === 0) return "sin_stock";
  if (item.days_of_stock <= 7) return "critico";
  if (item.days_of_stock <= 15) return "bajo";
  if (item.days_of_stock <= 30) return "medio";
  return "ok";
};

export const createMeliRouter = ({ mlGet, meliOrdersService }) => {
  const router = express.Router();
  let inventoryCache = null;
  let inventoryInFlight = null;
  let conversionCache = null;
  let conversionInFlight = null;

  const invalidateDerivedCaches = () => {
    conversionCache = null;
    conversionInFlight = null;
  };

  const fetchSellerItemIds = async (sellerId) => {
    const allItemIds = [];
    let searchOffset = 0;

    while (true) {
      const search = await mlGet(`/users/${sellerId}/items/search`, {
        offset: searchOffset,
        limit: ITEM_SEARCH_PAGE_LIMIT,
      });
      const ids = search?.results || [];
      allItemIds.push(...ids);

      if (!ids.length || ids.length < ITEM_SEARCH_PAGE_LIMIT) break;

      const total = Number(search?.paging?.total) || 0;
      searchOffset += ids.length;
      if (total && searchOffset >= total) break;
    }

    return allItemIds;
  };

  const fetchSellerItems = async (sellerId) => {
    const allItemIds = await fetchSellerItemIds(sellerId);
    if (!allItemIds.length) return [];

    const batches = chunk(allItemIds, ITEM_BATCH_SIZE);
    const multiGetResponses = await mapWithConcurrency(
      batches,
      ITEM_BATCH_CONCURRENCY,
      (batch) => mlGet("/items", { ids: batch.join(",") }),
    );

    const items = [];
    for (const multiGet of multiGetResponses) {
      for (const entry of multiGet || []) {
        if (entry.code !== 200 || !entry.body) continue;

        const item = entry.body;
        items.push({
          id: item.id,
          title: item.title,
          price: item.price,
          currency: item.currency_id,
          available_quantity: item.available_quantity ?? 0,
          sold_quantity: item.sold_quantity ?? 0,
          status: item.status,
          permalink: item.permalink,
          thumbnail: item.thumbnail,
          category_id: item.category_id,
          seller_sku: item.seller_sku || null,
          date_created: item.date_created,
          last_updated: item.last_updated,
          listing_type_id: item.listing_type_id,
          condition: item.condition,
          health: item.health ?? null,
          shipping_free: item.shipping?.free_shipping ?? false,
        });
      }
    }

    return items;
  };

  const enrichInventoryItems = async (sellerId, items) => {
    if (!items.length) return [];

    const categoryIds = [...new Set(items.map((item) => item.category_id).filter(Boolean))];
    const categoryEntries = await mapWithConcurrency(
      categoryIds,
      CATEGORY_LOOKUP_CONCURRENCY,
      async (categoryId) => [categoryId, await meliOrdersService.getCategoryName(categoryId)],
    );
    const categoryMap = new Map(categoryEntries);

    const history = await meliOrdersService.getSellerOrdersHistory(sellerId, {
      maxOrders: 2500,
    });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const velocityMap = new Map();
    for (const order of history.results || []) {
      if (order.status !== "paid") continue;

      const orderDate = new Date(order.date_created || order.date_closed);
      for (const orderItem of order.order_items || []) {
        const itemId = orderItem.item?.id;
        if (!itemId) continue;

        const qty = Number(orderItem.quantity) || 1;
        const revenue = (Number(orderItem.unit_price) || 0) * qty;
        const entry = velocityMap.get(itemId) || {
          sold30d: 0,
          sold90d: 0,
          revenue30d: 0,
          lastSale: null,
        };

        if (orderDate >= thirtyDaysAgo) {
          entry.sold30d += qty;
          entry.revenue30d += revenue;
        }

        if (orderDate >= ninetyDaysAgo) {
          entry.sold90d += qty;
        }

        if (!entry.lastSale || orderDate > new Date(entry.lastSale)) {
          entry.lastSale = orderDate.toISOString();
        }

        velocityMap.set(itemId, entry);
      }
    }

    return items.map((item) => {
      const velocity = velocityMap.get(item.id) || {
        sold30d: 0,
        sold90d: 0,
        revenue30d: 0,
        lastSale: null,
      };
      const dailyVelocity = velocity.sold30d / 30;
      const daysOfStock =
        dailyVelocity > 0
          ? Math.round(item.available_quantity / dailyVelocity)
          : item.available_quantity > 0
            ? 999
            : 0;

      return {
        ...item,
        category_name: categoryMap.get(item.category_id) || item.category_id || "-",
        sold_30d: velocity.sold30d,
        sold_90d: velocity.sold90d,
        revenue_30d: Math.round(velocity.revenue30d),
        last_sale: velocity.lastSale,
        daily_velocity: dailyVelocity,
        days_of_stock: daysOfStock,
        stock_alert: computeStockAlert({
          ...item,
          available_quantity: item.available_quantity,
          days_of_stock: daysOfStock,
        }),
      };
    });
  };

  const buildInventoryPayload = async (sellerId) => {
    const items = await fetchSellerItems(sellerId);
    if (!items.length) {
      return { seller_id: sellerId, total: 0, items: [] };
    }

    const enrichedItems = await enrichInventoryItems(sellerId, items);
    return { seller_id: sellerId, total: enrichedItems.length, items: enrichedItems };
  };

  const getInventoryPayload = async (sellerId, { force = false } = {}) => {
    if (
      !force &&
      inventoryCache?.sellerId === sellerId &&
      Date.now() - inventoryCache.fetchedAt < INVENTORY_CACHE_TTL_MS
    ) {
      return { cached: true, data: inventoryCache.data };
    }

    if (!force && inventoryInFlight?.sellerId === sellerId) {
      return { cached: false, data: await inventoryInFlight.promise };
    }

    const promise = buildInventoryPayload(sellerId).then((data) => {
      inventoryCache = { sellerId, fetchedAt: Date.now(), data };
      invalidateDerivedCaches();
      return data;
    });

    inventoryInFlight = { sellerId, promise };

    try {
      return { cached: false, data: await promise };
    } finally {
      if (inventoryInFlight?.promise === promise) {
        inventoryInFlight = null;
      }
    }
  };

  const buildConversionPayload = async (sellerId, { forceInventory = false } = {}) => {
    const { data: inventoryData } = await getInventoryPayload(sellerId, {
      force: forceInventory,
    });
    const activeItems = inventoryData.items.filter((item) => item.status === "active");

    const visitEntries = await mapWithConcurrency(
      activeItems,
      VISITS_LOOKUP_CONCURRENCY,
      async (item) => {
        try {
          const visitData = await mlGet(`/items/${item.id}/visits/time_window`, {
            last: 30,
            unit: "day",
          });
          const totalVisits = Array.isArray(visitData)
            ? visitData.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0)
            : Number(visitData?.total_visits) || 0;

          return [item.id, totalVisits];
        } catch {
          return [item.id, 0];
        }
      },
    );
    const visitsMap = new Map(visitEntries);

    const items = activeItems.map((item) => {
      const visits = visitsMap.get(item.id) || 0;
      const sold = Number(item.sold_30d) || 0;
      const revenue = Number(item.revenue_30d) || 0;
      const conversionRate = visits > 0 ? (sold / visits) * 100 : 0;

      let diagnosis;
      if (visits >= 100 && conversionRate < 1) {
        diagnosis = "visitas_sin_conversion";
      } else if (visits < 30 && conversionRate >= 3) {
        diagnosis = "buena_conversion_pocas_visitas";
      } else if (visits >= 50 && conversionRate >= 3) {
        diagnosis = "estrella";
      } else if (visits < 10 && sold === 0) {
        diagnosis = "sin_traccion";
      } else {
        diagnosis = "normal";
      }

      return {
        id: item.id,
        title: item.title,
        price: item.price,
        thumbnail: item.thumbnail,
        permalink: item.permalink,
        available_quantity: item.available_quantity,
        listing_type_id: item.listing_type_id,
        visits_30d: visits,
        sold_30d: sold,
        revenue_30d: revenue,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        diagnosis,
      };
    });

    const totalVisits = items.reduce((sum, item) => sum + item.visits_30d, 0);
    const totalSold = items.reduce((sum, item) => sum + item.sold_30d, 0);
    const totalRevenue = items.reduce((sum, item) => sum + item.revenue_30d, 0);
    const avgConversion = totalVisits > 0 ? (totalSold / totalVisits) * 100 : 0;

    const diagnosisCounts = {
      estrellas: items.filter((item) => item.diagnosis === "estrella").length,
      visitas_sin_conversion: items.filter(
        (item) => item.diagnosis === "visitas_sin_conversion",
      ).length,
      buena_conversion_pocas_visitas: items.filter(
        (item) => item.diagnosis === "buena_conversion_pocas_visitas",
      ).length,
      sin_traccion: items.filter((item) => item.diagnosis === "sin_traccion").length,
      normal: items.filter((item) => item.diagnosis === "normal").length,
    };

    return {
      seller_id: sellerId,
      total: items.length,
      kpis: {
        total_visits_30d: totalVisits,
        total_sold_30d: totalSold,
        total_revenue_30d: Math.round(totalRevenue),
        avg_conversion_rate: Math.round(avgConversion * 100) / 100,
        diagnosis_counts: diagnosisCounts,
      },
      items,
    };
  };

  const getConversionPayload = async (sellerId, { force = false } = {}) => {
    if (
      !force &&
      conversionCache?.sellerId === sellerId &&
      Date.now() - conversionCache.fetchedAt < CONVERSION_CACHE_TTL_MS
    ) {
      return { cached: true, data: conversionCache.data };
    }

    if (!force && conversionInFlight?.sellerId === sellerId) {
      return { cached: false, data: await conversionInFlight.promise };
    }

    const promise = buildConversionPayload(sellerId, {
      forceInventory: force,
    }).then((data) => {
      conversionCache = { sellerId, fetchedAt: Date.now(), data };
      return data;
    });

    conversionInFlight = { sellerId, promise };

    try {
      return { cached: false, data: await promise };
    } finally {
      if (conversionInFlight?.promise === promise) {
        conversionInFlight = null;
      }
    }
  };

  router.get("/me", async (req, res) => {
    try {
      const me = await mlGet("/users/me");
      return res.json({ ok: true, data: me });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando /meli/me",
        "No se pudo consultar /users/me",
        error,
      );
    }
  });

  router.get("/orders/recent", async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const me = await mlGet("/users/me");
      const orders = await mlGet("/orders/search", {
        seller: me.id,
        sort: "date_desc",
        limit,
      });
      const enrichedResults = await meliOrdersService.enrichOrdersWithCategoryNames(
        orders.results || [],
      );

      return res.json({
        ok: true,
        seller_id: me.id,
        paging: orders.paging || null,
        results: enrichedResults,
      });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando /meli/orders/recent",
        "No se pudieron consultar ordenes",
        error,
      );
    }
  });

  router.get("/orders/history", async (req, res) => {
    try {
      const me = await mlGet("/users/me");
      const force = String(req.query.force || "").toLowerCase() === "true";
      const max = Math.min(Math.max(Number(req.query.max) || 2500, 1), 5000);
      const history = await meliOrdersService.getSellerOrdersHistory(me.id, {
        force,
        maxOrders: max,
      });

      return res.json({
        ok: true,
        seller_id: me.id,
        paging: history.paging,
        fetched: history.results.length,
        cached: !force,
        results: history.results,
      });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando /meli/orders/history",
        "No se pudo consultar el historial de ordenes",
        error,
      );
    }
  });

  router.get("/inventory", async (req, res) => {
    try {
      const force = String(req.query.force || "").toLowerCase() === "true";
      const me = await mlGet("/users/me");
      const { cached, data } = await getInventoryPayload(me.id, { force });

      return res.json({ ok: true, cached, ...data });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando /meli/inventory",
        "No se pudo consultar inventario",
        error,
      );
    }
  });

  router.get("/conversion", async (req, res) => {
    try {
      const force = String(req.query.force || "").toLowerCase() === "true";
      const me = await mlGet("/users/me");
      const { cached, data } = await getConversionPayload(me.id, { force });

      return res.json({ ok: true, cached, ...data });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando /meli/conversion",
        "No se pudo consultar datos de conversion",
        error,
      );
    }
  });

  return router;
};
