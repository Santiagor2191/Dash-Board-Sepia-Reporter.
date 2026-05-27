import axios from "axios";

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const withExpiration = (tokenPayload) => {
  const expiresIn = Number(tokenPayload?.expires_in || 0);
  const expiresAt =
    expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  return {
    ...tokenPayload,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
};

const maskToken = (token) => {
  if (!token) return null;
  if (token.length <= 10) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

const normalizeTokens = (tokenPayload) => {
  if (!tokenPayload) return null;

  const accessToken = String(tokenPayload.access_token || "").trim();
  const refreshToken = String(tokenPayload.refresh_token || "").trim();
  if (!accessToken && !refreshToken) return null;

  return {
    ...tokenPayload,
    access_token: accessToken || null,
    refresh_token: refreshToken || null,
    expires_at: toIso(tokenPayload.expires_at),
    updated_at: toIso(tokenPayload.updated_at) || new Date().toISOString(),
  };
};

export const createMeliClient = ({
  apiBase,
  clientId,
  clientSecret,
  redirectUri,
  initialTokens,
  onTokensUpdated,
}) => {
  let tokens = null;
  let refreshPromise = null;

  const saveTokens = async (nextTokens) => {
    tokens = normalizeTokens(nextTokens);
    if (typeof onTokensUpdated === "function") onTokensUpdated(tokens);
  };

  const tokenIsExpired = (currentTokens) => {
    if (!currentTokens?.access_token) return true;
    const expiresAt = toIso(currentTokens.expires_at);
    if (!expiresAt) return true;

    const now = Date.now();
    const bufferMs = 60_000;
    return now >= new Date(expiresAt).getTime() - bufferMs;
  };

  const loadTokens = async (overrideTokens) => {
    const source = overrideTokens !== undefined ? overrideTokens : initialTokens;
    tokens = normalizeTokens(source);
    if (typeof onTokensUpdated === "function") onTokensUpdated(tokens);
  };

  const requireOAuthConfig = () => {
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Falta configurar MELI_CLIENT_ID, MELI_CLIENT_SECRET o MELI_REDIRECT_URI.");
    }
  };

  const exchangeCodeForTokens = async (code) => {
    requireOAuthConfig();

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const { data } = await axios.post(`${apiBase}/oauth/token`, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000,
    });

    const nextTokens = withExpiration(data);
    await saveTokens(nextTokens);
    return nextTokens;
  };

  const refreshAccessToken = async () => {
    if (refreshPromise) return refreshPromise;
    if (!tokens?.refresh_token) {
      throw new Error("No hay refresh_token guardado. Debes autenticar de nuevo.");
    }

    refreshPromise = (async () => {
      requireOAuthConfig();

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
      });

      const { data } = await axios.post(`${apiBase}/oauth/token`, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 20000,
      });

      const nextTokens = withExpiration({
        ...tokens,
        ...data,
        refresh_token: data.refresh_token || tokens.refresh_token,
      });

      await saveTokens(nextTokens);
      return nextTokens;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  };

  const getValidAccessToken = async () => {
    if (!tokens?.access_token && tokens?.refresh_token) {
      await refreshAccessToken();
    }

    if (!tokens?.access_token) {
      throw new Error("No hay access token. Autentica en /auth/mercadolibre.");
    }

    if (tokenIsExpired(tokens)) {
      await refreshAccessToken();
    }

    return tokens.access_token;
  };

  const mlGet = async (endpoint, params = {}, retryOn401 = true, extraHeaders = {}) => {
    try {
      const accessToken = await getValidAccessToken();
      const { data } = await axios.get(`${apiBase}${endpoint}`, {
        params,
        headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
        timeout: 20000,
      });
      return data;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 && retryOn401 && tokens?.refresh_token) {
        await refreshAccessToken();
        return mlGet(endpoint, params, false, extraHeaders);
      }
      throw error;
    }
  };

  return {
    loadTokens,
    exchangeCodeForTokens,
    refreshAccessToken,
    mlGet,
    tokenIsExpired,
    maskToken,
    getTokens: () => (tokens ? { ...tokens } : null),
  };
};
