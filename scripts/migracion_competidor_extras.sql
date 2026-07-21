-- =============================================================================
-- migracion_competidor_extras.sql
-- =============================================================================
-- Agrega a Competidores lo que le faltaba respecto a la demo de MB Suite:
-- likes/comentarios promedio, mezcla de formatos (Reels/Carrusel/Imagen) y
-- una grilla de publicaciones recientes por competidor (antes solo
-- guardábamos el resumen, no cada post individual).
--
-- Este script es IDEMPOTENTE.
-- =============================================================================

BEGIN;

ALTER TABLE social_benchmark
    ADD COLUMN IF NOT EXISTS likes_promedio       NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS comentarios_promedio  NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS pct_reels             NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS pct_carousel          NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS pct_imagen            NUMERIC(5, 2);

CREATE TABLE IF NOT EXISTS competidor_posts (
    id                  SERIAL PRIMARY KEY,
    competidor_id       INTEGER NOT NULL REFERENCES competidores_social(id) ON DELETE CASCADE,
    post_id             TEXT NOT NULL,
    fecha_publicacion   TIMESTAMP,
    permalink           TEXT,
    miniatura_url       TEXT,
    media_type          TEXT,
    media_product_type  TEXT,
    caption             TEXT,
    likes               INTEGER DEFAULT 0,
    comentarios         INTEGER DEFAULT 0,
    synced_at           TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT competidor_posts_unique UNIQUE (competidor_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_competidor_posts_competidor_fecha
    ON competidor_posts (competidor_id, fecha_publicacion DESC);

COMMIT;

-- =============================================================================
-- VERIFICACION
-- =============================================================================

\echo '--- Columnas nuevas en social_benchmark ---'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'social_benchmark'
ORDER BY ordinal_position;

\echo '--- Tabla competidor_posts ---'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'competidor_posts'
ORDER BY ordinal_position;
