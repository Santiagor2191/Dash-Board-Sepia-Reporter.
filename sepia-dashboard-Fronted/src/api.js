const resolveDefaultApiBaseUrl = () => {
  if (typeof window === "undefined") return "http://localhost:3000";

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000`;
};

export const API_BASE_URL = import.meta.env.VITE_API_URL || resolveDefaultApiBaseUrl();

const normalizeDetail = (detail) => {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") {
    const msg = detail?.message || detail?.error || detail?.mensaje || detail?.cause;
    if (msg) return String(msg);
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
};

const toErrorMessage = (payload, status) => {
  if (payload?.mensaje) {
    const detailText = normalizeDetail(payload?.detalle);
    return detailText ? `${payload.mensaje} (${detailText})` : payload.mensaje;
  }
  return payload?.error || payload?.message || `Error HTTP ${status}`;
};

const buildError = (payload, status) => {
  const error = new Error(toErrorMessage(payload, status));
  error.status = status;
  error.payload = payload;
  return error;
};

const request = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    // Siempre datos frescos: sin esto el navegador cachea las respuestas GET
    // (el backend no manda cabeceras anti-cache) y muestra datos viejos.
    cache: "no-store",
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.ok === false) {
    if (response.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sepia-auth-expired"));
      }
    }
    throw buildError(payload, response.status);
  }

  return payload;
};

export const getStatus = () => request("/auth/mercadolibre/status");
export const getSessionStatus = () => request("/auth/session/status");
export const loginSession = async (password) => {
  return request("/auth/session/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
};
export const logoutSession = async () => {
  return request("/auth/session/logout", { method: "POST" });
};
export const redirectToMercadoLibreAuth = () => {
  if (typeof window !== "undefined") {
    window.location.assign(`${API_BASE_URL}/auth/mercadolibre`);
  }
};
export const getMe = () => request("/meli/me");
export const getRecentOrders = (limit = 50) =>
  request(`/meli/orders/recent?limit=${encodeURIComponent(limit)}`);
export const getOrderHistory = (max = 2500, force = false) =>
  request(`/meli/orders/history?max=${encodeURIComponent(max)}&force=${force ? "true" : "false"}`);
export const getDbVentas = () => request("/db/ventas");
export const getDbResumen = () => request("/db/resumen");
export const getInteligencia = () => request("/db/inteligencia");
export const getClientesContabilidadDashboard = () => request("/db/clientes-contabilidad");
export const getVentasMetaAdsDashboard = () => request("/db/ventas-meta-ads");
export const getMetaAdsLive = (since, until) =>
  request(
    since && until
      ? `/db/meta-ads-live?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`
      : "/db/meta-ads-live",
  );
export const getInventory = (force = false) =>
  request(`/meli/inventory${force ? "?force=true" : ""}`);
export const getConversion = (force = false) =>
  request(`/meli/conversion${force ? "?force=true" : ""}`);
export const getAdsMetrics = () => request("/ads/metrics");
export const getAdsDiagnose = () => request("/ads/diagnose");
export const getRentabilidadResumen = () => request("/api/rentabilidad/resumen");
export const getRentabilidadEstructuraCostos = () => request("/api/rentabilidad/estructura-costos");
export const getRentabilidadTopRentables = () => request("/api/rentabilidad/top-rentables");
export const getRentabilidadConPerdida = () => request("/api/rentabilidad/con-perdida");
export const getRentabilidadPremiumVsClasica = () => request("/api/rentabilidad/premium-vs-clasica");
export const getRentabilidadCostoPorVentas = () => request("/api/rentabilidad/costo-por-ventas");
export const getRentabilidadCostosMap = () => request("/api/rentabilidad/costos-map");
export const postSyncAhora = () => request("/admin/sync-ahora", { method: "POST" });
export const getSyncLog = (limit = 20) => request(`/admin/sync-log?limit=${limit}`);
