import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import crypto from "crypto";
import {
  API_RATE_LIMIT_MAX_REQUESTS,
  API_RATE_LIMIT_WINDOW_MS,
  AUTH_STATE_TTL_MS,
  DASHBOARD_ADMIN_PASSWORD,
  DASHBOARD_AUTH_ENABLED,
  CRON_SECRET,
  FRONTEND_ORIGINS,
  HOST,
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
  ML_ORDERS_CACHE_TTL_MS,
  ML_ORDERS_PAGE_LIMIT,
  PORT,
  SESSION_SECRET,
  SESSION_TTL_MS,
  SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH,
  SEPIA_PYTHON_BIN,
  TRUST_PROXY,
  corsOptions,
  hasOAuthConfig,
} from "./src/config/env.js";
import { dbPool } from "./src/db/pool.js";
import { createAuthRouter } from "./src/routes/authRoutes.js";
import { createDbRouter } from "./src/routes/dbRoutes.js";
import { createMeliRouter } from "./src/routes/meliRoutes.js";
import { createDashboardAuth } from "./src/security/dashboardAuth.js";
import { createOAuthStateStore } from "./src/security/oauthState.js";
import { createHistoricalSalesService } from "./src/services/historicalSalesService.js";
import { createClientesContabilidadService } from "./src/services/clientesContabilidadService.js";
import { createMetaAdsSalesService } from "./src/services/metaAdsSalesService.js";
import { createMeliClient } from "./src/services/meliClient.js";
import { createMeliOrdersService } from "./src/services/meliOrdersService.js";
import { createProductAdsService } from "./src/services/productAdsService.js";
import { createAdsRoutes } from "./src/routes/adsRoutes.js";
import { createMcpBridgeRouter } from "./src/routes/mcpBridgeRoutes.js";
import { rentabilidadPool } from "./src/db/rentabilidadPool.js";
import { createRentabilidadService } from "./src/services/rentabilidadService.js";
import { createRentabilidadRouter } from "./src/routes/rentabilidadRoutes.js";
import { createSyncMeliToDbService } from "./src/services/syncMeliToDbService.js";
import { createSyncRouter } from "./src/routes/syncRoutes.js";
import { createMeliTokenStore } from "./src/services/meliTokenStore.js";

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
  createDbRouter({ historicalSalesService, clientesContabilidadService, metaAdsSalesService }),
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

// POST /cron/sync — llamado por cron externo (GitHub Actions, cron-job.org, etc.)
// Auth por header x-cron-secret; no requiere sesion del dashboard.
app.post("/cron/sync", async (req, res) => {
  if (!CRON_SECRET) {
    return res.status(503).json({ ok: false, mensaje: "CRON_SECRET no configurado en el servidor" });
  }
  const provided = String(req.headers["x-cron-secret"] || "").trim();
  const secretsMatch = provided.length === CRON_SECRET.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
  if (!provided || !secretsMatch) {
    return res.status(401).json({ ok: false, mensaje: "No autorizado" });
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

// Wrapper para correr el sync desde el cron/startup con logging y sin propagar errores
const correrSyncSeguro = async (contexto) => {
  const inicio = Date.now();
  try {
    const resultado = await ejecutarSyncConLock({ daysBack: 14, maxOrders: 1000 });
    const segs = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(
      `[sync ${contexto}] OK en ${segs}s — ${resultado.ordenes_procesadas} ordenes, ` +
      `${resultado.ordenes_nuevas} nuevas, ${resultado.ordenes_actualizadas} actualizadas, ` +
      `${resultado.errores} errores`,
    );
  } catch (error) {
    if (error?.statusCode === 409) {
      console.log(`[sync ${contexto}] omitido: ya hay otro sync corriendo`);
    } else {
      console.error(`[sync ${contexto}] FALLO:`, error.message);
    }
  }
};

const start = async () => {
  const dbTokens = await meliTokenStore.load();
  if (dbTokens) {
    console.log("[tokens] Tokens cargados desde PostgreSQL");
  } else if (MELI_INITIAL_TOKENS) {
    console.log("[tokens] Tokens cargados desde .env (MELI_INITIAL_TOKENS)");
  } else {
    console.log("[tokens] Sin tokens — re-autentica en /auth/meli/login");
  }
  await loadTokens(dbTokens ?? MELI_INITIAL_TOKENS);
  app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
    clientesContabilidadService.getDashboard().catch((error) => {
      console.warn("No se pudo precalentar el Excel de clientes y contabilidad:", error.message);
    });
    metaAdsSalesService.ensureSynchronized().catch((error) => {
      console.warn("No se pudo sincronizar Ventas Meta Ads a PostgreSQL:", error.message);
    });

    // Sync inicial al arrancar (no bloquea el servidor)
    correrSyncSeguro("startup");

    // Sync horario en el minuto 5 de cada hora (zona Colombia)
    cron.schedule("5 * * * *", () => correrSyncSeguro("cron"), {
      timezone: "America/Bogota",
    });
    console.log("Cron programado: sync MeLi -> PostgreSQL cada hora en el minuto 5 (America/Bogota)");
  });
};

start().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
