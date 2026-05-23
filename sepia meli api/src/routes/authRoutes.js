import express from "express";
import { sendInternalError } from "../security/httpErrors.js";

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const createAuthRouter = ({
  dashboardAuth,
  hasOAuthConfig,
  oauthStateStore,
  exchangeCodeForTokens,
  mlGet,
  refreshAccessToken,
  maskToken,
  tokenIsExpired,
  getMeliTokens,
  clientId,
  redirectUri,
  frontendOrigins = [],
}) => {
  const router = express.Router();
  const defaultFrontendOrigin = frontendOrigins[0] || "http://localhost:5173";

  const toAllowedFrontendOrigin = (candidate) => {
    if (!candidate) return null;

    try {
      const origin = new URL(candidate).origin;
      return frontendOrigins.includes(origin) ? origin : null;
    } catch {
      return null;
    }
  };

  const resolveFrontendOrigin = (req) =>
    toAllowedFrontendOrigin(req.headers.origin) ||
    toAllowedFrontendOrigin(req.headers.referer) ||
    defaultFrontendOrigin;

  router.get("/session/status", (req, res) => {
    return res.json(dashboardAuth.getStatus(req));
  });

  router.post("/session/login", (req, res) => {
    const result = dashboardAuth.login(req, String(req.body?.password || ""));
    if (result.sessionToken) {
      dashboardAuth.setSessionCookie(req, res, result.sessionToken, result.sessionMaxAgeMs);
    }
    if (result.retryAfterSec) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
    }
    return res.status(result.status).json(result.body);
  });

  router.post("/session/logout", dashboardAuth.requireSession, (req, res) => {
    const result = dashboardAuth.logout(req);
    dashboardAuth.clearSessionCookie(req, res);
    return res.status(result.status).json(result.body);
  });

  router.get("/mercadolibre", dashboardAuth.requireSession, (req, res) => {
    if (!hasOAuthConfig()) {
      return res.status(500).json({
        ok: false,
        mensaje: "Faltan variables .env para OAuth de Mercado Libre",
      });
    }

    const state = oauthStateStore.register(req.query.state, {
      frontendOrigin: resolveFrontendOrigin(req),
    });
    const authUrl =
      `https://auth.mercadolibre.com.co/authorization?response_type=code` +
      `&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return res.redirect(authUrl);
  });

  router.get("/mercadolibre/callback", async (req, res) => {
    const { code, state } = req.query;
    const oauthState = oauthStateStore.consume(String(state || "").trim());
    const frontendUrl = oauthState?.frontendOrigin || defaultFrontendOrigin;

    if (!code) {
      return res.redirect(`${frontendUrl}/ordenes?error=no_code_from_meli`);
    }

    if (!oauthState) {
      return res.redirect(`${frontendUrl}/ordenes?error=invalid_oauth_state`);
    }

    try {
      await exchangeCodeForTokens(code);

      return res.redirect(`${frontendUrl}/ordenes?meli_connected=true`);
    } catch (error) {
      console.error("MeLi Callback Fetch Error:", error?.response?.data || error?.message || error);
      return res.redirect(`${frontendUrl}/ordenes?error=meli_oauth_rejected`);
    }
  });

  router.get("/mercadolibre/status", dashboardAuth.requireSession, (req, res) => {
    const meliTokens = getMeliTokens();
    const connected = Boolean(meliTokens?.access_token);
    const exp = toIso(meliTokens?.expires_at);

    return res.json({
      ok: true,
      conectado: connected,
      expiraEn: exp,
      expiro: connected ? tokenIsExpired(meliTokens) : null,
      refreshDisponible: Boolean(meliTokens?.refresh_token),
    });
  });

  router.post("/mercadolibre/refresh", dashboardAuth.requireSession, async (req, res) => {
    try {
      const tokens = await refreshAccessToken();
      return res.json({
        ok: true,
        mensaje: "Token refrescado",
        token: {
          access_token: maskToken(tokens.access_token),
          refresh_token: maskToken(tokens.refresh_token),
          expires_at: tokens.expires_at,
        },
      });
    } catch (error) {
      return sendInternalError(
        res,
        "Error refrescando token de Mercado Libre",
        "No se pudo refrescar el token de Mercado Libre",
        error,
      );
    }
  });

  return router;
};
