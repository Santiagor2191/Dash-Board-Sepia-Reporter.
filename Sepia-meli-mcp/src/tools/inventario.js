import { mlGet, getSellerId } from "../meliClient.js";

const ITEM_SEARCH_PAGE_LIMIT = 50;
const ITEM_BATCH_SIZE = 20;
const ITEM_BATCH_CONCURRENCY = 4;

const chunk = (items, size) => {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!items.length) return [];
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
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

const fetchSellerItemIds = async (sellerId) => {
  const ids = [];
  let offset = 0;
  while (true) {
    const page = await mlGet(`/users/${sellerId}/items/search`, {
      offset,
      limit: ITEM_SEARCH_PAGE_LIMIT,
    });
    const batch = page?.results || [];
    ids.push(...batch);
    if (!batch.length || batch.length < ITEM_SEARCH_PAGE_LIMIT) break;
    offset += batch.length;
    const total = Number(page?.paging?.total) || 0;
    if (total && offset >= total) break;
  }
  return ids;
};

const fetchSellerItems = async (sellerId) => {
  const ids = await fetchSellerItemIds(sellerId);
  if (!ids.length) return [];

  const batches = chunk(ids, ITEM_BATCH_SIZE);
  const responses = await mapWithConcurrency(batches, ITEM_BATCH_CONCURRENCY, (batch) =>
    mlGet("/items", { ids: batch.join(",") }),
  );

  const items = [];
  for (const multiGet of responses) {
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
        seller_sku: item.seller_sku || null,
        listing_type_id: item.listing_type_id,
      });
    }
  }
  return items;
};

const enrichWithVelocity = async (items, sellerId) => {
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

  const now = Date.now();
  const day30 = now - 30 * 24 * 60 * 60 * 1000;
  const velocity = new Map();
  for (const order of orders) {
    if (order.status !== "paid") continue;
    const orderTs = new Date(order.date_created || order.date_closed).getTime();
    for (const oi of order.order_items || []) {
      const id = oi.item?.id;
      if (!id) continue;
      const qty = Number(oi.quantity) || 1;
      const entry = velocity.get(id) || { sold30d: 0, lastSale: null };
      if (orderTs >= day30) entry.sold30d += qty;
      if (!entry.lastSale || orderTs > entry.lastSale) entry.lastSale = orderTs;
      velocity.set(id, entry);
    }
  }

  return items.map((item) => {
    const v = velocity.get(item.id) || { sold30d: 0, lastSale: null };
    const daily = v.sold30d / 30;
    const days_of_stock =
      daily > 0
        ? Math.round(item.available_quantity / daily)
        : item.available_quantity > 0
          ? 999
          : 0;
    return {
      ...item,
      sold_30d: v.sold30d,
      daily_velocity: Math.round(daily * 100) / 100,
      days_of_stock,
      last_sale: v.lastSale ? new Date(v.lastSale).toISOString() : null,
      stock_alert: computeStockAlert({ ...item, days_of_stock }),
    };
  });
};

export const inventoryToolDefinitions = [
  {
    name: "inventario_alertas",
    description:
      "Lista productos del inventario con sus alertas de stock (critico, bajo, medio, ok). Calcula dias de stock segun velocidad de venta de los ultimos 30 dias.",
    inputSchema: {
      type: "object",
      properties: {
        alert_level: {
          type: "string",
          description:
            "Filtrar solo por nivel: critico, bajo, medio, ok, sin_stock. Si se omite trae todos.",
        },
        only_active: {
          type: "boolean",
          description: "Solo publicaciones activas (default true)",
        },
      },
    },
    handler: async ({ alert_level, only_active = true } = {}) => {
      const sellerId = await getSellerId();
      const rawItems = await fetchSellerItems(sellerId);
      const filtered = only_active
        ? rawItems.filter((it) => it.status === "active")
        : rawItems;

      const enriched = await enrichWithVelocity(filtered, sellerId);
      const final = alert_level
        ? enriched.filter((it) => it.stock_alert === alert_level)
        : enriched;

      const counts = {
        critico: enriched.filter((i) => i.stock_alert === "critico").length,
        bajo: enriched.filter((i) => i.stock_alert === "bajo").length,
        medio: enriched.filter((i) => i.stock_alert === "medio").length,
        ok: enriched.filter((i) => i.stock_alert === "ok").length,
        sin_stock: enriched.filter((i) => i.stock_alert === "sin_stock").length,
      };

      return {
        total_items: enriched.length,
        alert_summary: counts,
        items: final.sort((a, b) => a.days_of_stock - b.days_of_stock),
      };
    },
  },
  {
    name: "stock_producto",
    description:
      "Trae stock disponible, ventas de los ultimos 30 dias y dias de cobertura para un producto especifico (por ID de publicacion MeLi tipo MCO123, o por SKU).",
    inputSchema: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description: "ID de publicacion (ej: MCO1234567890)",
        },
        sku: {
          type: "string",
          description: "SKU interno del vendedor",
        },
      },
    },
    handler: async ({ item_id, sku } = {}) => {
      if (!item_id && !sku) {
        throw new Error("Debes pasar item_id o sku.");
      }

      const sellerId = await getSellerId();
      const items = await fetchSellerItems(sellerId);

      const found = item_id
        ? items.find((it) => it.id === item_id)
        : items.find((it) => it.seller_sku === sku);

      if (!found) {
        return { found: false, item_id, sku };
      }

      const enriched = await enrichWithVelocity([found], sellerId);
      return { found: true, item: enriched[0] };
    },
  },
];
