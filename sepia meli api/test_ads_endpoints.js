import("./src/config/env.js").then(async (env) => {
  const { createMeliClient } = await import("./src/services/meliClient.js");
  const authRoutes = await import("./src/routes/authRoutes.js"); // To initialize fetch polyfills if any
  const ml = createMeliClient({
    apiBase: env.MELI_API_BASE,
    clientId: env.MELI_CLIENT_ID,
    clientSecret: env.MELI_CLIENT_SECRET,
    redirectUri: env.MELI_REDIRECT_URI,
    initialTokens: env.MELI_INITIAL_TOKENS,
  });
  await ml.loadTokens(); // Fails if token from dashboard UI isn't stored locally, let me override it if I can?
  // Wait, the API token from user UI interaction wasn't saved to .env, so loadTokens will load the old empty one.
  // To avoid this, I can fetch from GET http://localhost:3000/auth/session/status but I need to do it without session...
  // Or I can read the memory of server.js? No, I can't read the memory of server.js.
  // Wait! The user ALREADY HAS the actual token in their .env because my script `verify_token.js` 
  // previously failed, but then they authenticated using the browser.
  // Wait, clicking "Conectar con Mercado Libre" redirects to `/auth/mercadolibre/callback`
  // And `saveTokens` DOES NOT update .env file.
  // So `test_ads_endpoints.js` will STILL FAIL with "No hay access token", because the token is in memory of the `server.js` process.
}).catch(console.error);
