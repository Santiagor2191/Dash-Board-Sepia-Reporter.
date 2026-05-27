import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

const trimmed = (value) => String(value ?? "").trim();
const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const MELI_API_BASE = "https://api.mercadolibre.com";

export const MELI_CLIENT_ID = trimmed(process.env.MELI_CLIENT_ID);
export const MELI_CLIENT_SECRET = trimmed(process.env.MELI_CLIENT_SECRET);
export const MELI_REDIRECT_URI = trimmed(process.env.MELI_REDIRECT_URI);

export const INITIAL_ACCESS_TOKEN = trimmed(process.env.MELI_ACCESS_TOKEN);
export const INITIAL_REFRESH_TOKEN = trimmed(process.env.MELI_REFRESH_TOKEN);

export const MELI_SELLER_ID = trimmed(process.env.MELI_SELLER_ID) || null;

export const MCP_AUTH_PORT = num(process.env.MCP_AUTH_PORT, 8765);

// URL publica HTTPS registrada en MeLi. El backend redirige a localhost.
// Ej: https://nontransposable-veda-unintrudingly.ngrok-free.dev/mcp-callback
export const MCP_REDIRECT_URI = trimmed(process.env.MCP_REDIRECT_URI);

// Path interno donde el authorize.js escucha (recibe redirect 302 del backend)
export const MCP_LOCAL_CALLBACK_PATH = "/internal-callback";

export const DB_HOST = trimmed(process.env.DB_HOST) || "127.0.0.1";
export const DB_PORT = num(process.env.DB_PORT, 5432);
export const DB_USER = trimmed(process.env.DB_USER) || "postgres";
export const DB_PASSWORD = trimmed(process.env.DB_PASSWORD);
export const DB_NAME = trimmed(process.env.DB_NAME) || "mercado_libre_oficial";
export const DB_CONNECTION_LIMIT = num(process.env.DB_CONNECTION_LIMIT, 3);

export const TOKEN_FILE = path.join(projectRoot, ".tokens.json");

export const hasOAuthConfig = () =>
  Boolean(MELI_CLIENT_ID && MELI_CLIENT_SECRET && MELI_REDIRECT_URI);
