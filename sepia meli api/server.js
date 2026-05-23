import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import {
  API_RATE_LIMIT_MAX_REQUESTS,
  API_RATE_LIMIT_WINDOW_MS,
  AUTH_STATE_TTL_MS,
  DASHBOARD_ADMIN_PASSWORD,
  DASHBOARD_AUTH_ENABLED,
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
import { rentabilidadPool } from "./src/db/rentabilidadPool.js";
import { createRentabilidadService } from "./src/services/rentabilidadService.js";
import { createRentabilidadRouter } from "./src/routes/rentabilidadRoutes.js";

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
  excelPath: SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH,
  pythonBin: SEPIA_PYTHON_BIN,
});
const metaAdsSalesService = createMetaAdsSalesService({
  dbPool,
  excelPath: SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH,
  pythonBin: SEPIA_PYTHON_BIN,
});

const oauthStateStore = createOAuthStateStore({ ttlMs: AUTH_STATE_TTL_MS });
const meliClient = createMeliClient({
  apiBase: MELI_API_BASE,
  clientId: MELI_CLIENT_ID,
  clientSecret: MELI_CLIENT_SECRET,
  redirectUri: MELI_REDIRECT_URI,
  initialTokens: MELI_INITIAL_TOKENS,
  onTokensUpdated() {
    meliOrdersService?.clearCaches();
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

app.get("/", (req, res) => {
  res.json({ ok: true });
});
app.post("/notifications", (req, res) => {
  res.status(200).send("ok");
});

const start = async () => {
  await loadTokens();
  app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
    clientesContabilidadService.getDashboard().catch((error) => {
      console.warn("No se pudo precalentar el Excel de clientes y contabilidad:", error.message);
    });
    metaAdsSalesService.ensureSynchronized().catch((error) => {
      console.warn("No se pudo sincronizar Ventas Meta Ads a PostgreSQL:", error.message);
    });
  });
};

start().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
