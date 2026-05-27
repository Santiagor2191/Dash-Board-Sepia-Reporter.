import pg from "pg";
const { Pool } = pg;
import {
  DB_CONNECTION_LIMIT,
  DB_HOST,
  DB_PASSWORD,
  DB_PORT,
  DB_SSL,
  DB_USER,
  RENTABILIDAD_DB_NAME,
} from "../config/env.js";

const pgPool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: RENTABILIDAD_DB_NAME,
  max: DB_CONNECTION_LIMIT,
  ssl: DB_SSL ? { rejectUnauthorized: false } : false,
});

export const rentabilidadPool = {
  query: async (text, params) => {
    const result = await pgPool.query(text, params);
    return [result.rows, result.fields];
  },
};
