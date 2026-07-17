-- =============================================================================
-- migracion_social_posts.sql
-- =============================================================================
-- Crea las tablas para el módulo Social Media: posts propios (IG/FB) con
-- insights, competidores a monitorear, y su benchmark.
--
-- Diseño (decisiones del eng-review 2026-07-17):
-- - social_posts guarda el ÚLTIMO ESTADO de cada post (se actualiza cada
--   sync, no histórico diario). Clave real: (plataforma, account_id, post_id).
-- - competidores_social es editable sin desplegar código (CompetidoresEditor.jsx).
-- - social_benchmark guarda un snapshot por competidor por corrida de sync
--   (sí es histórico, a diferencia de social_posts, porque acá el volumen es
--   chico —unos pocos competidores— y ver la evolución de seguidores en el
--   tiempo es justamente el punto del benchmark).
-- - engagement_aprox = (likes + comments) / seguidores de los últimos posts
--   públicos traídos por Business Discovery. Se calcula en socialSyncService.js,
--   no lo entrega Meta directo.
--
-- Este script es IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS social_posts (
    id                  SERIAL PRIMARY KEY,
    plataforma          TEXT NOT NULL CHECK (plataforma IN ('instagram', 'facebook')),
    account_id          TEXT NOT NULL,
    post_id             TEXT NOT NULL,
    fecha_publicacion   TIMESTAMP,
    permalink           TEXT,
    miniatura_url       TEXT,
    media_type          TEXT,
    media_product_type  TEXT,
    caption             TEXT,
    likes               INTEGER DEFAULT 0,
    comentarios         INTEGER DEFAULT 0,
    reach               INTEGER,
    saves               INTEGER,
    shares              INTEGER,
    synced_at           TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT social_posts_unique UNIQUE (plataforma, account_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_fecha
    ON social_posts (fecha_publicacion DESC);

CREATE TABLE IF NOT EXISTS competidores_social (
    id                SERIAL PRIMARY KEY,
    plataforma        TEXT NOT NULL CHECK (plataforma IN ('instagram', 'facebook')),
    handle            TEXT NOT NULL,
    nombre_visible    TEXT,
    activo            BOOLEAN NOT NULL DEFAULT true,
    last_error        TEXT,
    last_synced_at    TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT competidores_social_unique UNIQUE (plataforma, handle)
);

CREATE TABLE IF NOT EXISTS social_benchmark (
    id                  SERIAL PRIMARY KEY,
    competidor_id       INTEGER NOT NULL REFERENCES competidores_social(id) ON DELETE CASCADE,
    fecha_snapshot      TIMESTAMP NOT NULL DEFAULT now(),
    seguidores          INTEGER,
    posts_count         INTEGER,
    engagement_aprox    NUMERIC(6, 4),
    cadencia_semanal    NUMERIC(5, 2)
);

CREATE INDEX IF NOT EXISTS idx_social_benchmark_competidor_fecha
    ON social_benchmark (competidor_id, fecha_snapshot DESC);

COMMIT;

-- =============================================================================
-- VERIFICACION
-- =============================================================================

\echo '--- Tabla social_posts ---'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'social_posts'
ORDER BY ordinal_position;

\echo '--- Tabla competidores_social ---'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'competidores_social'
ORDER BY ordinal_position;

\echo '--- Tabla social_benchmark ---'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'social_benchmark'
ORDER BY ordinal_position;
