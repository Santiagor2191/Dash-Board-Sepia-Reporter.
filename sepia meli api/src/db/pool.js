import pg from "pg";
const { Pool } = pg;
import {
  DB_CONNECTION_LIMIT,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
  DB_USER,
} from "../config/env.js";

const pgPool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  max: DB_CONNECTION_LIMIT,
});

export const dbPool = {
  query: async (text, params) => {
    const result = await pgPool.query(text, params);
    return [result.rows, result.fields];
  }
};
