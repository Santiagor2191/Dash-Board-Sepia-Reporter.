import fs from "node:fs/promises";
import path from "node:path";
import {
  INITIAL_ACCESS_TOKEN,
  INITIAL_REFRESH_TOKEN,
  TOKEN_FILE,
} from "./config.js";

const readJsonSafe = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const writeJsonAtomic = async (filePath, data) => {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tokens.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
};

export const loadInitialTokens = async () => {
  const fromFile = await readJsonSafe(TOKEN_FILE);
  if (fromFile?.access_token || fromFile?.refresh_token) return fromFile;

  if (INITIAL_ACCESS_TOKEN || INITIAL_REFRESH_TOKEN) {
    return {
      access_token: INITIAL_ACCESS_TOKEN || null,
      refresh_token: INITIAL_REFRESH_TOKEN || null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    };
  }

  return null;
};

export const saveTokens = async (tokens) => {
  if (!tokens) return;
  await writeJsonAtomic(TOKEN_FILE, tokens);
};
