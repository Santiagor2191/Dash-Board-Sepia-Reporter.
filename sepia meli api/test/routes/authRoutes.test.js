import assert from "node:assert/strict";
import test from "node:test";
import { createAuthRouter } from "../../src/routes/authRoutes.js";
import { createDashboardAuth } from "../../src/security/dashboardAuth.js";
import { createOAuthStateStore } from "../../src/security/oauthState.js";
import { requestJson, startServer } from "../helpers/http.js";

const readSessionCookie = (response) => {
  const rawCookie = response.headers.get("set-cookie");
  return rawCookie ? rawCookie.split(";")[0] : "";
};

const buildAuthRouter = ({
  authConfig = {},
  routeOverrides = {},
} = {}) => {
  const dashboardAuth = createDashboardAuth({
    enabled: true,
    adminPassword: "super-secret",
    sessionSecret: "session-secret",
    sessionTtlMs: 60_000,
    loginRateLimitWindowMs: 60_000,
    loginRateLimitMaxAttempts: 5,
    ...authConfig,
  });

  return createAuthRouter({
    dashboardAuth,
    hasOAuthConfig: () => true,
    oauthStateStore: createOAuthStateStore({ ttlMs: 60_000 }),
    exchangeCodeForTokens: async () => ({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }),
    mlGet: async () => ({
      id: 123,
      nickname: "Sepia",
      site_id: "MCO",
    }),
    refreshAccessToken: async () => ({
      access_token: "new-access-token",
      refresh_token: "refresh-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }),
    maskToken: (token) => `masked:${token}`,
    tokenIsExpired: () => false,
    getMeliTokens: () => ({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }),
    clientId: "test-client",
    redirectUri: "http://127.0.0.1/callback",
    frontendOrigins: ["http://127.0.0.1:5173", "http://localhost:5173"],
    ...routeOverrides,
  });
};

test("auth routes login, session status y redirect OAuth funcionan", async (t) => {
  const server = await startServer({
    mountPath: "/auth",
    router: buildAuthRouter(),
  });
  t.after(async () => server.close());

  const status = await requestJson(server.baseUrl, "/auth/session/status");
  assert.equal(status.response.status, 200);
  assert.equal(status.data.authEnabled, true);
  assert.equal(status.data.authenticated, false);

  const login = await requestJson(server.baseUrl, "/auth/session/login", {
    method: "POST",
    body: { password: "super-secret" },
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.authenticated, true);
  assert.equal("token" in login.data, false);

  const sessionCookie = readSessionCookie(login.response);
  assert.match(sessionCookie, /^sepia_dashboard_session=/);
  assert.match(login.response.headers.get("set-cookie"), /HttpOnly/i);

  const meliStatus = await requestJson(server.baseUrl, "/auth/mercadolibre/status", {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(meliStatus.response.status, 200);
  assert.equal(meliStatus.data.conectado, true);
  assert.equal(meliStatus.data.refreshDisponible, true);

  const oauthRedirect = await fetch(`${server.baseUrl}/auth/mercadolibre`, {
    headers: {
      Cookie: sessionCookie,
      Origin: "http://127.0.0.1:5173",
    },
    redirect: "manual",
  });
  assert.equal(oauthRedirect.status, 302);
  const location = oauthRedirect.headers.get("location");
  assert.match(location, /client_id=test-client/);
  assert.match(location, /state=/);

  const oauthState = new URL(location).searchParams.get("state");
  const callback = await fetch(
    `${server.baseUrl}/auth/mercadolibre/callback?code=abc&state=${encodeURIComponent(oauthState)}`,
    { redirect: "manual" },
  );
  assert.equal(callback.status, 302);
  assert.equal(
    callback.headers.get("location"),
    "http://127.0.0.1:5173/ordenes?meli_connected=true",
  );
});

test("auth routes rechazan callback con state invalido", async (t) => {
  const server = await startServer({
    mountPath: "/auth",
    router: buildAuthRouter(),
  });
  t.after(async () => server.close());

  const callback = await requestJson(
    server.baseUrl,
    "/auth/mercadolibre/callback?code=abc&state=invalid-state",
    { redirect: "manual" },
  );
  assert.equal(callback.response.status, 302);
  assert.equal(
    callback.response.headers.get("location"),
    "http://127.0.0.1:5173/ordenes?error=invalid_oauth_state",
  );
});

test("auth login rate limit no confia en X-Forwarded-For spoofeado", async (t) => {
  const server = await startServer({
    mountPath: "/auth",
    router: buildAuthRouter({
      authConfig: {
        loginRateLimitMaxAttempts: 2,
      },
    }),
  });
  t.after(async () => server.close());

  const first = await requestJson(server.baseUrl, "/auth/session/login", {
    method: "POST",
    headers: { "X-Forwarded-For": "198.51.100.10" },
    body: { password: "wrong-password" },
  });
  assert.equal(first.response.status, 401);

  const second = await requestJson(server.baseUrl, "/auth/session/login", {
    method: "POST",
    headers: { "X-Forwarded-For": "198.51.100.11" },
    body: { password: "wrong-password" },
  });
  assert.equal(second.response.status, 401);

  const third = await requestJson(server.baseUrl, "/auth/session/login", {
    method: "POST",
    headers: { "X-Forwarded-For": "198.51.100.12" },
    body: { password: "wrong-password" },
  });
  assert.equal(third.response.status, 429);
  assert.equal(third.data.ok, false);
});

test("auth routes sanitizan errores de refresh de Mercado Libre", async (t) => {
  const server = await startServer({
    mountPath: "/auth",
    router: buildAuthRouter({
      routeOverrides: {
        refreshAccessToken: async () => {
          const error = new Error("refresh token leaked");
          error.response = {
            status: 400,
            data: { error: "invalid_grant" },
          };
          throw error;
        },
      },
    }),
  });
  t.after(async () => server.close());

  const login = await requestJson(server.baseUrl, "/auth/session/login", {
    method: "POST",
    body: { password: "super-secret" },
  });
  const sessionCookie = readSessionCookie(login.response);

  const refresh = await requestJson(server.baseUrl, "/auth/mercadolibre/refresh", {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });

  assert.equal(refresh.response.status, 500);
  assert.equal(refresh.data.ok, false);
  assert.equal(refresh.data.mensaje, "No se pudo refrescar el token de Mercado Libre");
  assert.equal("detalle" in refresh.data, false);
});
