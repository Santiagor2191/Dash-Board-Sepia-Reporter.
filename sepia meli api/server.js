// Arranque para Render / local: toma la app armada en src/app.js y le agrega
// lo que solo aplica a un servidor siempre-prendido: listen() y el cron horario.
// La version serverless (Netlify) vive en src/netlifyHandler.js.
import cron from "node-cron";
import { HOST, PORT } from "./src/config/env.js";
import { buildApp } from "./src/app.js";

const {
  app,
  initTokens,
  ejecutarSyncConLock,
  clientesContabilidadService,
  metaAdsSalesService,
} = buildApp();

// Wrapper para correr el sync desde el cron/startup con logging y sin propagar errores
const correrSyncSeguro = async (contexto) => {
  const inicio = Date.now();
  try {
    const resultado = await ejecutarSyncConLock({ daysBack: 14, maxOrders: 1000 });
    const segs = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(
      `[sync ${contexto}] OK en ${segs}s — ${resultado.ordenes_procesadas} ordenes, ` +
      `${resultado.ordenes_nuevas} nuevas, ${resultado.ordenes_actualizadas} actualizadas, ` +
      `${resultado.errores} errores`,
    );
  } catch (error) {
    if (error?.statusCode === 409) {
      console.log(`[sync ${contexto}] omitido: ya hay otro sync corriendo`);
    } else {
      console.error(`[sync ${contexto}] FALLO:`, error.message);
    }
  }
};

const start = async () => {
  await initTokens();
  app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
    clientesContabilidadService.getDashboard().catch((error) => {
      console.warn("No se pudo precalentar el Excel de clientes y contabilidad:", error.message);
    });
    metaAdsSalesService.ensureSynchronized().catch((error) => {
      console.warn("No se pudo sincronizar Ventas Meta Ads a PostgreSQL:", error.message);
    });

    // Sync inicial al arrancar (no bloquea el servidor)
    correrSyncSeguro("startup");

    // Sync horario en el minuto 5 de cada hora (zona Colombia)
    cron.schedule("5 * * * *", () => correrSyncSeguro("cron"), {
      timezone: "America/Bogota",
    });
    console.log("Cron programado: sync MeLi -> PostgreSQL cada hora en el minuto 5 (America/Bogota)");
  });
};

start().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
