import express from "express";

/**
 * Ruta puente para la autorizacion OAuth del MCP Sepia (Sepia-meli-mcp/).
 *
 * MeLi rechaza redirect URIs sin HTTPS. El MCP corre localmente (HTTP),
 * asi que registramos una URI publica HTTPS aqui en el backend (a traves de ngrok)
 * y reenviamos por HTTP redirect al MCP en localhost.
 *
 * Esta ruta NO tiene auth (igual que /auth/mercadolibre/callback). Solo es relevante
 * mientras el MCP esta autorizandose. Si nadie escucha en localhost:MCP puerto,
 * el redirect falla en el navegador del usuario (no afecta al backend).
 */
export const createMcpBridgeRouter = ({
  mcpHost = "127.0.0.1",
  mcpPort = 8765,
  mcpCallbackPath = "/internal-callback",
} = {}) => {
  const router = express.Router();

  router.get("/mcp-callback", (req, res) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }

    const target = `http://${mcpHost}:${mcpPort}${mcpCallbackPath}?${params.toString()}`;
    return res.redirect(302, target);
  });

  return router;
};
