# Resolucion de Error: Modulo de Publicidad (Product Ads)

**Fecha de inicio:** 2026-04-08
**Fecha de resolucion:** 2026-04-08
**Duracion estimada:** ~2 horas (analisis + 3 iteraciones de correccion)
**Modulo afectado:** Publicidad (Product Ads) — Backend + Frontend

---

## 1. Problema Reportado

> "Para la parte de publicidad de este proyecto no se puede conectar"

La pagina de Publicidad del dashboard no cargaba datos. No mostraba campanas, metricas ni anuncios de Mercado Ads.

---

## 2. Cronologia de Errores y Correcciones

### ITERACION 1 — Analisis inicial y primeras correcciones

**Errores encontrados en el codigo original:**

| # | Error | Archivo | Detalle |
|---|-------|---------|---------|
| 1 | Respuestas no normalizadas | `productAdsService.js` | `campMetrics.find()` y `adsMetrics.find()` asumian que la API devolveria un array, pero MeLi puede devolver `{ results: [...] }` o un objeto. Si no era array, `.find()` crasheaba. |
| 2 | Faltaba `user_id` en endpoint de ads | `productAdsService.js:68` | El endpoint `/advertising/product_ads/ads/search?campaign_id=X` no incluia `user_id`, parametro requerido por la API. |
| 3 | Endpoints de metricas potencialmente incorrectos | `productAdsService.js:43,72` | Usaba `/metrics/campaigns` y `/metrics/ads` que podrian no existir en la API actual. |
| 4 | Errores se tragaban silenciosamente | `productAdsService.js:46` | Los bloques `catch` de metricas solo hacian `console.error` sin dar contexto util al frontend. |

**Correcciones aplicadas:**
- Funcion `toArray()` para normalizar respuestas de MeLi
- Funcion `tryEndpoints()` para probar endpoint principal y alternativo
- Agregado `user_id` al endpoint de ads
- Campos flexibles: `campaign_id || id`, `amount || cost || spend`, etc.
- Funcion `diagnose()` y endpoint `GET /ads/diagnose`
- Boton "Diagnosticar conexion" en el frontend

---

### ITERACION 2 — Error de loop infinito en consola

**Error observado:**
```
[Ads Service] Error obteniendo usuario: undefined No hay access token. Autentica en /auth/mercadolibre.
[Ads Route] Error: No se pudo obtener tu usuario de Mercado Libre: No hay access token. Autentica en /auth/mercadolibre.
```
(Repetido decenas de veces en la consola del backend)

**Causa raiz:**
La pagina `Publicidad.jsx` llamaba directamente a `getAdsMetrics()` sin verificar primero si el usuario estaba conectado a Mercado Libre. A diferencia de las paginas de Ordenes e Inventario que SI verificaban con `getStatus()` antes de hacer llamadas a la API de MeLi.

**Comparacion con paginas funcionales:**
```javascript
// Ordenes.jsx (CORRECTO - verifica primero)
const status = await getStatus();
if (!status.conectado) {
  setError("No conectado a Mercado Libre...");
  return;
}
// Solo entonces hace la llamada real

// Publicidad.jsx (INCORRECTO - llamaba directo)
const payload = await getAdsMetrics(); // Sin verificar conexion
```

**Correccion aplicada:**
```javascript
// Publicidad.jsx (CORREGIDO)
const status = await getStatus();
if (!status.conectado) {
  setError("No conectado a Mercado Libre. Conecta tu cuenta primero.");
  return;
}
const payload = await getAdsMetrics();
```

---

### ITERACION 3 — Endpoints de API deprecados

**Error observado:**
Despues de conectar MeLi, el diagnostico revelaba que los endpoints no existian (404).

**Causa raiz — LA RAZON PRINCIPAL DEL FALLO:**

Los endpoints de Product Ads usados en el codigo original eran de la **API v1 de Mercado Libre**, que fue **deprecada el 6 de junio de 2025**.

| Endpoint viejo (v1) — DEPRECADO | Endpoint nuevo (v2) — ACTUAL |
|---|---|
| `GET /advertising/product_ads/campaigns?user_id=X` | `GET /marketplace/advertising/{site_id}/advertisers/{adv_id}/product_ads/campaigns/search` |
| `GET /advertising/product_ads/metrics/campaigns?user_id=X&campaign_ids=Y` | (metricas incluidas en campaigns/search con `metrics_summary=true`) |
| `GET /advertising/product_ads/ads/search?campaign_id=X` | `GET /marketplace/advertising/{site_id}/advertisers/{adv_id}/product_ads/ads/search` |
| `GET /advertising/product_ads/metrics/ads?user_id=X&ad_ids=Y` | (metricas incluidas en ads/search con parametro `metrics`) |
| _(no existia)_ | `GET /advertising/advertisers?product_id=PADS` (obtener advertiser_id) |

**Diferencias clave entre v1 y v2:**

