import express from "express";
import { sendInternalError } from "../security/httpErrors.js";

export const createSyncRouter = ({ syncMeliToDbService, ejecutarSyncConLock }) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // POST /admin/sync-ahora
  // Dispara una sincronizacion manual. Usa el lock compartido con el cron
  // para evitar dos syncs simultaneos.
  // Query opcional: ?days_back=14 & ?max_orders=1000
  // ---------------------------------------------------------------------------
  router.post("/sync-ahora", async (req, res) => {
    try {
      const daysBack = Math.min(
        Math.max(Number(req.query.days_back) || 14, 1),
        90
      );
      const maxOrders = Math.min(
        Math.max(Number(req.query.max_orders) || 1000, 1),
        5000
      );

      const resultado = await ejecutarSyncConLock({ daysBack, maxOrders });
      return res.json({ ok: true, ...resultado });
    } catch (error) {
      if (error?.statusCode === 409) {
        return res.status(409).json({ ok: false, mensaje: error.message });
      }
      return sendInternalError(
        res,
        "Error ejecutando sync manual",
        "No se pudo ejecutar la sincronizacion",
        error,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // GET /admin/reconciliacion?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Compara API MeLi vs Excel oficial en un rango. NO modifica nada.
  // ---------------------------------------------------------------------------
  router.get("/reconciliacion", async (req, res) => {
    try {
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const maxOrders = Math.min(
        Math.max(Number(req.query.max_orders) || 5000, 100),
        10000
      );

      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({
          ok: false,
          mensaje: "from y to son requeridos (formato YYYY-MM-DD)",
        });
      }

      const reporte = await syncMeliToDbService.reconcileWithExcel({ from, to, maxOrders });
      return res.json({ ok: true, ...reporte });
    } catch (error) {
      return sendInternalError(
        res,
        "Error en reconciliacion API vs Excel",
        "No se pudo ejecutar la reconciliacion",
        error,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // GET /admin/sync-log
  // Devuelve las ultimas N corridas (default 10, max 100).
  // ---------------------------------------------------------------------------
  router.get("/sync-log", async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
      const corridas = await syncMeliToDbService.getLastSyncs(limit);
      return res.json({ ok: true, total: corridas.length, corridas });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando sync_log",
        "No se pudo consultar el log de sincronizaciones",
        error,
      );
    }
  });

  return router;
};
