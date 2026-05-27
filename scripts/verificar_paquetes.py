"""
verificar_paquetes.py
=====================
Comprueba la hipotesis de Santiago: cuando una orden es parte de un paquete
en el Excel, queda con monto en blanco; el total real esta en una fila aparte
'Paquete de N productos'.

Suma de tres formas distintas el Excel y compara contra la API.
"""

import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / "sepia meli api" / ".env")

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

FROM = "2026-03-01"
TO = "2026-04-30"

with ENGINE.connect() as conn:
    print("=" * 75)
    print(f"DESCOMPOSICION DEL EXCEL EN EL RANGO {FROM} -> {TO}")
    print("=" * 75)

    # Total bruto: todas las filas
    total_bruto = conn.execute(text("""
        SELECT COUNT(*) AS filas,
               COALESCE(SUM(cantidad), 0) AS cantidad,
               COALESCE(SUM(monto_reportado_cop), 0) AS monto
        FROM ventas_ml
        WHERE origen_dato IN ('mercadolibre_oficial', 'manual_historico')
          AND fecha BETWEEN :f AND :t
    """), {"f": FROM, "t": TO}).fetchone()

    # Por tipo de fila
    rows = conn.execute(text("""
        SELECT
          CASE
            WHEN estado ILIKE 'Paquete%%' THEN 'A. Filas Paquete (resumen)'
            WHEN cantidad = 0 OR cantidad IS NULL THEN 'B. Filas qty=0 (no Paquete)'
            WHEN monto_reportado_cop IS NULL OR monto_reportado_cop = 0 THEN
              'C. Filas con monto=0 (probable: dentro de paquete)'
            ELSE 'D. Ordenes normales (qty>0, monto>0)'
          END AS tipo,
          COUNT(*) AS filas,
          COALESCE(SUM(cantidad), 0) AS cantidad,
          COALESCE(SUM(monto_reportado_cop), 0) AS monto
        FROM ventas_ml
        WHERE origen_dato IN ('mercadolibre_oficial', 'manual_historico')
          AND fecha BETWEEN :f AND :t
        GROUP BY tipo
        ORDER BY tipo
    """), {"f": FROM, "t": TO}).fetchall()

    print(f"\n  {'TIPO':<55} {'FILAS':>6} {'QTY':>6} {'MONTO COP':>14}")
    print(f"  {'-' * 55} {'-' * 6} {'-' * 6} {'-' * 14}")
    for r in rows:
        print(f"  {r[0]:<55} {r[1]:>6} {r[2]:>6} {int(r[3]):>14,}")
    print(f"  {'-' * 55} {'-' * 6} {'-' * 6} {'-' * 14}")
    print(f"  {'TOTAL':<55} {total_bruto[0]:>6} {total_bruto[1]:>6} {int(total_bruto[2]):>14,}")

    print("\n" + "=" * 75)
    print("INTERPRETACION")
    print("=" * 75)

    total_api_reportado = 15_303_024  # del reporte anterior
    total_excel_bruto = int(total_bruto[2])

    print(f"\n  Total reportado API MeLi:                   ${15_303_024:>14,}")
    print(f"  Total Excel BRUTO (todas las filas):        ${total_excel_bruto:>14,}")
    diff = total_api_reportado - total_excel_bruto
    pct = (diff / total_excel_bruto * 100) if total_excel_bruto > 0 else 0
    print(f"  Diferencia:                                 ${diff:>+14,}  ({pct:+.2f}%)")

    print("\n  Si esta diferencia es <5%, la hipotesis de Santiago se confirma:")
    print("  la 'discrepancia' de monto era artefacto de mi comparacion orden-por-orden,")
    print("  no un problema real de datos.")