1. **Estructura de URL:** v1 usaba `user_id` como query param. v2 usa `site_id` y `advertiser_id` como parte de la ruta.
2. **Header requerido:** v2 requiere `api-version: 2` en los headers HTTP.
3. **Metricas integradas:** En v1 las metricas eran endpoints separados. En v2 las metricas vienen incluidas en la respuesta de campaigns/ads con el parametro `metrics`.
4. **Nuevo recurso `advertisers`:** v2 requiere primero obtener el `advertiser_id` del usuario via `/advertising/advertisers?product_id=PADS`.
5. **Nombres de campos:** v2 usa `prints` en vez de `impressions`, `cost` en vez de `amount`.

---

## 3. Archivos Modificados

| Archivo | Cambio | Razon |
|---------|--------|-------|
| `sepia meli api/src/services/meliClient.js` | Agregado parametro `extraHeaders` a `mlGet()` | Necesario para enviar `api-version: 2` a los endpoints de ads |
| `sepia meli api/src/services/productAdsService.js` | **Reescrito completo** | Endpoints v1 deprecados, reemplazados por v2 |
| `sepia meli api/src/routes/adsRoutes.js` | Agregado endpoint `/ads/diagnose` + mejor error handling | Permitir depuracion y mensajes de error claros |
| `sepia-dashboard-Fronted/src/api.js` | Agregado `getAdsDiagnose()` | Cliente para el nuevo endpoint de diagnostico |
| `sepia-dashboard-Fronted/src/pages/Publicidad.jsx` | Verificacion `getStatus()` + boton diagnostico | Evitar loop de errores + herramienta de depuracion |

---

## 4. Solucion Final

### Backend — `productAdsService.js`

Flujo corregido:

```
1. GET /users/me
   -> Obtener user.id y user.nickname

2. GET /advertising/advertisers?product_id=PADS
   -> Obtener advertiser_id y site_id (ej: MCO para Colombia)

3. GET /marketplace/advertising/{site_id}/advertisers/{advertiser_id}/product_ads/campaigns/search
   Headers: api-version: 2
   Params: limit, offset, date_from, date_to, metrics, metrics_summary=true
   -> Campanas con metricas incluidas (clicks, prints, cost, roas, etc.)

4. Para cada campana:
   GET /marketplace/advertising/{site_id}/advertisers/{advertiser_id}/product_ads/ads/search
   Headers: api-version: 2
   Params: campaign_id, filters[status]=active, date_from, date_to, metrics
   -> Anuncios individuales con metricas
```

### Backend — `meliClient.js`

```javascript
// Antes (v1):
const mlGet = async (endpoint, params = {}, retryOn401 = true) => { ... }

// Despues (v2):
const mlGet = async (endpoint, params = {}, retryOn401 = true, extraHeaders = {}) => {
  // headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders }
}
```

### Frontend — `Publicidad.jsx`

```javascript
// Verificar conexion ANTES de llamar ads (igual que Ordenes/Inventario)
const status = await getStatus();
if (!status.conectado) {
  setError("No conectado a Mercado Libre. Conecta tu cuenta primero.");
  return;
}
const payload = await getAdsMetrics();
```

---

## 5. Metricas disponibles en API v2

La API v2 de Product Ads expone estas metricas por campana y por anuncio:

| Metrica | Descripcion |
|---------|-------------|
| `clicks` | Clics en el anuncio |
| `prints` | Impresiones (veces que se mostro) |
| `ctr` | Click-through rate (clicks/prints) |
| `cost` | Gasto total en la campana/anuncio |
| `cpc` | Costo por clic |
| `acos` | Advertising cost of sales |
| `roas` | Return on ad spend |
| `cvr` | Conversion rate |
| `direct_amount` | Ventas directas atribuidas |
| `indirect_amount` | Ventas indirectas atribuidas |
| `total_amount` | Ventas totales atribuidas |
| `direct_units_quantity` | Unidades vendidas directas |
| `indirect_units_quantity` | Unidades vendidas indirectas |
| `units_quantity` | Total unidades vendidas |
| `sov` | Share of voice |

---

## 6. Prerequisitos para que funcione

1. **Token de MeLi activo:** El usuario debe conectarse via OAuth desde Ordenes o Inventario.
2. **Product Ads activado:** La cuenta de MeLi debe tener Product Ads habilitado (Mercado Libre > Publicidad).
3. **Al menos una campana:** Debe existir al menos una campana de Product Ads creada en la cuenta.
4. **App con permisos:** La app de MeLi registrada debe tener acceso a la API de advertising.

---

## 7. Referencias

- [Product Ads - MeLi Developers](https://global-selling.mercadolibre.com/devsite/category-predictor/new-product-ads)
- [Campaigns, Ads and Metrics - MeLi](https://global-selling.mercadolibre.com/devsite/campaigns-ads-and-metrics)
- [Mercado Ads Introduction](https://developers.mercadolibre.com.ar/en_us/en_us/mercado-ads-introduction)
- [API Docs MeLi](https://developers.mercadolibre.com.ar/en_us/api-docs)
