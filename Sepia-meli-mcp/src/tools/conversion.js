import { mlGet, getSellerId } from "../meliClient.js";

const VISITS_CONCURRENCY = 8;
const ITEM_SEARCH_PAGE_LIMIT = 50;
const ITEM_BATCH_SIZE = 20;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const mapConc = async (items, concurrency, mapper) => {
  if (!items.length) return [];
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await mapper(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return out;
};

const fetchActiveItems = async (sellerId) => {
  const ids = [];
  let offset = 0;
  while (true) {
    const page = await mlGet(`/users/${sellerId}/items/search`, {
      offset,
      limit: ITEM_SEARCH_PAGE_LIMIT,
      status: "active",
    });
    const batch = page?.results || [];
    ids.push(...batch);
    if (!batch.length || batch.length < ITEM_SEARCH_PAGE_LIMIT) break;
    offset += batch.length;
    const total = Number(page?.paging?.total) || 0;
    if (total && offset >= total) break;
  }
  if (!ids.length) return [];

  const batches = chunk(ids, ITEM_BATCH_SIZE);
  const responses = await mapConc(batches, 4, (batch) =>
    mlGet("/items", { ids: batch.join(",") }),
  );

  const items = [];
  for (const multi of responses) {
    for (const entry of multi || []) {
      if (entry.code !== 200 || !entry.body) continue;
      const it = entry.body;
      if (it.status !== "active") continue;
      items.push({
        id: it.id,
        title: it.title,
        price: it.price,
        permalink: it.permalink,
        available_quantity: it.available_quantity ?? 0,
        sold_quantity: it.sold_quantity ?? 0,
      });
    }
  }
  return items;
};

const fetchOrdersLast30 = async (sellerId) => {
  const orders = [];
  let offset = 0;
  const maxOrders = 2500;
  while (offset < maxOrders) {
    const limit = Math.min(50, maxOrders - offset);
    const page = await mlGet("/orders/search", {
      seller: sellerId,
      sort: "date_desc",
      limit,
      offset,
    });
    const batch = page?.results || [];
    orders.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
    if (page?.paging?.total && offset >= page.paging.total) break;
  }
  return orders;
};

const computeSoldByItem = (orders) => {
  const day30Ago = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const map = new Map();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    const ts = new Date(o.date_created || o.date_closed).getTime();
    if (ts < day30Ago) continue;
    for (const oi of o.order_items || []) {
      const id = oi.item?.id;
      if (!id) continue;
      const qty = Number(oi.quantity) || 1;
      const rev = qty * (Number(oi.unit_price) || 0);
      const entry = map.get(id) || { sold30d: 0, revenue30d: 0 };
      entry.sold30d += qty;
      entry.revenue30d += rev;
      map.set(id, entry);
    }
  }
  return map;
};

const diagnose = ({ visits, conversionRate, sold }) => {
  if (visits >= 100 && conversionRate < 1) return "visitas_sin_conversion";
  if (visits < 30 && conversionRate >= 3) return "buena_conversion_pocas_visitas";
  if (visits >= 50 && conversionRate >= 3) return "estrella";
  if (visits < 10 && sold === 0) return "sin_traccion";
  return "normal";
};

export const conversionToolDefinitions = [
  {
    name: "visitas_y_conversion",
    description:
      "Cruza visitas (ultimos 30 dias) con ventas pagas para calcular % de conversion por producto. Diagnostica cuales son estrellas, cuales tienen visitas sin conversion, etc.",
    inputSchema: {
      type: "object",
      properties: {
        diagnosis: {
          type: "string",
          description:
            "Filtrar por diagnostico: estrella, visitas_sin_conversion, buena_conversion_pocas_visitas, sin_traccion, normal",
        },
        limit: {
          type: "number",
          description: "Maximo de productos a devolver (default 50)",
        },
      },
    },
    handler: async ({ diagnosis, limit = 50 } = {}) => {
      const sellerId = await getSellerId();
      const items = await fetchActiveItems(sellerId);
      const orders = await fetchOrdersLast30(sellerId);
      const soldMap = computeSoldByItem(orders);

      const visitEntries = await mapConc(items, VISITS_CONCURRENCY, async (item) => {
        try {
          const v = await mlGet(`/items/${item.id}/visits/time_window`, {
            last: 30,
            unit: "day",
          });
          const total = Array.isArray(v)
            ? v.reduce((s, e) => s + (Number(e.total) || 0), 0)
            : Number(v?.total_visits) || 0;
          return [item.id, total];
        } catch {
          return [item.id, 0];
        }
      });
      const visitsMap = new Map(visitEntries);

      const enriched = items.map((item) => {
        const visits = visitsMap.get(item.id) || 0;
        const { sold30d = 0, revenue30d = 0 } = soldMap.get(item.id) || {};
        const conversionRate = visits > 0 ? (sold30d / visits) * 100 : 0;
        return {
          id: item.id,
          title: item.title,
          price: item.price,
          permalink: item.permalink,
          available_quantity: item.available_quantity,
          visits_30d: visits,
          sold_30d: sold30d,
          revenue_30d: Math.round(revenue30d),
          conversion_rate: Math.round(conversionRate * 100) / 100,
          diagnosis: diagnose({ visits, conversionRate, sold: sold30d }),
        };
      });

      const filtered = diagnosis
        ? enriched.filter((e) => e.diagnosis === diagnosis)
        : enriched;

      const totalVisits = enriched.reduce((s, e) => s + e.visits_30d, 0);
      const totalSold = enriched.reduce((s, e) => s + e.sold_30d, 0);
      const avgConversion = totalVisits > 0 ? (totalSold / totalVisits) * 100 : 0;

      return {
        period: "ultimos_30_dias",
        total_active_items: enriched.length,
        total_visits: totalVisits,
        total_sold: totalSold,
        avg_conversion_rate: Math.round(avgConversion * 100) / 100,
        diagnosis_counts: {
          estrella: enriched.filter((e) => e.diagnosis === "estrella").length,
          visitas_sin_conversion: enriched.filter(
            (e) => e.diagnosis === "visitas_sin_conversion",
          ).length,
          buena_conversion_pocas_visitas: enriched.filter(
            (e) => e.diagnosis === "buena_conversion_pocas_visitas",
          ).length,
          sin_traccion: enriched.filter((e) => e.diagnosis === "sin_traccion").length,
          normal: enriched.filter((e) => e.diagnosis === "normal").length,
        },
        items: filtered
          .sort((a, b) => b.conversion_rate - a.conversion_rate)
          .slice(0, Number(limit) || 50),
      };
    },
  },
];
