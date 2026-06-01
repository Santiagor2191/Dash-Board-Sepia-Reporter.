import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const EXTRACTOR_PATH = fileURLToPath(
  new URL("../../../scripts/extract_clientes_contabilidad.py", import.meta.url),
);

const runProcess = ({ pythonBin, excelPath }) =>
  new Promise((resolve, reject) => {
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
        reject(new Error(`Falló el extractor del Excel: ${detail}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`No se pudo parsear la salida del extractor: ${error.message}`));
      }
    });
  });

const SNAPSHOT_TABLE = "dashboard_snapshots";
const SNAPSHOT_KEY = "clientes_contabilidad";

const ensureSnapshotTable = async (dbPool) => {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (
      clave TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
};

export const createClientesContabilidadService = ({
  dbPool,
  excelPath,
  pythonBin,
}) => {
  let cache = null;

  // En la nube (Render) no hay Excel ni Python: leemos el "snapshot" que un
  // proceso local (tarea programada en el PC) deja precalculado en Neon.
  const getFromSnapshot = async () => {
    if (!dbPool) return null;
    await ensureSnapshotTable(dbPool);
    const [rows] = await dbPool.query(
      `SELECT payload FROM ${SNAPSHOT_TABLE} WHERE clave = $1`,
      [SNAPSHOT_KEY],
    );
    if (!rows.length || !rows[0].payload) return null;
    const payload = rows[0].payload;
    return typeof payload === "string" ? JSON.parse(payload) : payload;
  };

  const getDashboard = async () => {
    // 1. Fuente en la nube: snapshot precalculado en Neon.
    try {
      const snapshot = await getFromSnapshot();
      if (snapshot) return snapshot;
    } catch (snapshotError) {
      console.warn(
        `clientesContabilidad: no se pudo leer el snapshot de la BD (${snapshotError?.message || snapshotError}); ` +
          "se intenta el Excel local.",
      );
    }

    // 2. Respaldo (desarrollo local): leer el Excel directamente con Python.
    let mtimeMs = null;
    try {
      const fileStat = await stat(excelPath);
      mtimeMs = fileStat.mtimeMs;
    } catch (statError) {
      if (cache?.payload) {
        console.warn(
          `clientesContabilidad: no se pudo hacer stat del Excel (${statError?.code || statError?.message}); usando cache.`,
        );
        return cache.payload;
      }
      throw statError;
    }

    if (cache?.mtimeMs === mtimeMs && cache?.payload) {
      return cache.payload;
    }

    try {
      const payload = await runProcess({ pythonBin, excelPath });
      cache = { mtimeMs, payload };
      return payload;
    } catch (runError) {
      if (cache?.payload) {
        console.warn(
          `clientesContabilidad: extractor falló (${runError?.message || runError}); ` +
            "usando última cache válida.",
        );
        return cache.payload;
      }
      throw runError;
    }
  };

  return {
    getDashboard,
  };
};
