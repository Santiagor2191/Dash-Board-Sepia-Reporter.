# Fix Modulo Publicidad — Resumen Ejecutivo

**Fecha:** 2026-04-08
**Duracion:** ~2 horas (3 iteraciones)
**Herramientas usadas:** Claude Opus 4.6 (resolvio), Gemini 3.1 Pro High (no resolvio)
**Documentacion tecnica completa:** [debug-publicidad-ads.md](debug-publicidad-ads.md)

---

## Problema

La pagina de Publicidad del dashboard no cargaba datos de campanas ni metricas de Mercado Ads. El modulo fue construido originalmente con Gemini 3.1 Pro pero nunca funciono.

## Causa raiz

MercadoLibre depreco la API v1 de Product Ads en junio 2025. Los endpoints que teniamos ya no existen. La API v2 tiene una estructura de URLs completamente diferente, requiere un header nuevo (`api-version: 2`) y un paso adicional de autenticacion (obtener `advertiser_id`).

## Proceso de resolucion

| Paso | Que se hizo | Resultado |
|------|-------------|-----------|
| 1 | Corregir bugs de codigo (arrays, parametros faltantes, error handling) | No resolvio — los endpoints seguian siendo los incorrectos |
| 2 | Arreglar loop infinito de errores en frontend (faltaba verificar conexion MeLi antes de llamar ads) | Loop parado, pero datos seguian sin cargar |
| 3 | Buscar documentacion oficial de MeLi en la web, descubrir migracion a API v2, reescribir servicio completo | Solucionado |

## Que fallo con Gemini 3.1 Pro

Se quedo en el paso 1. Corrigio sintaxis y logica del codigo pero nunca verifico si los endpoints de la API externa seguian vigentes. Sin acceso a la documentacion actualizada de MeLi, no habia forma de descubrir que la API cambio.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `sepia meli api/src/services/meliClient.js` | Soporte para headers adicionales en `mlGet()` |
| `sepia meli api/src/services/productAdsService.js` | Reescrito completo con endpoints API v2 |
| `sepia meli api/src/routes/adsRoutes.js` | Endpoint de diagnostico + mejor manejo de errores |
| `sepia-dashboard-Fronted/src/api.js` | Nueva funcion `getAdsDiagnose()` |
| `sepia-dashboard-Fronted/src/pages/Publicidad.jsx` | Verificacion de conexion MeLi + boton diagnostico |

## Leccion aprendida

Cuando una integracion con API externa falla, lo primero es verificar que los endpoints sigan vigentes en la documentacion oficial — no asumir que el codigo es el unico problema.
