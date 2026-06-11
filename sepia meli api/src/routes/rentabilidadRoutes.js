import express from "express";
import { sendInternalError } from "../security/httpErrors.js";

export const createRentabilidadRouter = ({ rentabilidadService }) => {
  const router = express.Router();

  router.get("/resumen", async (req, res) => {
    try {
      const data = await rentabilidadService.getResumen();
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendInternalError(res, "Error consultando resumen rentabilidad", "No se pudo consultar el resumen de rentabilidad", error);
    }
  });

  router.get("/estructura-costos", async (req, res) => {
    try {
      const data = await rentabilidadService.getEstructuraCostos();
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendInternalError(res, "Error consultando estructura de costos", "No se pudo consultar la estructura de costos", error);
    }
  });

  router.get("/top-rentables", async (req, res) => {
    try {
      const data = await rentabilidadService.getTopRentables();
      return res.json({ ok: true, items: data });
    } catch (error) {
      return sendInternalError(res, "Error consultando top rentables", "No se pudo consultar los productos mas rentables", error);
    }
  });

  router.get("/con-perdida", async (req, res) => {
    try {
      const data = await rentabilidadService.getConPerdida();
      return res.json({ ok: true, items: data });
    } catch (error) {
      return sendInternalError(res, "Error consultando productos con perdida", "No se pudo consultar los productos con perdida", error);
    }
  });

  router.get("/premium-vs-clasica", async (req, res) => {
    try {
      const data = await rentabilidadService.getPremiumVsClasica();
      return res.json({ ok: true, items: data });
    } catch (error) {
      return sendInternalError(res, "Error consultando premium vs clasica", "No se pudo consultar la comparacion por tipo", error);
    }
  });

  router.get("/costo-por-ventas", async (req, res) => {
    try {
      const data = await rentabilidadService.getCostoPorVentas();
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendInternalError(res, "Error consultando costo por ventas", "No se pudo consultar el costo de productos vendidos", error);
    }
  });

  router.get("/costos-map", async (req, res) => {
    try {
      const { costos, costosPorTitulo } = await rentabilidadService.getCostosMap();
      return res.json({ ok: true, costos, costosPorTitulo });
    } catch (error) {
      return sendInternalError(res, "Error consultando mapa de costos", "No se pudo consultar los costos por publicacion", error);
    }
  });

  return router;
};
