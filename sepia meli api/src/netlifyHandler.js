// Adaptador serverless: envuelve la app de Express para que corra como
// Netlify Function. serverless-http traduce el formato de evento de Netlify
// al request/response que Express entiende.
//
// ponytail: la app se arma una vez por cold start; sesiones y caches en
// memoria no sobreviven entre instancias (pendiente: sesiones sin estado).
import serverless from "serverless-http";
import { buildApp } from "./app.js";

const { app, initTokens } = buildApp();

// Los tokens de MeLi se cargan una vez por cold start, desde Neon.
const tokensListos = initTokens().catch((error) => {
  console.error("[netlify] No se pudieron cargar tokens MeLi:", error.message);
});

const baseHandler = serverless(app);

// La funcion vive en /.netlify/functions/api/*; Express espera rutas sin ese
// prefijo (/db, /meli, /auth, ...), asi que lo recortamos antes de entregar.
const FUNCTION_PREFIX = "/.netlify/functions/api";

export const handler = async (event, context) => {
  await tokensListos;
  const path = event.path || "/";
  const normalizado = path.startsWith(FUNCTION_PREFIX)
    ? path.slice(FUNCTION_PREFIX.length) || "/"
    : path;
  return baseHandler({ ...event, path: normalizado }, context);
};
