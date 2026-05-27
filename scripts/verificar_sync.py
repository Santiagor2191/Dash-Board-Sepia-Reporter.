"""
verificar_sync.py
=================
Verifica el estado del sync MeLi -> PostgreSQL.
Muestra:
  - Ultimas corridas en sync_log
  - Conteo de filas en ventas_ml por origen_dato
  - Rango de fechas por origen
"""

import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / "sepia meli api" / ".env")

ENGINE = create_engine(
    URL.create(
        "postgresql+psycopg2",
        username=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "mercado_libre_oficial"),
    )
)

with ENGINE.connect() as conn:
    print("=" * 80)
    print("ULTIMAS CORRIDAS DE sync_log")
    print("=" * 80)
    rows = conn.execute(text("""
        SELECT id, inicio, fin, duracion_ms,
               rango_desde, rango_hasta,
               ordenes_procesadas, ordenes_nuevas, ordenes_actualizadas,
               errores, estado, mensaje
        FROM sync_log
        ORDER BY inicio DESC
        LIMIT 5
    """)).fetchall()

    if not rows:
        print("  (no hay corridas registradas todavia)")
    else:
        for r in rows:
            print(f"\n  #{r[0]}  estado={r[10]}")
            print(f"     inicio: {r[1]}")
            print(f"     fin:    {r[2]}    duracion: {r[3] or 0}ms")
            print(f"     rango:  {r[4]} -> {r[5]}")
            print(f"     procesadas={r[6]}  nuevas={r[7]}  actualizadas={r[8]}  errores={r[9]}")
            print(f"     mensaje: {r[11]}")

    print()
    print("=" * 80)
    print("FILAS EN ventas_ml POR origen_dato")
    print("=" * 80)
    rows = conn.execute(text("""
        SELECT COALESCE(origen_dato, '(null)') AS origen,
               COUNT(*) AS filas,
               MIN(fecha) AS fecha_min,
               MAX(fecha) AS fecha_max
        FROM ventas_ml
        GROUP BY origen_dato
        ORDER BY origen_dato NULLS LAST
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:<30}  filas={r[1]:>6}   {r[2]} -> {r[3]}")

    print()
    print("=" * 80)
    print("FILAS PRELIMINARES (api_meli_preliminar) POR MES")
    print("=" * 80)
    rows = conn.execute(text("""
        SELECT anio, num_mes, COUNT(*) AS filas,
               SUM(cantidad) AS unidades,
               SUM(monto_reportado_cop)::BIGINT AS revenue
        FROM ventas_ml
        WHERE origen_dato = 'api_meli_preliminar'
        GROUP BY anio, num_mes
        ORDER BY anio, num_mes
    """)).fetchall()
    if not rows:
        print("  (todavia no hay filas preliminares de la API)")
    else:
        for r in rows:
            print(f"  {r[0]}-{r[1]:02d}   filas={r[2]:>4}   unidades={r[3]}   revenue={r[4]:,}")
