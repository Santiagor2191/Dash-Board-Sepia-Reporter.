"""
diagnostico_excel.py
====================
Diagnostica el "ultimo dia oficial" que el sync va a usar como cutoff,
y muestra las filas con fechas sospechosas (en el futuro).
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
    today = conn.execute(text("SELECT CURRENT_DATE")).scalar()
    print(f"Hoy (PostgreSQL CURRENT_DATE): {today}")
    print()

    print("=" * 70)
    print("ULTIMA fecha 'oficial' que usara el sync (despues del fix)")
    print("=" * 70)
    max_real = conn.execute(text("""
        SELECT MAX(fecha) FROM ventas_ml
        WHERE origen_dato IN ('mercadolibre_oficial', 'manual_historico')
          AND fecha IS NOT NULL
          AND fecha <= CURRENT_DATE
    """)).scalar()
    print(f"  Ultimo dia con datos oficiales (<= hoy): {max_real}")

    print()
    print("=" * 70)
    print("FILAS CON fecha > hoy (datos sospechosos en el Excel)")
    print("=" * 70)
    rows = conn.execute(text("""
        SELECT fecha, COUNT(*) AS filas
        FROM ventas_ml
        WHERE fecha > CURRENT_DATE
        GROUP BY fecha
        ORDER BY fecha DESC
        LIMIT 20
    """)).fetchall()
    if not rows:
        print("  (no hay)")
    else:
        total = sum(r[1] for r in rows)
        print(f"  Total filas con fecha futura: {total}")
        print()
        for r in rows:
            print(f"  {r[0]}: {r[1]} filas")

    print()
    print("=" * 70)
    print("ULTIMOS 10 DIAS CON VENTAS (no futuros)")
    print("=" * 70)
    rows = conn.execute(text("""
        SELECT fecha, COUNT(*) AS filas, SUM(cantidad) AS unidades
        FROM ventas_ml
        WHERE fecha <= CURRENT_DATE
          AND origen_dato IN ('mercadolibre_oficial', 'manual_historico')
        GROUP BY fecha
        ORDER BY fecha DESC
        LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}: {r[1]} filas, {r[2]} unidades")
