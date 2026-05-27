-- =============================================================================
-- migracion_sync_api.sql
-- =============================================================================
-- Prepara la base ventas_ml para recibir sincronizaciones incrementales
-- desde la API de Mercado Libre.
--
-- Este script es IDEMPOTENTE: se puede correr varias veces sin riesgo.
-- Cada operacion usa "IF NOT EXISTS" o equivalente.
--
-- Cambios que aplica:
--   1) Agrega columna order_item_id (identifica linea dentro de una orden MeLi)
--   2) Agrega columna fecha_ultima_actualizacion (sello del ultimo sync)
--   3) Crea indice sobre numero_venta (busquedas rapidas del sync)
--   4) Marca filas existentes: fecha_ultima_actualizacion = fecha_carga
--   5) Crea tabla sync_log para auditoria de cada corrida
-- =============================================================================

BEGIN;

-- 1. Columna order_item_id
--    Solo se llena para filas que vienen del sync API (queda NULL para Excel).
ALTER TABLE ventas_ml
    ADD COLUMN IF NOT EXISTS order_item_id TEXT;

-- 2. Columna fecha_ultima_actualizacion
--    Se setea cada vez que el sync toca la fila. Para filas viejas, la
--    inicializamos al valor de fecha_carga (cuando entraron por primera vez).
ALTER TABLE ventas_ml
    ADD COLUMN IF NOT EXISTS fecha_ultima_actualizacion TIMESTAMP;

UPDATE ventas_ml
SET fecha_ultima_actualizacion = fecha_carga
WHERE fecha_ultima_actualizacion IS NULL;

-- 3. Indice en numero_venta para que el UPSERT sea rapido
--    (numero_venta = order_id de MeLi, lo usamos en cada sync)
CREATE INDEX IF NOT EXISTS idx_ventas_ml_numero_venta
    ON ventas_ml (numero_venta);

-- 4. Indice en origen_dato para filtrar rapido "solo oficiales"
CREATE INDEX IF NOT EXISTS idx_ventas_ml_origen_dato
    ON ventas_ml (origen_dato);

-- 5. Tabla de auditoria de sincronizaciones
CREATE TABLE IF NOT EXISTS sync_log (
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

CREATE INDEX IF NOT EXISTS idx_sync_log_inicio
    ON sync_log (inicio DESC);

COMMIT;

-- =============================================================================
-- VERIFICACION (no modifica nada, solo muestra estado)
-- =============================================================================

\echo '--- Columnas de ventas_ml relevantes ---'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ventas_ml'
  AND column_name IN ('id_unico', 'numero_venta', 'order_item_id',
                      'origen_dato', 'calidad_dato',
                      'fecha_carga', 'fecha_ultima_actualizacion')
ORDER BY ordinal_position;

\echo ''
\echo '--- Indices de ventas_ml ---'
SELECT indexname FROM pg_indexes WHERE tablename = 'ventas_ml';

\echo ''
\echo '--- Existencia tabla sync_log ---'
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'sync_log'
) AS sync_log_existe;

\echo ''
\echo '--- Filas con fecha_ultima_actualizacion seteada ---'
SELECT COUNT(*) AS filas_marcadas FROM ventas_ml
WHERE fecha_ultima_actualizacion IS NOT NULL;
