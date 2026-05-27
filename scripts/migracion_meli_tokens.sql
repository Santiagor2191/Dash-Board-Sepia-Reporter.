-- =============================================================================
-- migracion_meli_tokens.sql
-- =============================================================================
-- Crea la tabla meli_tokens para persistir los tokens OAuth de MeLi.
-- Sin esto, cada reinicio del backend exige re-autenticar manualmente.
--
-- Diseño: tabla de una sola fila (id=1). El CONSTRAINT lo garantiza.
-- Este script es IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS meli_tokens (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    access_token  TEXT,
    refresh_token TEXT,
    expires_at    TIMESTAMP,
    updated_at    TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
);

COMMIT;

-- =============================================================================
-- VERIFICACION
-- =============================================================================

\echo '--- Tabla meli_tokens ---'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'meli_tokens'
ORDER BY ordinal_position;
