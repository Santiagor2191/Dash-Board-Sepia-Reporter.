import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import { createMeliClient } from "../../src/services/meliClient.js";

test("meli client carga tokens iniciales y refresca en memoria", async (t) => {
  const originalPost = axios.post;
  const originalGet = axios.get;

  t.after(() => {
    axios.post = originalPost;
    axios.get = originalGet;
  });

  let refreshCalls = 0;

  axios.post = async (url, body, options) => {
    refreshCalls += 1;
    assert.equal(url, "https://api.test/oauth/token");
    assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");

    const payload = new URLSearchParams(body);
    assert.equal(payload.get("grant_type"), "refresh_token");
    assert.equal(payload.get("refresh_token"), "boot-refresh-token");

    return {
      data: {
        access_token: "fresh-access-token",
        refresh_token: "fresh-refresh-token",
        expires_in: 3600,
      },
    };
  };

  axios.get = async (url, options) => {
    assert.equal(url, "https://api.test/users/me");
    assert.equal(options.headers.Authorization, "Bearer fresh-access-token");
    return { data: { id: 123 } };
  };

  const updates = [];
  const client = createMeliClient({
    apiBase: "https://api.test",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://127.0.0.1/callback",
    initialTokens: {
      refresh_token: "boot-refresh-token",
    },
    onTokensUpdated: (tokens) => {
      updates.push(tokens ? { ...tokens } : null);
    },
  });

  await client.loadTokens();

  const bootstrappedTokens = client.getTokens();
  assert.equal(bootstrappedTokens.access_token, null);
  assert.equal(bootstrappedTokens.refresh_token, "boot-refresh-token");

  const me = await client.mlGet("/users/me");
  assert.equal(me.id, 123);
  assert.equal(refreshCalls, 1);

  const currentTokens = client.getTokens();
  assert.equal(currentTokens.access_token, "fresh-access-token");
  assert.equal(currentTokens.refresh_token, "fresh-refresh-token");
  assert.ok(currentTokens.expires_at);
  assert.equal(updates.length, 2);
});

test("meli client comparte un solo refresh concurrente", async (t) => {
  const originalPost = axios.post;
  const originalGet = axios.get;

  t.after(() => {
    axios.post = originalPost;
    axios.get = originalGet;
  });

  let refreshCalls = 0;
  let releaseRefresh;
  const refreshBarrier = new Promise((resolve) => {
    releaseRefresh = resolve;
  });

  axios.post = async () => {
    refreshCalls += 1;
    await refreshBarrier;
    return {
      data: {
        access_token: "shared-access-token",
        refresh_token: "shared-refresh-token",
        expires_in: 3600,
      },
    };
  };

  let getCalls = 0;
  axios.get = async () => {
    getCalls += 1;
    return { data: { ok: true } };
  };

  const client = createMeliClient({
    apiBase: "https://api.test",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://127.0.0.1/callback",
    initialTokens: {
      access_token: "expired-access-token",
      refresh_token: "boot-refresh-token",
      expires_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
  });

  await client.loadTokens();

  const firstCall = client.mlGet("/users/me");
  const secondCall = client.mlGet("/users/me");
  releaseRefresh();

  await Promise.all([firstCall, secondCall]);
  assert.equal(refreshCalls, 1);
  assert.equal(getCalls, 2);
  assert.equal(client.getTokens().access_token, "shared-access-token");
});
