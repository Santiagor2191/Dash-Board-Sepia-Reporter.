import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toTrimmedString = (value) => String(value || "").trim();

const toTrustProxy = (value) => {
  const raw = toTrimmedString(value);
  if (!raw) return false;

  const normalized = raw.toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  return raw;
};

const DEFAULT_FRONTEND_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3005",
  "http://127.0.0.1:3005",
];

export const PORT = toNumber(process.env.PORT, 3000);
export const HOST = process.env.HOST || "127.0.0.1";
export const MELI_API_BASE = "https://api.mercadolibre.com";
export const ML_ORDERS_PAGE_LIMIT = 50;
export const ML_ORDERS_CACHE_TTL_MS = 5 * 60 * 1000;
export const AUTH_STATE_TTL_MS = toNumber(process.env.AUTH_STATE_TTL_MS, 10 * 60 * 1000);
export const SESSION_TTL_MS = toNumber(process.env.SESSION_TTL_MS, 12 * 60 * 60 * 1000);
export const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "16kb";
export const TRUST_PROXY = toTrustProxy(process.env.TRUST_PROXY);
export const LOGIN_RATE_LIMIT_WINDOW_MS = toNumber(
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = toNumber(
  process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  8,
);
export const DASHBOARD_ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "";
export const DASHBOARD_AUTH_ENABLED = Boolean(DASHBOARD_ADMIN_PASSWORD);
export const SESSION_SECRET = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  console.warn(
    "WARN: SESSION_SECRET no definido en .env — se genero uno aleatorio. Las sesiones no sobreviviran reinicios del servidor.",
  );
  return crypto.randomBytes(32).toString("hex");
})();
export const CRON_SECRET = toTrimmedString(process.env.CRON_SECRET);
export const MELI_CLIENT_ID = process.env.MELI_CLIENT_ID || "";
export const MELI_CLIENT_SECRET = process.env.MELI_CLIENT_SECRET || "";
export const MELI_REDIRECT_URI = process.env.MELI_REDIRECT_URI || "";
export const MELI_INITIAL_TOKENS = (() => {
  const accessToken = toTrimmedString(process.env.MELI_ACCESS_TOKEN);
  const refreshToken = toTrimmedString(process.env.MELI_REFRESH_TOKEN);
  if (!accessToken && !refreshToken) return null;

  return {
    access_token: accessToken || null,
    refresh_token: refreshToken || null,
    expires_at: toTrimmedString(process.env.MELI_TOKEN_EXPIRES_AT) || null,
    updated_at: toTrimmedString(process.env.MELI_TOKEN_UPDATED_AT) || null,
  };
})();
export const DB_HOST = process.env.DB_HOST || "127.0.0.1";
export const DB_PORT = toNumber(process.env.DB_PORT, 5432);
export const DB_USER = process.env.DB_USER || "postgres";
export const DB_PASSWORD = process.env.DB_PASSWORD || "";
export const DB_NAME = process.env.DB_NAME || "mercado_libre_oficial";
export const DB_SSL = (process.env.DB_SSL || "false").toLowerCase() === "true";
export const DB_CONNECTION_LIMIT = toNumber(process.env.DB_CONNECTION_LIMIT, 5);
export const RENTABILIDAD_DB_NAME = process.env.RENTABILIDAD_DB_NAME || "publicaciones_ml_contabilidad";
export const SEPIA_PYTHON_BIN = process.env.SEPIA_PYTHON_BIN || "python";
export const META_ACCESS_TOKEN = toTrimmedString(process.env.META_ACCESS_TOKEN);
export const META_AD_ACCOUNT_ID = toTrimmedString(process.env.META_AD_ACCOUNT_ID) || "act_2364835850377283";
export const SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH =
  process.env.SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH ||
  "C:\\Users\\SANTIAGO\\OneDrive - uniminuto.edu\\Escritorio\\Datos Clientes Y Contabilidad.xlsx";
export const API_RATE_LIMIT_WINDOW_MS = toNumber(
  process.env.API_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
export const API_RATE_LIMIT_MAX_REQUESTS = toNumber(
  process.env.API_RATE_LIMIT_MAX_REQUESTS,
  100,
);
export const MELI_RATE_LIMIT_WINDOW_MS = toNumber(
  process.env.MELI_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
export const MELI_RATE_LIMIT_MAX_REQUESTS = toNumber(
  process.env.MELI_RATE_LIMIT_MAX_REQUESTS,
  60,
);

export const FRONTEND_ORIGINS = (
  process.env.FRONTEND_ORIGINS || DEFAULT_FRONTEND_ORIGINS.join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const CORS_ALLOW_NO_ORIGIN =
  (process.env.CORS_ALLOW_NO_ORIGIN || "false").toLowerCase() === "true";

export const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, CORS_ALLOW_NO_ORIGIN);
    return callback(null, FRONTEND_ORIGINS.includes(origin));
  },
  credentials: true,
};

export const hasOAuthConfig = () =>
  Boolean(
    MELI_CLIENT_ID &&
      MELI_CLIENT_SECRET &&
      MELI_REDIRECT_URI,
  );

if (process.env.MELI_TOKEN_FILE) {
  console.warn(
    "WARN: MELI_TOKEN_FILE quedo obsoleto. Los tokens de Mercado Libre ya no se persisten en archivos.",
  );
}
