import express from "express";
import { sendInternalError } from "../security/httpErrors.js";

const PLATAFORMAS_VALIDAS = new Set(["instagram", "facebook"]);

// Handles se normalizan en el backend (minusculas, sin @, sin espacios) — no
// se confia en como venga tipeado desde el frontend.
const normalizarHandle = (raw) => String(raw || "").trim().toLowerCase().replace(/^@/, "");

export const createDbRouter = ({
  historicalSalesService,
  clientesContabilidadService,
  metaAdsSalesService,
  metaAdsLiveService,
  metaSocialService,
  dbPool,
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

  router.get("/meta-ads-live", async (req, res) => {
    try {
      const live = await metaAdsLiveService.getLive({
        since: String(req.query.since || ""),
        until: String(req.query.until || ""),
      });
      return res.json({ ok: true, ...live });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando Meta Ads en vivo",
        "No se pudo consultar la API de Meta",
        error,
      );
    }
  });

  router.get("/meta-redes", async (req, res) => {
    try {
      const social = await metaSocialService.getSocial({
        since: String(req.query.since || ""),
        until: String(req.query.until || ""),
      });
      return res.json({ ok: true, ...social });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando redes de Meta",
        "No se pudo consultar la API de Meta",
        error,
      );
    }
  });

  // ---------------------------------------------------------------------
  // Social Media: tabla de posts + benchmark de competidores. Estas rutas
  // solo LEEN de Neon (decisión 2B) — los datos los escribe socialSyncService
  // vía el job de /cron/social-sync, no una llamada en vivo a Meta.
  // ---------------------------------------------------------------------

  router.get("/social-posts", async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const [rows] = await dbPool.query(
        `SELECT plataforma, account_id, post_id, fecha_publicacion, permalink,
                miniatura_url, media_type, media_product_type, caption,
                likes, comentarios, reach, saves, shares, synced_at
         FROM social_posts
         ORDER BY fecha_publicacion DESC NULLS LAST
         LIMIT $1`,
        [limit],
      );
      return res.json({ ok: true, posts: rows });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando social_posts",
        "No se pudieron traer los posts sincronizados",
        error,
      );
    }
  });

  router.get("/social-benchmark", async (req, res) => {
    try {
      // Último snapshot por competidor (no todo el histórico).
      const [rows] = await dbPool.query(
        `SELECT DISTINCT ON (c.id)
                c.id AS competidor_id, c.plataforma, c.handle, c.nombre_visible, c.foto_url,
                c.last_error, c.last_synced_at,
                b.seguidores, b.posts_count, b.engagement_aprox, b.cadencia_semanal, b.fecha_snapshot
         FROM competidores_social c
         LEFT JOIN social_benchmark b ON b.competidor_id = c.id
         WHERE c.activo = true
         ORDER BY c.id, b.fecha_snapshot DESC NULLS LAST`,
      );
      return res.json({ ok: true, competidores: rows });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando social_benchmark",
        "No se pudo traer el benchmark de competidores",
        error,
      );
    }
  });

  // Historial de seguidores de un competidor — social_benchmark guarda una
  // fila nueva por cada corrida de sync (no pisa la anterior), así que esto
  // ya viene acumulando datos desde el primer /cron/social-sync.
  router.get("/social-benchmark-historial/:competidorId", async (req, res) => {
    try {
      const competidorId = Number(req.params.competidorId);
      if (!Number.isInteger(competidorId) || competidorId <= 0) {
        return res.status(400).json({ ok: false, mensaje: "competidorId inválido" });
      }
      const [rows] = await dbPool.query(
        `SELECT seguidores, fecha_snapshot FROM social_benchmark
         WHERE competidor_id = $1 AND seguidores IS NOT NULL
         ORDER BY fecha_snapshot ASC
         LIMIT 180`,
        [competidorId],
      );
      return res.json({ ok: true, historial: rows });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando historial de seguidores",
        "No se pudo traer el historial de seguidores",
        error,
      );
    }
  });

  router.get("/competidores-social", async (req, res) => {
    try {
      const [rows] = await dbPool.query(
        `SELECT id, plataforma, handle, nombre_visible, activo, last_error, last_synced_at
         FROM competidores_social ORDER BY plataforma, handle`,
      );
      return res.json({ ok: true, competidores: rows });
    } catch (error) {
      return sendInternalError(
        res,
        "Error consultando competidores_social",
        "No se pudo traer la lista de competidores",
        error,
      );
    }
  });

  router.post("/competidores-social", async (req, res) => {
    try {
      const plataforma = String(req.body?.plataforma || "");
      const handle = normalizarHandle(req.body?.handle);
      const nombreVisible = String(req.body?.nombre_visible || "").trim() || null;

      if (!PLATAFORMAS_VALIDAS.has(plataforma)) {
        return res.status(400).json({ ok: false, mensaje: "plataforma debe ser 'instagram' o 'facebook'" });
      }
      if (!handle) {
        return res.status(400).json({ ok: false, mensaje: "handle es requerido" });
      }

      const [rows] = await dbPool.query(
        `INSERT INTO competidores_social (plataforma, handle, nombre_visible)
         VALUES ($1,$2,$3)
         ON CONFLICT (plataforma, handle) DO UPDATE SET activo = true, nombre_visible = EXCLUDED.nombre_visible
         RETURNING id, plataforma, handle, nombre_visible, activo`,
        [plataforma, handle, nombreVisible],
      );
      return res.status(201).json({ ok: true, competidor: rows[0] });
    } catch (error) {
      return sendInternalError(
        res,
        "Error creando competidor",
        "No se pudo agregar el competidor",
        error,
      );
    }
  });

  router.put("/competidores-social/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ ok: false, mensaje: "id inválido" });
      }

      const campos = [];
      const valores = [];
      if (req.body?.nombre_visible !== undefined) {
        campos.push(`nombre_visible = $${campos.length + 1}`);
        valores.push(String(req.body.nombre_visible || "").trim() || null);
      }
      if (req.body?.activo !== undefined) {
        campos.push(`activo = $${campos.length + 1}`);
        valores.push(Boolean(req.body.activo));
      }
      if (!campos.length) {
        return res.status(400).json({ ok: false, mensaje: "Nada para actualizar" });
      }

      valores.push(id);
      const [rows] = await dbPool.query(
        `UPDATE competidores_social SET ${campos.join(", ")} WHERE id = $${valores.length}
         RETURNING id, plataforma, handle, nombre_visible, activo`,
        valores,
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, mensaje: "Competidor no encontrado" });
      }
      return res.json({ ok: true, competidor: rows[0] });
    } catch (error) {
      return sendInternalError(
        res,
        "Error editando competidor",
        "No se pudo actualizar el competidor",
        error,
      );
    }
  });

  return router;
};
