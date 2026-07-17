import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TABLE_NAME = "ventas_meta_ads_mensual";
// Igual que en clientesContabilidadService: el script de Python solo existe
// en la maquina local; en el bundle serverless este path queda null.
const EXTRACTOR_PATH = (() => {
  try {
    return fileURLToPath(
      new URL("../../../scripts/carga_ventas_meta_ads.py", import.meta.url),
    );
  } catch {
    return null;
  }
})();

const runExtractor = ({ pythonBin, excelPath }) =>
  new Promise((resolve, reject) => {
    if (!EXTRACTOR_PATH) {
      return reject(new Error("Extractor de Python no disponible en este entorno"));
    }
    const child = spawn(pythonBin, [EXTRACTOR_PATH, "--path", excelPath], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `Código ${code}`;
        reject(new Error(`Falló el extractor de Meta Ads: ${detail}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`No se pudo parsear la salida del extractor Meta Ads: ${error.message}`));
      }
    });
  });

const createTable = async (dbPool) => {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id SERIAL PRIMARY KEY,
      periodo DATE UNIQUE NOT NULL,
      anio INTEGER NOT NULL,
      num_mes INTEGER NOT NULL,
      mes TEXT,
      ventas_brutas NUMERIC,
      devoluciones NUMERIC,
      ventas_netas NUMERIC,
      gasto_publicidad NUMERIC,
      costo_producto NUMERIC,
      utilidad_neta NUMERIC,
      roas NUMERIC,
      roi_pct NUMERIC,
      margen_neto_pct NUMERIC,
      fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const truncateAndInsert = async (dbPool, rows) => {
  await createTable(dbPool);
  await dbPool.query(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY`);

  if (!rows.length) return;

  const values = [];
  const placeholders = rows.map((row, index) => {
    const base = index * 13;
    values.push(
      row.periodo,
      row.anio,
      row.num_mes,
      row.mes,
      row.ventas_brutas,
      row.devoluciones,
      row.ventas_netas,
      row.gasto_publicidad,
      row.costo_producto,
      row.utilidad_neta,
      row.roas,
      row.roi_pct,
      row.margen_neto_pct,
    );

    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13})`;
  });

  await dbPool.query(
    `
      INSERT INTO ${TABLE_NAME} (
        periodo,
        anio,
        num_mes,
        mes,
        ventas_brutas,
        devoluciones,
        ventas_netas,
        gasto_publicidad,
        costo_producto,
        utilidad_neta,
        roas,
        roi_pct,
        margen_neto_pct
      )
      VALUES ${placeholders.join(", ")}
    `,
    values,
  );
};

export const createMetaAdsSalesService = ({ dbPool, excelPath, pythonBin }) => {
  let lastSyncedMtimeMs = null;
  let syncInFlight = null;

  const syncFromExcel = async () => {
    let mtimeMs;
    try {
      const fileStat = await stat(excelPath);
      mtimeMs = fileStat.mtimeMs;
    } catch (statError) {
      // En la nube (Render) el Excel local no existe. En vez de fallar,
      // servimos los datos que ya estan cargados en la base (Neon).
      console.warn(
        `metaAds: no se pudo acceder al Excel (${statError?.code || statError?.message}); ` +
          "se usan los datos ya cargados en la base.",
      );
      return;
    }

    if (lastSyncedMtimeMs === mtimeMs) return;

    try {
      const payload = await runExtractor({ pythonBin, excelPath });
      await truncateAndInsert(dbPool, payload.rows || []);
      lastSyncedMtimeMs = mtimeMs;
    } catch (extractorError) {
      // Si el extractor falla (p.ej. Python no disponible en la nube),
      // conservamos los datos ya cargados en la base.
      console.warn(
        `metaAds: fallo el extractor (${extractorError?.message || extractorError}); ` +
          "se usan los datos ya cargados en la base.",
      );
    }
  };

  const ensureSynchronized = async () => {
    if (!syncInFlight) {
      syncInFlight = syncFromExcel().finally(() => {
        syncInFlight = null;
      });
    }
    return syncInFlight;
  };

  const getDashboard = async () => {
    await createTable(dbPool);
    await ensureSynchronized();

    const [rows] = await dbPool.query(`
      SELECT
        periodo,
        anio,
        num_mes,
        mes,
        ventas_brutas,
        devoluciones,
        ventas_netas,
        gasto_publicidad,
        costo_producto,
        utilidad_neta,
        roas,
        roi_pct,
        margen_neto_pct
      FROM ${TABLE_NAME}
      ORDER BY periodo ASC
    `);

    const finanzasPorPeriodo = rows.map((row) => ({
      fecha: row.periodo ? new Date(row.periodo).toISOString() : null,
      anio: Number(row.anio),
      num_mes: Number(row.num_mes),
      mes: row.mes,
      ventas_brutas: Number(row.ventas_brutas) || 0,
      devoluciones: Number(row.devoluciones) || 0,
      total_ingresado: Number(row.ventas_netas) || 0,
      costo_producto: Number(row.costo_producto) || 0,
      gasto_publicidad: Number(row.gasto_publicidad) || 0,
      utilidad_neta: Number(row.utilidad_neta) || 0,
      roas: Number(row.roas) || 0,
      roi: Number(row.roi_pct) || 0,
      margen_neto_pct: Number(row.margen_neto_pct) || 0,
    }));

    return {
      total: finanzasPorPeriodo.length,
      finanzasPorPeriodo,
    };
  };

  return {
    ensureSynchronized,
    getDashboard,
  };
};
