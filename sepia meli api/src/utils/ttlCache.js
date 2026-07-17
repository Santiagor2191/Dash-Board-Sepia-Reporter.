// Cache en memoria con TTL, compartido entre servicios que consultan APIs
// externas (Meta, Google Ads, etc). get() distingue hit fresco de hit vencido
// para que el servicio pueda devolver dato vencido como respaldo si el fetch
// fresco falla, en vez de perder esa posibilidad como pasaría con un get()
// que solo devuelve null/undefined en cualquier miss.
export const createTtlCache = ({ ttlMs, maxEntries = 30 }) => {
  const store = new Map(); // key -> { data, at }

  const get = (key) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    const fresh = Date.now() - entry.at < ttlMs;
    return { fresh, data: entry.data };
  };

  const set = (key, data) => {
    // ponytail: cache simple acotado; si crece mucho se vacía y ya
    if (store.size > maxEntries) store.clear();
    store.set(key, { data, at: Date.now() });
  };

  return { get, set };
};
