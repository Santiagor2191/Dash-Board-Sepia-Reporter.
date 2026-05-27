-- =============================================================================
-- migracion_indices_performance.sql
-- =============================================================================
-- Indices para acelerar las queries de historicalSalesService cuando la
-- tabla ventas_ml crezca a 50k-100k+ filas.
--
-- Idempotente: usa IF NOT EXISTS.
-- =============================================================================

BEGIN;

-- Indice en fecha: acelera WHERE fecha >= CURRENT_DATE - INTERVAL '3 months'
-- Usado por: getInteligencia (top productos, caida, estacionalidad)
CREATE INDEX IF NOT EXISTS idx_ventas_ml_fecha
    ON ventas_ml (fecha);

-- Indice compuesto (fecha, monto_reportado_cop): cubre los CASE WHEN de inteligencia
CREATE INDEX IF NOT EXISTS idx_ventas_ml_fecha_monto
    ON ventas_ml (fecha, monto_reportado_cop);

-- Indice en producto: acelera GROUP BY producto en top productos y concentracion
CREATE INDEX IF NOT EXISTS idx_ventas_ml_producto
    ON ventas_ml (producto);

-- Indice en comprador: acelera el JOIN de cross-sell (a.comprador = b.comprador)
CREATE INDEX IF NOT EXISTS idx_ventas_ml_comprador
    ON ventas_ml (comprador);

COMMIT;

\echo '--- Indices en ventas_ml ---'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'ventas_ml'
ORDER BY indexname;
