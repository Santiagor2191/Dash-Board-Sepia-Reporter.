// Arma la app de Express completa (seguridad, servicios y rutas) SIN arrancar
// el servidor ni programar crons. La usan dos entornos:
//   - server.js (Render / local): agrega listen() + cron horario.
//   - netlifyHandler.js (Netlify Functions): la envuelve como funcion serverless.
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import {
  API_RATE_LIMIT_MAX_REQUESTS,
  API_RATE_LIMIT_WINDOW_MS,
  AUTH_STATE_TTL_MS,
  DASHBOARD_ADMIN_PASSWORD,
  DASHBOARD_AUTH_ENABLED,
  CRON_SECRET,
  FRONTEND_ORIGINS,
  JSON_BODY_LIMIT,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  MELI_API_BASE,
  MELI_CLIENT_ID,
  MELI_CLIENT_SECRET,
  MELI_INITIAL_TOKENS,
  MELI_REDIRECT_URI,
  MELI_RATE_LIMIT_MAX_REQUESTS,
  MELI_RATE_LIMIT_WINDOW_MS,
  META_ACCESS_TOKEN,
  META_AD_ACCOUNT_ID,
  ML_ORDERS_CACHE_TTL_MS,
  ML_ORDERS_PAGE_LIMIT,
  SESSION_SECRET,
  SESSION_TTL_MS,
  SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH,
  SEPIA_PYTHON_BIN,
  TRUST_PROXY,
  corsOptions,
  hasOAuthConfig,
} from "./config/env.js";
import { dbPool } from "./db/pool.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createDbRouter } from "./routes/dbRoutes.js";
import { createMeliRouter } from "./routes/meliRoutes.js";
import { createDashboardAuth } from "./security/dashboardAuth.js";
import { createOAuthStateStore } from "./security/oauthState.js";
import { createHistoricalSalesService } from "./services/historicalSalesService.js";
import { createClientesContabilidadService } from "./services/clientesContabilidadService.js";
import { createMetaAdsSalesService } from "./services/metaAdsSalesService.js";
import { createMetaAdsLiveService } from "./services/metaAdsLiveService.js";
import { createMetaSocialService } from "./services/metaSocialService.js";
import { createMeliClient } from "./services/meliClient.js";
import { createMeliOrdersService } from "./services/meliOrdersService.js";
import { createProductAdsService } from "./services/productAdsService.js";
import { createAdsRoutes } from "./routes/adsRoutes.js";
import { createMcpBridgeRouter } from "./routes/mcpBridgeRoutes.js";
import { rentabilidadPool } from "./db/rentabilidadPool.js";
import { createRentabilidadService } from "./services/rentabilidadService.js";
import { createRentabilidadRouter } from "./routes/rentabilidadRoutes.js";
import { createSyncMeliToDbService } from "./services/syncMeliToDbService.js";
import { createSyncRouter } from "./routes/syncRoutes.js";
import { createMeliTokenStore } from "./services/meliTokenStore.js";
import { createSocialSyncService } from "./services/socialSyncService.js";

