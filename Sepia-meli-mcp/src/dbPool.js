import pg from "pg";
import {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_CONNECTION_LIMIT,
} from "./config.js";

const { Pool } = pg;

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  max: DB_CONNECTION_LIMIT,
});

export const dbQuery = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows;
};

export const closePool = () => pool.end();
