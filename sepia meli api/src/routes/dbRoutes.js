import express from "express";
import { sendInternalError } from "../security/httpErrors.js";

export const createDbRouter = ({
  historicalSalesService,
  clientesContabilidadService,
  metaAdsSalesService,
}) => {
  const router = express.Router();

  router.get("/ventas", async (req, res) => {
    try {
      const ventas = await historicalSalesService.getVentas();
      return res.json({ ok: true, ...ventas });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando MySQL",
        "No se pudo consultar la base de datos",
        error,
      );
    }
  });

  router.get("/resumen", async (req, res) => {
    try {
      const resumen = await historicalSalesService.getResumen();
      return res.json({ ok: true, ...resumen });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando resumen historico",
        "No se pudo consultar el resumen historico",
        error,
      );
    }
  });

  router.get("/inteligencia", async (req, res) => {
    try {
      const inteligencia = await historicalSalesService.getInteligencia();
      return res.json({ ok: true, ...inteligencia });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando inteligencia historica",
        "No se pudo consultar inteligencia historica",
        error,
      );
    }
  });

  router.get("/clientes-contabilidad", async (req, res) => {
    try {
      const dashboard = await clientesContabilidadService.getDashboard();
      return res.json({ ok: true, ...dashboard });
    } catch (error) {
      return sendInternalError(
        res,
        "Error leyendo Excel de clientes y contabilidad",
        "No se pudo procesar el archivo de clientes y contabilidad",
        error,
      );
    }
  });

  router.get("/ventas-meta-ads", async (req, res) => {
    try {
      const dashboard = await metaAdsSalesService.getDashboard();
      return res.json({ ok: true, ...dashboard });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando ventas Meta Ads",
        "No se pudo consultar la tabla mensual de Meta Ads",
        error,
      );
    }
  });

  return router;
};
