# Migracion SQL

## Que se agrego a la base de datos

### A la tabla existente `ventas_ml`

Dos columnas nuevas:

| Columna | Tipo | Para que |
|---|---|---|
| `order_item_id` | `TEXT` | Identifica la linea dentro de una orden MeLi (formato `itemId:variationId`). NULL en filas viejas del Excel. |
| `fecha_ultima_actualizacion` | `TIMESTAMP` | Sello del ultimo sync que toco la fila. Para filas viejas se inicializo con `fecha_carga`. |

Dos indices:

| Indice | Para que |
|---|---|
| `idx_ventas_ml_numero_venta` | Acelera el lookup por `numero_venta` que hace el reconciliador. |
| `idx_ventas_ml_origen_dato` | Acelera filtros `WHERE origen_dato = 'mercadolibre_oficial'` para reportes oficiales. |

**El indice unico ya existente** (`ventas_ml_id_unico_key` sobre `id_unico`)
es lo que permite que el `ON CONFLICT (id_unico) DO UPDATE` funcione como
UPSERT idempotente.

### Tabla nueva `sync_log`

Auditoria de cada corrida del sync (cron, startup o manual):

```sql
CREATE TABLE sync_log (
    id SERIAL PRIMARY KEY,
    inicio TIMESTAMP NOT NULL,
    fin TIMESTAMP,
    duracion_ms INTEGER,
    rango_desde DATE,
    rango_hasta DATE,
    ordenes_procesadas INTEGER DEFAULT 0,
    ordenes_nuevas INTEGER DEFAULT 0,
    ordenes_actualizadas INTEGER DEFAULT 0,
    errores INTEGER DEFAULT 0,
    mensaje TEXT,
    estado TEXT NOT NULL DEFAULT 'en_curso'
);

CREATE INDEX idx_sync_log_inicio ON sync_log (inicio DESC);
```

Posibles valores de `estado`:
- `en_curso` — el sync arranco pero todavia no termino
- `completado` — OK, sin errores
- `completado_con_errores` — OK pero alguna orden fallo
- `fallido` — error global (token expirado, MeLi caido, etc.)

---

## Archivos involucrados

| Archivo | Que hace |
|---|---|
| `scripts/migracion_sync_api.sql` | El SQL puro de la migracion (idempotente con `IF NOT EXISTS`). |
| `scripts/aplicar_migracion_sync.py` | Wrapper en Python que ejecuta el SQL usando las credenciales de `sepia meli api/.env` e imprime verificacion al final. |
| `scripts/carga_inicial.py` (modificado) | Se actualizo el `CREATE TABLE` para que la proxima recarga del Excel mantenga las columnas nuevas y la tabla `sync_log`. |

---

## Como aplicarla

```powershell
python scripts/aplicar_migracion_sync.py
```

Es **idempotente**: se puede correr varias veces sin riesgo. Cada operacion
usa `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX
IF NOT EXISTS`.

El script imprime al final una verificacion:
- Lista las columnas nuevas en `ventas_ml`
- Lista los indices
- Confirma existencia de `sync_log`
- Cuenta cuantas filas tienen `fecha_ultima_actualizacion` poblada

---

## Estado actual aplicado (verificado 2026-05-26)

- `ventas_ml` tiene las 2 columnas nuevas
- 8,748/8,748 filas tienen `fecha_ultima_actualizacion` poblada (100%)
- Los 4 indices estan creados (incluyendo los dos viejos: PK y unique id_unico)
- `sync_log` existe y ya tiene corridas registradas
