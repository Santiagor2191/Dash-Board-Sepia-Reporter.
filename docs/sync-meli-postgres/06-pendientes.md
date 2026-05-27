# Pendientes

En orden de prioridad. El sistema actual ya **funciona y trae datos preliminares**;
estos pendientes lo mejoran.

---

## 1. Usar `pack_id` para matchear con el Excel (~15 min)

**Por que importa:** sin este fix, la reconciliacion va a seguir mostrando ~126
ordenes "huerfanas" que en realidad si estan en el Excel pero con otro
identificador. Ver detalle en [`05-reconciliacion-hallazgos.md`](05-reconciliacion-hallazgos.md).

**Que hacer:**

1. En `sepia meli api/src/services/syncMeliToDbService.js`, dentro de
   `orderToRows()`, leer ademas el `pack_id`:
   ```js
   const packId = order.pack_id || null;
   const numeroVenta = packId || String(order.id);
   ```

2. Usar `numeroVenta` (no `String(order.id)`) en el campo `numero_venta` de
   la fila. Pero **mantener `order.id` separado** para trazabilidad. Para eso:

3. Agregar nueva columna `meli_order_id` a `ventas_ml` via nueva migracion
   (idempotente). Tambien actualizar `carga_inicial.py` para que la CREATE TABLE
   tenga la columna nueva.

4. En `orderToRows()` setear `meli_order_id = String(order.id)`.

5. Re-correr sync. Las 86 filas de mayo se van a actualizar via UPSERT
   (mismo `id_unico` deterministico, asi que no se duplican).

6. Re-correr reconciliacion. **Esperado:** match > 90%, gap de revenue casi
   inexistente (solo deberia quedar la diferencia bruto vs neto).

**Riesgo:** ninguno. Las filas oficiales del Excel no se tocan; solo cambia
la forma en que las nuevas filas API se identifican.

---

## 2. Persistir tokens de MeLi (~30-45 min)

**Por que importa:** hoy los tokens viven solo en memoria del backend. Cada
vez que el backend se reinicia (o `nodemon` detecta un cambio de archivo), el
token se pierde y hay que volver a autenticar en el flujo OAuth de MeLi.
Esto es especialmente doloroso en desarrollo, pero seria fatal en produccion.

**Opciones:**

### Opcion A — Guardar en `.env` (rapido pero feo)
- En `meliClient.js`, cuando se obtienen tokens nuevos, escribirlos a `.env`
- Al arrancar, leer de `.env` (ya lo hace via `MELI_INITIAL_TOKENS`)
- **Pros:** simple, sin nuevas dependencias
- **Contras:** modificar `.env` desde codigo es feo, y en cloud (Render) los
  filesystems son efimeros

### Opcion B — Guardar en PostgreSQL (recomendada para cloud)
- Crear tabla `meli_tokens` (1 sola fila)
- En `meliClient.js`, callback `onTokensUpdated` hace UPSERT
- Al arrancar, `loadTokens` lee de la tabla en lugar de `.env`
- **Pros:** sobrevive cualquier reinicio, funciona en Render
- **Contras:** ~30 min de trabajo

**Recomendacion:** hacer **Opcion B** cuando ataquemos el despliegue cloud
(ver `docs/despliegue-cloud/`). Para desarrollo local en lo que tanto:
re-autenticar manualmente cuando haga falta (con `python scripts/disparar_sync.py`
podemos verificar si el token sigue vivo).

---

## 3. Limpiar las 39 filas con fecha futura en el Excel (~30 min)

**Por que importa:** el Excel actual tiene 39 filas con fechas entre junio-diciembre
2026 (todos con `dia=04`). Patron sospechoso: parece un bug de interpretacion
DMY vs MDY en `carga_inicial.py` (Python pandas leyendo "06/04/2026" como
"June 4" cuando en Colombia se escribe como "6 de abril").

**Que hacer:**

1. Identificar las filas afectadas y verificar en el Excel original cual era
   la fecha correcta.

2. En `scripts/carga_inicial.py`, cambiar la lectura de fechas para usar
   formato dia-primero explicitamente:
   ```python
   df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce", dayfirst=True)
   ```

3. Recargar el Excel oficial.

**Mientras no se arregle:** el sync ya filtra fechas futuras con
`WHERE fecha <= CURRENT_DATE`, asi que no bloquea operaciones. Pero los
reportes historicos pueden mostrar ventas falsas en meses futuros.

---

## 4. Mejoras al script de reconciliacion (v2) (~20 min)

Una vez aplicado el fix #1 (`pack_id`), el script de reconciliacion va a ser
mucho mas util. Mejoras adicionales:

- Excluir automaticamente filas Excel con `estado LIKE 'Paquete%'` del conteo
  de huerfanas (no son ordenes reales).
- Mostrar el desglose por dia del rango (no solo el total).
- Exportar el reporte a un archivo Markdown o CSV para compartir.
- Agregar comparacion de productos (no solo ordenes): "el producto X vendio
  Y unidades en API vs Z en Excel".

---

## 5. Enriquecer filas preliminares con `ciudad` y `forma_entrega` (~20 min)

**Por que importa:** las filas API tienen `ciudad=null` y `forma_entrega=null`,
mientras las del Excel oficial tienen ambos. Eso significa que reportes geograficos
del mes en curso quedan vacios.

**Que hacer:**

1. En `orderToRows()`, si `order.shipping?.id` existe, llamar
   `mlGet('/shipments/{id}')` para obtener la direccion y modo de entrega.
2. Cachear el resultado para no llamar al mismo shipment varias veces.
3. Para no triplicar el tiempo del sync, hacerlo en paralelo con
   `mapWithConcurrency` (ya hay helper en `meliRoutes.js`).

**Trade-off:** sumaria ~5-10 segundos al sync horario. Probablemente vale
la pena para tener reportes geograficos en vivo.

---

## 6. Frontend: botones "Sync ahora" y "Ver log de syncs" (~30 min)

El backend ya expone los endpoints. Falta el UI:

- En el dashboard, agregar boton "Sincronizar ahora" que llame
  `POST /admin/sync-ahora` y muestre el resultado.
- Agregar pagina o seccion "Estado del sync" que llame `GET /admin/sync-log`
  y muestre una tabla con las ultimas corridas (con sus estados, tiempos
  y errores).

---

## Resumen visual

```
PRIORIDAD ALTA (afectan calidad de datos)
  1. Fix pack_id ────────────── 15 min
  3. Limpiar fechas futuras ─── 30 min

PRIORIDAD MEDIA (mejoran experiencia)
  2. Persistir tokens (cloud) ── 30-45 min
  6. UI sync ahora ──────────── 30 min

PRIORIDAD BAJA (refinamiento)
  4. Reconciliacion v2 ──────── 20 min
  5. Ciudad/forma_entrega ───── 20 min

TOTAL ─────────────────────── ~2.5 - 3 horas
```
