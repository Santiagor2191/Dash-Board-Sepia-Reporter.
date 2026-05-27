# Arquitectura del sync MeLi → PostgreSQL

## Principio rector: "Excel gana"

La tabla `ventas_ml` tiene una sola **fuente de verdad fiscal**: el Excel
oficial mensual exportado desde Mercado Libre. El sync de la API jamas
sobreescribe datos del Excel; solo llena el "gap" entre el ultimo dia
cubierto por el Excel y el dia actual.

```
Excel oficial:    [Ene 2025] [Feb 2025] ... [Mar 2026] [Abr 2026]
Sync API:                                                       [May 2026 →]
                  ^                                  ^
                  source of truth fiscal             gap llenado en vivo
```

Cuando llegue el proximo Excel (junio 2026), el script `carga_inicial.py`
hace `DROP + CREATE + INSERT` y borra las filas preliminares de mayo.
El sync vuelve a llenar el gap automaticamente para junio en adelante.

---

## Modelo de datos

Una sola tabla `ventas_ml` con discriminador `origen_dato`:

| `origen_dato` | Quien la inserto | Cuando | Confiabilidad |
|---|---|---|---|
| `manual_historico` | `carga_inicial.py` | Datos antes de 2025 | Media (digitacion) |
| `mercadolibre_oficial` | `carga_inicial.py` | Excel mensual desde 2025 | Alta (fuente fiscal) |
| `api_meli_preliminar` | `syncMeliToDbService` | Cada hora durante el mes en curso | Preliminar |

**Ventaja de una sola tabla:** el dashboard sigue funcionando sin cambios.
Quien quiera reportes 100% oficiales puede filtrar `WHERE origen_dato IN ('mercadolibre_oficial', 'manual_historico')`.

---

## Flujo del sync horario

```
                    ┌──────────────┐
   cron / boton ──> │ syncRecent   │
                    │  Orders()    │
                    └──────┬───────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ ¿Cual es la ultima fecha   │
              │ oficial en ventas_ml?      │  ←── ignora fechas futuras
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ Calcular rango:            │
              │  desde = max(ultimoExcel+1,│
              │              hoy - 14 dias)│
              │  hasta = hoy               │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ GET /orders/search MeLi    │
              │ (paginado de 50 en 50)     │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ Por cada orden,            │
              │  por cada item:            │
              │  UPSERT en ventas_ml       │
              │  por id_unico              │
              │  (determinstico SHA-256)   │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ Log en sync_log:           │
              │  ordenes, nuevas/actualiz, │
              │  errores, duracion         │
              └────────────────────────────┘
```

### Por que sincronizar 14 dias hacia atras (no solo "lo nuevo")

Una orden puede cambiar de estado despues de ser creada:
- `paid` → `cancelled` (cliente cancelo)
- `paid` → reembolso parcial (devolucion)

Si solo sincronizaramos las ordenes nuevas, nuestra base se quedaria con
estados desactualizados. La ventana de 14 dias captura ~99% de los cambios
de estado en MeLi sin pedir datos viejos innecesarios.

---

## `id_unico` deterministico

Cada fila preliminar lleva un `id_unico` generado con SHA-256:

```
id_unico = sha256("api|" + order.id + "|" + item.id + "|" + variation_id)
```

Esto significa que **re-ejecutar el sync genera exactamente el mismo `id_unico`**
para la misma orden. Combinado con `ON CONFLICT (id_unico) DO UPDATE`, el sync
es **idempotente**: se puede correr 100 veces sin duplicar.

---

## Lock contra solapamiento

El cron horario y el endpoint manual comparten un lock en memoria
(`ejecutarSyncConLock` en `server.js`). Si el cron arranca a las 12:05 y un
usuario hace click en "sync ahora" a las 12:05:30, el segundo recibe
HTTP 409 (Conflict) en lugar de iniciar un sync paralelo sobre la misma base.

---

## Zona horaria

Todo el manejo de fechas usa **America/Bogota** explicitamente, no la zona
del sistema. Esto evita que ordenes cerradas a las 11pm en Colombia se
contabilicen como del dia siguiente (UTC). El cron tambien esta amarrado
a `America/Bogota`.

---

## Que NO hace el sync (todavia)

- **No consulta `/shipments/{id}`** → `ciudad` y `forma_entrega` quedan `null`
  en filas preliminares. Cuando llegue el Excel oficial los completa.
- **No persiste tokens** → si reinicias el backend, el token de MeLi se
  pierde y hay que re-autenticar (ver [`06-pendientes.md`](06-pendientes.md)).
- **No usa `pack_id`** → algunas ordenes apareceran como "huerfanas" en
  la reconciliacion. Fix documentado en [`05-reconciliacion-hallazgos.md`](05-reconciliacion-hallazgos.md).
