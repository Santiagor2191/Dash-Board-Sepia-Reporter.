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

export const createClientesContabilidadService = ({
  excelPath,
  pythonBin,
}) => {
  let cache = null;

  const getDashboard = async () => {
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
