export const createMeliOrdersService = ({
  mlGet,
  ordersCacheTtlMs,
  ordersPageLimit,
}) => {
  let ordersHistoryCache = null;
  const categoryNameCache = new Map();

  const getCategoryName = async (categoryId) => {
    if (!categoryId) return null;
    if (categoryNameCache.has(categoryId)) return categoryNameCache.get(categoryId);

    try {
      const category = await mlGet(`/categories/${categoryId}`);
      const categoryName = category?.name || categoryId;
      categoryNameCache.set(categoryId, categoryName);
      return categoryName;
    } catch {
      categoryNameCache.set(categoryId, categoryId);
      return categoryId;
    }
  };

  const enrichOrdersWithCategoryNames = async (orders) => {
    const categoryIds = [
      ...new Set(
        (orders || [])
          .flatMap((order) => order?.order_items || [])
          .map((orderItem) => orderItem?.item?.category_id)
          .filter(Boolean),
      ),
    ];

    if (!categoryIds.length) return orders;

    const categoryEntries = await Promise.all(
      categoryIds.map(async (categoryId) => [categoryId, await getCategoryName(categoryId)]),
    );
    const categoryMap = new Map(categoryEntries);

    return (orders || []).map((order) => ({
      ...order,
      order_items: (order?.order_items || []).map((orderItem) => ({
        ...orderItem,
        item: orderItem?.item
          ? {
              ...orderItem.item,
              category_name:
                categoryMap.get(orderItem.item.category_id) ||
                orderItem.item.category_name ||
                orderItem.item.category_id ||
                null,
            }
          : orderItem.item,
      })),
    }));
  };

  const getSellerOrdersHistory = async (sellerId, { force = false, maxOrders = 2500 } = {}) => {
    const normalizedMax = Math.min(Math.max(Number(maxOrders) || 2500, 1), 5000);

    if (
      !force &&
      ordersHistoryCache?.sellerId === sellerId &&
      Date.now() - ordersHistoryCache.fetchedAt < ordersCacheTtlMs &&
      ordersHistoryCache.maxOrders >= normalizedMax
    ) {
      return ordersHistoryCache;
    }

    const results = [];
    let paging = null;
    let offset = 0;

    while (offset < normalizedMax) {
      const limit = Math.min(ordersPageLimit, normalizedMax - offset);
      const page = await mlGet("/orders/search", {
        seller: sellerId,
        sort: "date_desc",
        limit,
        offset,
      });

      const batch = page?.results || [];
      paging = page?.paging || paging;
      results.push(...batch);

      if (!batch.length || batch.length < limit) break;

      offset += batch.length;

      if (paging?.total && offset >= paging.total) break;
    }

    const enrichedResults = await enrichOrdersWithCategoryNames(results);

    ordersHistoryCache = {
      sellerId,
      maxOrders: normalizedMax,
      fetchedAt: Date.now(),
      paging: paging || null,
      results: enrichedResults,
    };

    return ordersHistoryCache;
  };

  const clearCaches = () => {
    ordersHistoryCache = null;
    categoryNameCache.clear();
  };

  return {
    clearCaches,
    getCategoryName,
    enrichOrdersWithCategoryNames,
    getSellerOrdersHistory,
  };
};
