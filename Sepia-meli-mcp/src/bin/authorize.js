#!/usr/bin/env node
/**
 * One-shot OAuth para el MCP Sepia MeLi.
 *
 * 1. Levanta un servidor HTTP local en MCP_AUTH_PORT (default 8765).
 * 2. Abre el navegador en https://auth.mercadolibre.com.co/authorization
 * 3. Captura el code del callback, lo intercambia por tokens.
 * 4. Guarda los tokens en .tokens.json y termina.
 */

import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import { exec } from "node:child_process";
import axios from "axios";

import {
  MELI_API_BASE,
  MELI_CLIENT_ID,
  MELI_CLIENT_SECRET,
  MCP_AUTH_PORT,
  MCP_REDIRECT_URI,
  MCP_LOCAL_CALLBACK_PATH,
} from "../config.js";
import { saveTokens } from "../tokenStore.js";

const AUTH_BASE = "https://auth.mercadolibre.com.co/authorization";

const fail = (msg) => {
  console.error(`\n[ERROR] ${msg}\n`);
  process.exit(1);
};

if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) {
  fail(
    "Falta MELI_CLIENT_ID o MELI_CLIENT_SECRET en .env.\n" +
      "Copialos del backend (sepia meli api/.env) al .env del MCP.",
  );
}

if (!MCP_REDIRECT_URI || !MCP_REDIRECT_URI.startsWith("https://")) {
  fail(
    "Falta MCP_REDIRECT_URI en .env (debe ser HTTPS publico, ej. la URL de ngrok del backend + /mcp-callback).\n" +
      "Ejemplo: https://nontransposable-veda-unintrudingly.ngrok-free.dev/mcp-callback",
  );
}

const state = crypto.randomBytes(16).toString("hex");

const authUrl = new URL(AUTH_BASE);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", MELI_CLIENT_ID);
authUrl.searchParams.set("redirect_uri", MCP_REDIRECT_URI);
authUrl.searchParams.set("state", state);

const openBrowser = (url) => {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log("No se pudo abrir el navegador automaticamente.");
      console.log("Abre esta URL manualmente:\n");
      console.log(`  ${url}\n`);
    }
  });
};

const finish = (server, success, message) => {
  setTimeout(() => {
    server.close();
    process.exit(success ? 0 : 1);
  }, 500);
  return message;
};

const exchangeCodeForTokens = async (code) => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: MELI_CLIENT_ID,
    client_secret: MELI_CLIENT_SECRET,
    code,
    redirect_uri: MCP_REDIRECT_URI,
  });

  const { data } = await axios.post(`${MELI_API_BASE}/oauth/token`, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20_000,
  });

  return data;
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${MCP_AUTH_PORT}`);

  if (url.pathname !== MCP_LOCAL_CALLBACK_PATH) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not found. Esperando callback en ${MCP_LOCAL_CALLBACK_PATH}`);
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const receivedState = url.searchParams.get("state");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h1>Error de MeLi</h1><pre>${error}</pre>`);
    finish(server, false, error);
    return;
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>Falta el parametro 'code'</h1>");
    finish(server, false, "no code");
    return;
  }

  if (receivedState !== state) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>state invalido (posible CSRF)</h1>");
    finish(server, false, "bad state");
    return;
  }

  try {
    const data = await exchangeCodeForTokens(code);

    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
      scope: data.scope,
      user_id: data.user_id,
      expires_at: new Date(Date.now() + Number(data.expires_in || 0) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };

    await saveTokens(tokens);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>MCP autorizado</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
            h1 { color: #0a7a3b; }
            code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>Listo</h1>
          <p>El MCP Sepia MeLi quedo autorizado para el vendedor <code>${data.user_id}</code>.</p>
          <p>Los tokens estan guardados en <code>.tokens.json</code>.</p>
          <p>Puedes cerrar esta ventana.</p>
        </body>
      </html>
    `);

    console.log("\n[OK] Tokens guardados en .tokens.json");
    console.log(`     user_id:    ${data.user_id}`);
    console.log(`     expira en:  ${data.expires_in}s`);
    console.log(`     scope:      ${data.scope || "(default)"}\n`);

    finish(server, true, "ok");
  } catch (err) {
    const detail = err?.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h1>Error al intercambiar code</h1><pre>${detail}</pre>`);
    console.error("\n[ERROR] No se pudo intercambiar el code:\n", detail);
    finish(server, false, detail);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    fail(
      `El puerto ${MCP_AUTH_PORT} esta ocupado. Cambialo en .env con MCP_AUTH_PORT=otroPuerto\n` +
        "y recuerda actualizar tambien MCP_REDIRECT_URI y la URI registrada en MeLi.",
    );
  } else {
    fail(`Error iniciando servidor local: ${err.message}`);
  }
});

server.listen(MCP_AUTH_PORT, "127.0.0.1", () => {
  console.log("\n=== Sepia MeLi MCP - Autorizacion OAuth ===\n");
  console.log(`Local callback:    http://127.0.0.1:${MCP_AUTH_PORT}${MCP_LOCAL_CALLBACK_PATH}`);
  console.log(`Redirect URI MeLi: ${MCP_REDIRECT_URI}`);
  console.log("\nIMPORTANTE: el backend Express tiene que estar corriendo (ngrok activo).");
  console.log("\nAbriendo navegador en MeLi...");
  console.log("Si no se abre solo, copia esta URL:");
  console.log(`\n  ${authUrl.toString()}\n`);
  openBrowser(authUrl.toString());
});
