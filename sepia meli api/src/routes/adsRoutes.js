import { Router } from "express";

export const createAdsRoutes = ({ productAdsService }) => {
  const router = Router();

  // Endpoint: /ads/metrics — datos completos de publicidad
  router.get("/metrics", async (req, res) => {
    try {
      const payload = await productAdsService.getAdsData();
      res.json(payload);
    } catch (error) {
      console.error("[Ads Route] Error:", error.message);
      const status = error.response?.status;
      const isAuth = status === 401 || status === 403 || error.message.includes("sesión") || error.message.includes("access token") || error.message.includes("permisos");
      const statusCode = isAuth ? 401 : (status || 500);
      const errorMsg = isAuth
        ? "Tu sesión de Mercado Libre caducó o no tiene permisos para publicidad. Re-conecta tu cuenta."
        : (error.message || "Error obteniendo datos publicitarios.");
      res.status(statusCode).json({ ok: false, error: errorMsg });
    }
  });

  // Endpoint: /ads/diagnose — prueba cada endpoint de MeLi por separado
  router.get("/diagnose", async (req, res) => {
    try {
      const results = await productAdsService.diagnose();
      res.json({ ok: true, diagnostico: results });
    } catch (error) {
      console.error("[Ads Route] Diagnose error:", error.message);
      res.status(500).json({
        ok: false,
        error: "No se pudo ejecutar el diagnostico de publicidad.",
      });
    }
  });

  return router;
};
