import("./src/config/env.js").then(async (env) => {
  const { createMeliClient } = await import("./src/services/meliClient.js");
  const ml = createMeliClient({
    apiBase: env.MELI_API_BASE,
    clientId: env.MELI_CLIENT_ID,
    clientSecret: env.MELI_CLIENT_SECRET,
    redirectUri: env.MELI_REDIRECT_URI,
    initialTokens: env.MELI_INITIAL_TOKENS,
  });
  await ml.loadTokens();
  
  try {
    const user = await ml.mlGet("/users/me");
    console.log("USER OK:", user.id);
    const campaigns = await ml.mlGet(`/advertising/product_ads/campaigns?user_id=${user.id}`);
    console.log("CAMPAIGNS OK:", campaigns.length || (campaigns.results ? campaigns.results.length : 0));
  } catch(e) {
    if (e.response) {
      console.error("HTTP ERROR:", e.response.status, JSON.stringify(e.response.data));
    } else {
      console.error("UNKNOWN ERROR:", e.message);
    }
  }
}).catch(console.error);