export const buildApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", TRUST_PROXY);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  let meliOrdersService = null;

  const dashboardAuth = createDashboardAuth({
    enabled: DASHBOARD_AUTH_ENABLED,
    adminPassword: DASHBOARD_ADMIN_PASSWORD,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: SESSION_TTL_MS,
    loginRateLimitWindowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    loginRateLimitMaxAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  });
  const historicalSalesService = createHistoricalSalesService({ dbPool });
  const clientesContabilidadService = createClientesContabilidadService({
    dbPool,
    excelPath: SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH,
    pythonBin: SEPIA_PYTHON_BIN,
  });
  const metaAdsSalesService = createMetaAdsSalesService({
    dbPool,
    excelPath: SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH,
    pythonBin: SEPIA_PYTHON_BIN,
  });
  const metaAdsLiveService = createMetaAdsLiveService({
    accessToken: META_ACCESS_TOKEN,
    adAccountId: META_AD_ACCOUNT_ID,
  });
  const metaSocialService = createMetaSocialService({
    accessToken: META_ACCESS_TOKEN,
    adAccountId: META_AD_ACCOUNT_ID,
  });
  const socialSyncService = createSocialSyncService({ metaSocialService, dbPool });

  const oauthStateStore = createOAuthStateStore({ ttlMs: AUTH_STATE_TTL_MS });
  const meliTokenStore = createMeliTokenStore({ dbPool });
  const meliClient = createMeliClient({
    apiBase: MELI_API_BASE,
    clientId: MELI_CLIENT_ID,
    clientSecret: MELI_CLIENT_SECRET,
    redirectUri: MELI_REDIRECT_URI,
    initialTokens: MELI_INITIAL_TOKENS,
    onTokensUpdated(tokens) {
      meliOrdersService?.clearCaches();
      if (tokens) {
        meliTokenStore.save(tokens).catch((err) =>
          console.error("[tokens] Error guardando en DB:", err.message)
        );
      }
    },
  });
  const {
    loadTokens,
    exchangeCodeForTokens,
    refreshAccessToken,
    mlGet,
    tokenIsExpired,
    maskToken,
    getTokens,
  } = meliClient;
  meliOrdersService = createMeliOrdersService({
    mlGet,
    ordersCacheTtlMs: ML_ORDERS_CACHE_TTL_MS,
    ordersPageLimit: ML_ORDERS_PAGE_LIMIT,
  });
  const productAdsService = createProductAdsService({ meliClient: meliClient, dbPool });
  const rentabilidadService = createRentabilidadService({ rentabilidadPool, dbPool });
  const syncMeliToDbService = createSyncMeliToDbService({
    mlGet,
    dbPool,
    meliOrdersService,
  });

  app.use(
    "/auth",
    createAuthRouter({
      dashboardAuth,
      hasOAuthConfig,
      oauthStateStore,
      exchangeCodeForTokens,
      mlGet,
      refreshAccessToken,
      maskToken,
      tokenIsExpired,
      getMeliTokens: getTokens,
      clientId: MELI_CLIENT_ID,
      redirectUri: MELI_REDIRECT_URI,
      frontendOrigins: FRONTEND_ORIGINS,
    }),
  );
  const dbRateLimit = rateLimit({
    windowMs: API_RATE_LIMIT_WINDOW_MS,
    max: API_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, mensaje: "Demasiadas solicitudes a datos historicos. Intenta mas tarde." },
  });

  const meliRateLimit = rateLimit({
    windowMs: MELI_RATE_LIMIT_WINDOW_MS,
    max: MELI_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, mensaje: "Demasiadas solicitudes a Mercado Libre. Intenta mas tarde." },
  });

  app.use(
    "/db",
    dashboardAuth.requireSession,
    dbRateLimit,
    createDbRouter({ historicalSalesService, clientesContabilidadService, metaAdsSalesService, metaAdsLiveService, metaSocialService, dbPool }),
  );
  app.use(
    "/meli",
    dashboardAuth.requireSession,
    meliRateLimit,
    createMeliRouter({
      mlGet,
      meliOrdersService,
    }),
  );
  app.use(
    "/ads",
    dashboardAuth.requireSession,
    meliRateLimit,
    createAdsRoutes({ productAdsService })
  );
  app.use(
    "/api/rentabilidad",
    dashboardAuth.requireSession,
    dbRateLimit,
    createRentabilidadRouter({ rentabilidadService })
  );
  // Lock unico compartido entre el cron horario y el endpoint manual /admin/sync-ahora.
  // Asi evitamos que dos sync corran a la vez sobre la misma base.
  let syncEnEjecucion = false;
  const ejecutarSyncConLock = async ({ daysBack = 14, maxOrders = 1000 } = {}) => {
    if (syncEnEjecucion) {
      const err = new Error("Ya hay una sincronizacion en curso");
      err.statusCode = 409;
      throw err;
    }
    syncEnEjecucion = true;
    try {
      return await syncMeliToDbService.syncRecentOrders({ daysBack, maxOrders });
    } finally {
      syncEnEjecucion = false;
    }
  };

  app.use(
    "/admin",
    dashboardAuth.requireSession,
    dbRateLimit,
    createSyncRouter({ syncMeliToDbService, ejecutarSyncConLock }),
  );

  app.use(createMcpBridgeRouter());

  app.get("/", (req, res) => {
    res.json({ ok: true });
  });
  app.post("/notifications", (req, res) => {
    res.status(200).send("ok");
  });

  // Chequeo de x-cron-secret compartido por todos los endpoints /cron/*.
  // Devuelve un mensaje de error (o null si está autorizado) para que cada
  // ruta decida el status code sin duplicar la comparación timing-safe.
  const checkCronSecret = (req) => {
    if (!CRON_SECRET) return "CRON_SECRET no configurado en el servidor";
    const provided = String(req.headers["x-cron-secret"] || "").trim();
    const secretsMatch = provided.length === CRON_SECRET.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
    if (!provided || !secretsMatch) return "No autorizado";
    return null;
  };

  // POST /cron/sync — llamado por cron externo (GitHub Actions, cron-job.org, etc.)
  // Auth por header x-cron-secret; no requiere sesion del dashboard.
  app.post("/cron/sync", async (req, res) => {
    const authError = checkCronSecret(req);
    if (authError) {
      return res.status(authError.includes("no configurado") ? 503 : 401).json({ ok: false, mensaje: authError });
    }
    try {
      const resultado = await ejecutarSyncConLock({ daysBack: 14, maxOrders: 1000 });
      return res.json({ ok: true, ...resultado });
    } catch (error) {
      if (error?.statusCode === 409) {
        return res.status(409).json({ ok: false, mensaje: error.message });
      }
      console.error("[cron/sync] Error:", error.message);
      return res.status(500).json({ ok: false, mensaje: "Error ejecutando sync" });
    }
  });

  // Lock propio para el sync de Social Media — separado del de ventas
  // (dominios de falla distintos, uno no debe bloquear al otro).
  let socialSyncEnEjecucion = false;
  const ejecutarSocialSyncConLock = async () => {
    if (socialSyncEnEjecucion) {
      const err = new Error("Ya hay una sincronizacion de Social Media en curso");
      err.statusCode = 409;
      throw err;
    }
    socialSyncEnEjecucion = true;
    try {
      return await socialSyncService.correrSync();
    } finally {
      socialSyncEnEjecucion = false;
    }
  };

  // POST /cron/social-sync — mismo patrón que /cron/sync: llamado por
  // GitHub Actions una vez al día (schedule) o a mano (workflow_dispatch,
  // que cubre el disparo manual sin necesitar un botón en el dashboard).
  app.post("/cron/social-sync", async (req, res) => {
    const authError = checkCronSecret(req);
    if (authError) {
      return res.status(authError.includes("no configurado") ? 503 : 401).json({ ok: false, mensaje: authError });
    }
    try {
      const resultado = await ejecutarSocialSyncConLock();
      return res.json({ ok: true, ...resultado });
    } catch (error) {
      if (error?.statusCode === 409) {
        return res.status(409).json({ ok: false, mensaje: error.message });
      }
      console.error("[cron/social-sync] Error:", error.message);
      return res.status(500).json({ ok: false, mensaje: "Error ejecutando sync de Social Media" });
    }
  });

  // Carga los tokens de MeLi (DB primero, .env como respaldo). Cada entorno
  // decide cuando llamarla: server.js al arrancar, Netlify en cada cold start.
  const initTokens = async () => {
    const dbTokens = await meliTokenStore.load();
    if (dbTokens) {
      console.log("[tokens] Tokens cargados desde PostgreSQL");
    } else if (MELI_INITIAL_TOKENS) {
      console.log("[tokens] Tokens cargados desde .env (MELI_INITIAL_TOKENS)");
    } else {
      console.log("[tokens] Sin tokens — re-autentica en /auth/meli/login");
    }
    await loadTokens(dbTokens ?? MELI_INITIAL_TOKENS);
  };

  return {
    app,
    initTokens,
    ejecutarSyncConLock,
    clientesContabilidadService,
    metaAdsSalesService,
  };
};
