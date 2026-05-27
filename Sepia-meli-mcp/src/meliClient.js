import axios from "axios";
import {
  MELI_API_BASE,
  MELI_CLIENT_ID,
  MELI_CLIENT_SECRET,
  MELI_REDIRECT_URI,
  hasOAuthConfig,
  MELI_SELLER_ID,
} from "./config.js";
import { loadInitialTokens, saveTokens } from "./tokenStore.js";

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const withExpiration = (payload) => {
  const expiresIn = Number(payload?.expires_in || 0);
  const expiresAt =
    expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  return {
    ...payload,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
};

let tokens = null;
let refreshPromise = null;
let cachedSellerId = MELI_SELLER_ID;

const ensureLoaded = async () => {
  if (tokens) return;
  tokens = await loadInitialTokens();
  if (!tokens) {
    throw new Error(
      "No hay tokens de MeLi. Ejecuta 'npm run authorize' en la carpeta del MCP para autenticar.",
    );
  }
};

const tokenIsExpired = () => {
  if (!tokens?.access_token) return true;
  const exp = toIso(tokens.expires_at);
  if (!exp) return true;
  return Date.now() >= new Date(exp).getTime() - 60_000;
};

const refreshAccessToken = async () => {
  if (refreshPromise) return refreshPromise;
  if (!tokens?.refresh_token) {
    throw new Error("No hay refresh_token. Autentica de nuevo desde el backend.");
  }
  if (!hasOAuthConfig()) {
    throw new Error(
      "Faltan MELI_CLIENT_ID / MELI_CLIENT_SECRET / MELI_REDIRECT_URI en .env del MCP.",
    );
  }

  refreshPromise = (async () => {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: MELI_CLIENT_ID,
      client_secret: MELI_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    });

    const { data } = await axios.post(`${MELI_API_BASE}/oauth/token`, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20_000,
    });

    tokens = withExpiration({
      ...tokens,
      ...data,
      refresh_token: data.refresh_token || tokens.refresh_token,
    });
    await saveTokens(tokens);
    return tokens;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const getValidAccessToken = async () => {
  await ensureLoaded();
  if (!tokens.access_token && tokens.refresh_token) {
    await refreshAccessToken();
  }
  if (tokenIsExpired()) {
    await refreshAccessToken();
  }
  return tokens.access_token;
};

export const mlGet = async (endpoint, params = {}, retryOn401 = true) => {
  try {
    const accessToken = await getValidAccessToken();
    const { data } = await axios.get(`${MELI_API_BASE}${endpoint}`, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20_000,
    });
    return data;
  } catch (error) {
    if (error?.response?.status === 401 && retryOn401 && tokens?.refresh_token) {
      await refreshAccessToken();
      return mlGet(endpoint, params, false);
    }
    throw error;
  }
};

export const getSellerId = async () => {
  if (cachedSellerId) return cachedSellerId;
  const me = await mlGet("/users/me");
  cachedSellerId = String(me?.id || "");
  if (!cachedSellerId) throw new Error("No se pudo obtener seller_id de /users/me");
  return cachedSellerId;
};
