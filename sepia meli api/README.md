# Sepia MeLi API

Backend Express para el dashboard de Sepia. Expone autenticación local, conexión OAuth con Mercado Libre, acceso a histórico en MySQL y endpoints analíticos para órdenes e inventario.

## Arquitectura actual

El backend quedó organizado por responsabilidad:

- `server.js`
  Punto de ensamblaje. Carga configuración, crea servicios, monta routers y arranca el servidor.
- `src/config/env.js`
  Lee `.env`, define defaults y exporta configuración tipada.
- `src/db/pool.js`
  Crea el pool MySQL reutilizable.
- `src/security/dashboardAuth.js`
  Maneja login local, sesiones en memoria y rate limiting.
- `src/security/oauthState.js`
  Maneja el `state` temporal del flujo OAuth.
- `src/services/meliClient.js`
  Encapsula tokens, refresh y llamadas autenticadas a Mercado Libre.
- `src/services/meliOrdersService.js`
  Cachea historial de órdenes y nombres de categoría.
- `src/services/historicalSalesService.js`
  Encapsula ventas históricas, resumen e inteligencia desde MySQL.
- `src/routes/authRoutes.js`
  Rutas de sesión local y OAuth.
- `src/routes/dbRoutes.js`
  Rutas históricas basadas en MySQL.
- `src/routes/meliRoutes.js`
  Rutas principales de usuario, órdenes e inventario.

## Mapa de rutas

- `GET /`
  Health simple del backend.
- `POST /notifications`
  Endpoint de respuesta simple usado por Mercado Libre/webhooks.
- `GET /auth/session/status`
- `POST /auth/session/login`
- `POST /auth/session/logout`
- `GET /auth/mercadolibre`
- `GET /auth/mercadolibre/callback`
- `GET /auth/mercadolibre/status`
- `POST /auth/mercadolibre/refresh`
- `GET /db/ventas`
- `GET /db/resumen`
- `GET /db/inteligencia`
- `GET /meli/me`
- `GET /meli/orders/recent`
- `GET /meli/orders/history`
- `GET /meli/inventory`

## Seguridad

### Protección local

Si `DASHBOARD_ADMIN_PASSWORD` está configurada:

- el backend exige sesión local para `/db/*`
- el backend exige sesión local para `/meli/*`
- el backend exige sesión local para `/auth/mercadolibre`, `/auth/mercadolibre/status` y `/auth/mercadolibre/refresh`

La sesión:

- usa bearer token firmado en memoria
- tiene TTL configurable
- aplica rate limiting al login por IP
- usa `req.ip`, respetando `TRUST_PROXY` de Express cuando el backend corre detrás de un proxy confiable

### OAuth Mercado Libre

- el flujo valida `state`
- los tokens activos viven solo en memoria del proceso
- opcionalmente se puede bootstrapear el estado inicial desde `.env`
- al refrescar tokens se limpian caches relacionadas con órdenes

## Variables de entorno

Base:

- `HOST`
- `PORT`
- `FRONTEND_ORIGINS`
- `TRUST_PROXY`
- `JSON_BODY_LIMIT`

Sesión local:

- `SESSION_TTL_MS`
- `SESSION_SECRET`
- `LOGIN_RATE_LIMIT_WINDOW_MS`
- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`
- `DASHBOARD_ADMIN_PASSWORD`

Mercado Libre:

- `MELI_CLIENT_ID`
- `MELI_CLIENT_SECRET`
- `MELI_REDIRECT_URI`
- `MELI_ACCESS_TOKEN`
- `MELI_REFRESH_TOKEN`
- `MELI_TOKEN_EXPIRES_AT`
- `MELI_TOKEN_UPDATED_AT`

MySQL:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_CONNECTION_LIMIT`

Usa `./.env.example` como base.

## Scripts

- `npm run dev`
  Arranca el backend con `nodemon`.
- `npm test`
  Corre pruebas de humo con `node:test`.

## Pruebas

Las pruebas actuales cubren:

- auth local y callback OAuth inválido
- endurecimiento del rate limit frente a `X-Forwarded-For` spoofeado
- rutas `db`
- rutas `meli`
- cache de inventario
- bootstrap y refresh en memoria del cliente MeLi

Ubicación:

- `test/routes/authRoutes.test.js`
- `test/routes/dbRoutes.test.js`
- `test/routes/meliRoutes.test.js`
- `test/services/meliClient.test.js`

Nota:

- `npm test` usa `--test-isolation=none` para evitar problemas de spawn en algunos entornos Windows.
- Durante la suite aparece una línea `Error consultando MySQL: DB offline`; es esperada porque una prueba valida el camino de error de `dbRoutes`.

## Flujo de datos

1. El frontend inicia sesión local.
2. El frontend consulta estado de sesión y luego consume `/db/*` y `/meli/*`.
3. El backend consulta MySQL histórico o API de Mercado Libre según la ruta.
4. Los servicios encapsulan caches y transformaciones.
5. Los routers solo validan entrada y serializan respuesta.

## Notas para seguir refactorando

- `server.js` ya está reducido al ensamblaje del backend.
- Si sigues iterando, el siguiente paso lógico es introducir pruebas de integración del servidor completo o middlewares reutilizables de errores/logging.
