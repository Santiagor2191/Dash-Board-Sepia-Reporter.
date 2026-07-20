-- =============================================================================
-- migracion_marca_historial.sql
-- =============================================================================
-- Snapshot diario de los seguidores de la propia cuenta de Sepia (Instagram y
-- Facebook), para poder mostrar la columna "Cambio" en la tabla comparativa
-- de Competidores también para "Tu marca" (hasta ahora solo la tenian los
-- competidores, via social_benchmark).
--
-- Este script es IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS marca_historial (
    id                  SERIAL PRIMARY KEY,
    plataforma          TEXT NOT NULL CHECK (plataforma IN ('instagram', 'facebook')),
    seguidores          INTEGER,
    fecha_snapshot      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marca_historial_plataforma_fecha
    ON marca_historial (plataforma, fecha_snapshot DESC);

COMMIT;

-- =============================================================================
-- VERIFICACION
-- =============================================================================

\echo '--- Tabla marca_historial ---'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'marca_historial'
ORDER BY ordinal_position;
