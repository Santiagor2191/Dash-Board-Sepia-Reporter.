import("./src/config/env.js").then(async (env) => {
  const { createMeliClient } = await import("./src/services/meliClient.js");
  const { createProductAdsService } = await import("./src/services/productAdsService.js");

  const ml = createMeliClient({
    apiBase: env.MELI_API_BASE,
    clientId: env.MELI_CLIENT_ID,
    clientSecret: env.MELI_CLIENT_SECRET,
    redirectUri: env.MELI_REDIRECT_URI,
    initialTokens: env.MELI_INITIAL_TOKENS,
  });
  
  await ml.loadTokens();
  
  const adsService = createProductAdsService({ meliClient: ml });
  
  try {
    const data = await adsService.getAdsData();
    console.log("SUCCESS", data);
  } catch(e) {
    console.error("DEBUG ERROR TRACE:");
    console.error(e.stack);
  }
}).catch(e => console.error("INIT ERR:", e));
