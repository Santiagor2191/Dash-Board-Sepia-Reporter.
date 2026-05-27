# Cambios en el backend Express

## Resumen

El backend `sepia meli api` recibio:
- **1 servicio nuevo:** `syncMeliToDbService` (orquesta la API → DB)
- **1 archivo de rutas nuevo:** `syncRoutes.js` (expone endpoints `/admin/*`)
- **Modificaciones en `server.js`:** wiring, cron y lock compartido
- **1 dependencia nueva:** `node-cron`

---

## Servicio `syncMeliToDbService`

**Ubicacion:** `sepia meli api/src/services/syncMeliToDbService.js`

Expone 3 funciones publicas:

### `syncRecentOrders({ daysBack = 14, maxOrders = 1000 })`
Es la funcion principal. La llama el cron, el sync de arranque y el endpoint
manual.

Pasos internos:
1. Calcula el rango a sincronizar (considera ultima fecha oficial)
2. Inserta fila en `sync_log` con `estado='en_curso'`
3. Llama `/users/me` a MeLi para obtener seller_id
4. Pagina `/orders/search` (50 ordenes por pagina)
5. Por cada orden, por cada item: arma fila y hace UPSERT en `ventas_ml`
6. Actualiza la fila de `sync_log` con conteos finales

Retorna `{ sync_id, rango_desde, rango_hasta, ordenes_procesadas, ordenes_nuevas, ordenes_actualizadas, errores, mensaje }`.

### `getLastSyncs(limit = 10)`
Devuelve las ultimas N corridas registradas en `sync_log`. Lo usa el endpoint
`GET /admin/sync-log`.

### `reconcileWithExcel({ from, to, maxOrders = 5000 })`
Compara las ordenes de la API contra las filas oficiales del Excel en un rango.
**NO modifica la base** — es solo lectura/calculo.

Retorna un reporte con:
- Conteos (api, excel, ambos, solo_api, solo_excel)
- Tasas de match (perfecto, cantidad)
- Totales (cantidad y revenue por lado, con diferencia)
- Top 10 ordenes con mayor discrepancia de monto
- Primeras 10 huerfanas de cada lado

---

## Mapeo orden MeLi → fila `ventas_ml`

| Columna ventas_ml | De donde sale |
|---|---|
| `id_unico` | `sha256("api|" + order.id + "|" + item.id + "|" + variation_id)` |
| `anio`, `num_mes`, `dia`, `fecha` | `order.date_closed || date_created` convertido a hora Colombia |
| `numero_venta` | `order.id` ⚠ (debería ser `pack_id` — ver [`05-reconciliacion-hallazgos.md`](05-reconciliacion-hallazgos.md)) |
| `estado` | Mapeo de `order.status`: `paid → Entregado`, `cancelled → Cancelada`, etc. |
| `producto` | `item.title` |
| `categoria` | `meliOrdersService.getCategoryName(item.category_id)` (cacheado) |
| `variante_talla` | Concatenacion de `variation_attributes`: `"Color : Lila"` o `"Color : Lila / Talla : M"` |
| `cantidad`, `monto_reportado_cop`, `precio_unitario_publicacion_cop` | De `lineItem.quantity * lineItem.unit_price` |
| `sku`, `publicacion_id` | `item.seller_sku`, `item.id` |
| `comprador` | `buyer.first_name + " " + buyer.last_name || buyer.nickname` |
| `ciudad`, `forma_entrega` | `null` en v1 (requeriria `/shipments`) |
| `origen_dato` | `'api_meli_preliminar'` |
| `calidad_dato` | `'preliminar'` |
| `periodo_incompleto` | `true` |
| `archivo_origen` | `'api_meli_sync'` |
| `order_item_id` | `${itemId}:${variationId || 'X'}` |
| `fecha_ultima_actualizacion` | `NOW()` |

---

## Rutas nuevas en `/admin`

**Ubicacion:** `sepia meli api/src/routes/syncRoutes.js`
**Monta:** `app.use("/admin", dashboardAuth.requireSession, dbRateLimit, createSyncRouter({...}))`

Todas requieren sesion del dashboard.

### `POST /admin/sync-ahora`
Dispara un sync manual. Acepta query opcional:
- `?days_back=14` (1-90, default 14)
- `?max_orders=1000` (1-5000, default 1000)

Usa el lock compartido con el cron — si ya hay sync corriendo, devuelve HTTP 409.

### `GET /admin/sync-log?limit=10`
Devuelve las ultimas N corridas (1-100, default 10). Util para el dashboard
o para diagnostico desde el MCP.

### `GET /admin/reconciliacion?from=YYYY-MM-DD&to=YYYY-MM-DD`
Compara API vs Excel en un rango. Acepta tambien `?max_orders=5000` (100-10000).

NO modifica la base. Puede tardar 30-90 segundos segun cantidad de ordenes.

---

## Cron horario

**Ubicacion:** `sepia meli api/server.js`

```js
cron.schedule("5 * * * *", () => correrSyncSeguro("cron"), {
  timezone: "America/Bogota",
});
```

- Corre **cada hora en el minuto 5** (12:05, 13:05, 14:05, ...)
- Zona horaria **America/Bogota**
- Si falla (sin token, MeLi caido, etc.) loguea el error pero NO rompe el servidor
- Si ya hay un sync corriendo (porque alguien hizo click en "sync ahora"), lo omite

Tambien hay un **sync de arranque** que se dispara una vez al iniciar el
backend, para no tener que esperar al siguiente minuto 5.

---

## Lock compartido

**Ubicacion:** `sepia meli api/server.js`

```js
let syncEnEjecucion = false;
const ejecutarSyncConLock = async ({ daysBack, maxOrders }) => {
  if (syncEnEjecucion) {
    const err = new Error("Ya hay una sincronizacion en curso");
    err.statusCode = 409;
    throw err;
  }
  syncEnEjecucion = true;
  try {
    return await syncMeliToDbService.syncRecentOrders({ daysBack, maxOrders });
  } finally {
    syncEnEjecucion = false;
  }
};
```

Tanto el cron como el endpoint `POST /admin/sync-ahora` llaman a esta funcion.
Asi nunca corren dos syncs simultaneos sobre la misma base.

---

## Que pasa cuando el backend arranca

```
1. loadTokens()                              ← carga tokens MeLi desde .env
2. app.listen(PORT)                          ← servidor disponible
3. clientesContabilidadService.getDashboard()← warm-up Excel clientes
4. metaAdsSalesService.ensureSynchronized() ← warm-up ventas Meta Ads
5. correrSyncSeguro("startup")               ← primer sync sin esperar al cron
6. cron.schedule("5 * * * *", ...)           ← agenda el cron horario
```

Los pasos 3-6 son no-bloqueantes — el servidor responde requests apenas el
paso 2 termina.
