# Migración del backend: Render → Netlify Functions

**Estado: EN PAUSA (decisión de Santiago, 2026-07-17).**
El cambio se hará cuando todos los módulos nuevos (paid media, social media,
CRM, email marketing) estén corriendo. Por ahora todo sigue en Render.

## Por qué migrar

- Quedar con solo dos servicios: Netlify ($9/mes, ya pagado) + Neon. Se
  eliminan Render Free y UptimeRobot.
- Render Free es el cuello de botella de velocidad del dashboard.

## Lo que YA está hecho y probado (2026-07-17)

La base técnica quedó lista y verificada en local con datos reales de Neon
(login + `/db/resumen` a través de `npx netlify dev`). Nada de esto afecta a
Render: el comportamiento en producción es idéntico.

| Pieza | Qué es |
|---|---|
| `sepia meli api/src/app.js` | El "motor": arma toda la app Express (rutas, seguridad, servicios) sin arrancar servidor. **Los módulos nuevos se agregan aquí** y funcionan automáticamente en Render Y en Netlify. |
| `sepia meli api/server.js` | Arranque para Render/local: usa el motor + `listen()` + cron horario. |
| `sepia meli api/src/netlifyHandler.js` | Arranque para Netlify: envuelve el motor con `serverless-http`. |
| `sepia-dashboard-Fronted/netlify/functions/api.mjs` | Punto de entrada de la función; solo re-exporta el handler. |
| `sepia-dashboard-Fronted/netlify.toml` | Config de funciones + redirects de `/db`, `/meli`, `/auth`, `/ads`, `/api`, `/admin`, `/cron`, etc. hacia la función. |

⚠️ `public/_redirects` fue **eliminado a propósito**: ese archivo tiene
prioridad sobre `netlify.toml` y su regla `/*` se tragaría las rutas del
backend. No recrearlo; el fallback del SPA ya está en `netlify.toml`.

## Checklist para el día del cambio

1. **Sesiones sin estado** (el pendiente más importante): `dashboardAuth`
   guarda sesiones en memoria; en serverless se pierden entre instancias y el
   dashboard pediría la clave a cada rato. Cambiar a cookie firmada (HMAC con
   `SESSION_SECRET`) o tabla de sesiones en Neon.
2. **Cron horario de MeLi**: `node-cron` no corre en funciones. Mover a
   GitHub Actions (ya existe el workflow nocturno `sync-nocturno.yml`).
   Ojo: `/cron/sync` como función puede exceder el límite de ~10-26 s; si
   pasa, correr el sync directamente en el runner de GitHub Actions.
3. **Variables de entorno**: copiar todas las del `.env` del backend a la
   configuración del sitio en Netlify. Aprovechar para **rotar la password de
   Neon** (pendiente de seguridad).
4. **Frontend**: en `.env.production` dejar `VITE_API_URL` vacío (mismo
   dominio). En desarrollo local nada cambia.
5. **Deploy**: pasa a ser `npx netlify deploy --prod` desde
   `sepia-dashboard-Fronted/` (empaqueta las funciones). Revisar el "base
   directory" del sitio en Netlify (hoy avisa un path duplicado).
6. **Transición segura**: desplegar con Render aún vivo, usar el dashboard
   unos días contra Netlify, y solo entonces apagar Render y UptimeRobot.

## Prueba rápida en local (cuando se retome)

```
cd sepia-dashboard-Fronted
npx netlify dev --offline
# En otra terminal:
curl http://localhost:8888/.netlify/functions/api/   → {"ok":true}
curl http://localhost:8888/db/resumen                → 401 sin sesión (correcto)
```
