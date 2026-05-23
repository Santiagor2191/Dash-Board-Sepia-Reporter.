import("./src/config/env.js").then((env) => {
  import("./src/services/meliClient.js").then(({ createMeliClient }) => {
    const ml = createMeliClient({
      apiBase: env.MELI_API_BASE || "https://api.mercadolibre.com",
      clientId: env.MELI_CLIENT_ID,
      clientSecret: env.MELI_CLIENT_SECRET,
      redirectUri: env.MELI_REDIRECT_URI,
      initialTokens: env.MELI_INITIAL_TOKENS,
    });
    
    ml.loadTokens();
    
    ml.mlGet("/users/me").then(async (user) => {
      console.log("USER:", user.id);
      try {
        const campaigns = await ml.mlGet(`/advertising/product_ads/campaigns?user_id=${user.id}`);
        console.log("CAMPAIGNS LENGTH:", campaigns.length || (campaigns.results ? campaigns.results.length : 0));
        console.log("CAMPAIGNS DATA:", JSON.stringify(campaigns).substring(0, 300));
        if (campaigns && campaigns.results && campaigns.results.length > 0) {
            const camp1 = campaigns.results[0].id;
            console.log("\nTESTING ITEMS FOR CAMPAIGN:", camp1);
            try {
                // Testing specific campaign endpoint
                const ads = await ml.mlGet(`/advertising/product_ads/ads?campaign_id=${camp1}`);
                console.log("ADS RES:", JSON.stringify(ads).substring(0, 300));
            } catch (ea) {
                console.error("ADS ERROR", ea.response?.data || ea.message);
            }
        }
      } catch(e) {
        console.error("CAMPAIGNS ERROR", e.response?.data || e.message);
      }
    }).catch(e => console.error("USER ERR", e));
  });
});
