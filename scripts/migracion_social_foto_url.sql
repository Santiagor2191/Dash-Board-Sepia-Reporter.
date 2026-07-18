-- =============================================================================
-- migracion_social_foto_url.sql
-- =============================================================================
-- Agrega la columna foto_url a competidores_social, para mostrar la foto de
-- perfil real (Instagram: profile_picture_url via Business Discovery;
-- Facebook: picture publica de la Pagina) en vez del circulo con inicial.
-- Vive en competidores_social (no en social_benchmark) porque es un dato de
-- perfil que casi no cambia, no una metrica que varia por corrida de sync.
--
-- Este script es IDEMPOTENTE.
-- =============================================================================

BEGIN;

ALTER TABLE competidores_social
    ADD COLUMN IF NOT EXISTS foto_url TEXT;

COMMIT;

-- =============================================================================
-- VERIFICACION (opcional, correr aparte)
-- =============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'competidores_social' ORDER BY ordinal_position;
