import { mlGet, getSellerId } from "../meliClient.js";

const ORDERS_PAGE_LIMIT = 50;

const summarizeOrder = (order) => ({
  id: order.id,
  date_created: order.date_created,
  date_closed: order.date_closed,
  status: order.status,
  status_detail: order.status_detail || null,
  total_amount: order.total_amount,
  currency: order.currency_id,
  buyer: order.buyer
    ? {
        id: order.buyer.id,
        nickname: order.buyer.nickname,
        first_name: order.buyer.first_name || null,
        last_name: order.buyer.last_name || null,
      }
    : null,
  items: (order.order_items || []).map((entry) => ({
    item_id: entry.item?.id,
    title: entry.item?.title,
    category_id: entry.item?.category_id,
    variation_attributes: entry.item?.variation_attributes || null,
    quantity: entry.quantity,
    unit_price: entry.unit_price,
  })),
  shipping_id: order.shipping?.id || null,
  payment_status: order.payments?.[0]?.status || null,
});

const fetchOrdersInRange = async ({ from, to, status, maxOrders = 200 }) => {
  const sellerId = await getSellerId();
  const params = {
    seller: sellerId,
    sort: "date_desc",
    limit: ORDERS_PAGE_LIMIT,
    offset: 0,
  };

  if (from) params["order.date_created.from"] = from;
  if (to) params["order.date_created.to"] = to;
  if (status) params["order.status"] = status;

  const results = [];
  let offset = 0;
  const cap = Math.min(Math.max(Number(maxOrders) || 200, 1), 1000);

  while (offset < cap) {
    const limit = Math.min(ORDERS_PAGE_LIMIT, cap - offset);
    const page = await mlGet("/orders/search", { ...params, offset, limit });
    const batch = page?.results || [];
    results.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
    if (page?.paging?.total && offset >= page.paging.total) break;
  }

  return results;
};

const toIsoStart = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00.000-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const toIsoEnd = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59.999-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const ordersToolDefinitions = [
  {
    name: "obtener_ordenes_hoy",
    description:
      "Trae las ordenes del dia actual desde la API de Mercado Libre. Util para revisar ventas en tiempo real.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Filtrar por estado: paid, cancelled, confirmed. Si se omite, trae todas.",
        },
      },
    },
    handler: async ({ status } = {}) => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const orders = await fetchOrdersInRange({
        from: toIsoStart(dateStr),
        to: toIsoEnd(dateStr),
        status,
        maxOrders: 200,
      });

      const summary = orders.map(summarizeOrder);
      const totalRevenue = summary
        .filter((o) => o.status === "paid")
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      return {
        date: dateStr,
        total_orders: summary.length,
        paid_orders: summary.filter((o) => o.status === "paid").length,
        cancelled_orders: summary.filter((o) => o.status === "cancelled").length,
        total_revenue_paid: totalRevenue,
        orders: summary,
      };
    },
  },
  {
    name: "obtener_ordenes_rango",
    description:
      "Trae ordenes entre dos fechas (YYYY-MM-DD). Opcionalmente filtra por estado.",
    inputSchema: {
      type: "object",
      required: ["from", "to"],
      properties: {
        from: {
          type: "string",
          description: "Fecha inicial inclusive en formato YYYY-MM-DD",
        },
        to: {
          type: "string",
          description: "Fecha final inclusive en formato YYYY-MM-DD",
        },
        status: {
          type: "string",
          description: "Filtrar por estado: paid, cancelled, confirmed",
        },
        max_orders: {
          type: "number",
          description: "Maximo de ordenes a traer (1-1000, por defecto 200)",
        },
      },
    },
    handler: async ({ from, to, status, max_orders } = {}) => {
      const orders = await fetchOrdersInRange({
        from: toIsoStart(from),
        to: toIsoEnd(to),
        status,
        maxOrders: max_orders,
      });

      const summary = orders.map(summarizeOrder);
      const totalRevenue = summary
        .filter((o) => o.status === "paid")
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      return {
        from,
        to,
        total_orders: summary.length,
        paid_orders: summary.filter((o) => o.status === "paid").length,
        total_revenue_paid: totalRevenue,
        orders: summary,
      };
    },
  },
];
