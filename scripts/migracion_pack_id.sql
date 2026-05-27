-- =============================================================================
-- migracion_pack_id.sql
-- =============================================================================
-- Agrega columna meli_order_id a ventas_ml para separar el identificador
-- interno de MeLi (order.id) del numero que se usa para matchear con el
-- Excel (pack_id, o order.id cuando no hay pack).
--
-- Este script es IDEMPOTENTE: se puede correr varias veces sin riesgo.
-- =============================================================================

BEGIN;

-- Columna meli_order_id: guarda el order.id original de MeLi (solo en filas API)
ALTER TABLE ventas_ml
    ADD COLUMN IF NOT EXISTS meli_order_id TEXT;

-- Indice para busquedas por order.id (trazabilidad, debug)
CREATE INDEX IF NOT EXISTS idx_ventas_ml_meli_order_id
    ON ventas_ml (meli_order_id);

COMMIT;

-- =============================================================================
-- VERIFICACION
-- =============================================================================

\echo '--- Columna meli_order_id en ventas_ml ---'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ventas_ml'
  AND column_name = 'meli_order_id';

\echo ''
\echo '--- Indice meli_order_id ---'
SELECT indexname FROM pg_indexes
WHERE tablename = 'ventas_ml'
  AND indexname = 'idx_ventas_ml_meli_order_id';
