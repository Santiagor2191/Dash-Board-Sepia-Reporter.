"""
validar_carga.py
================
Valida la carga de datos en la tabla ventas_ml de MySQL.
Muestra estadísticas y detecta posibles problemas.

Uso:
    python scripts/validar_carga.py
"""

import os
import re

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parents[1] / "sepia meli api" / ".env"
load_dotenv(dotenv_path=env_path)

# Configuración
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

TABLA = os.getenv("SEPIA_DB_TABLE", "ventas_ml")

if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", TABLA):
    raise ValueError(f"Nombre de tabla invalido: {TABLA}")


def main():
    with ENGINE.connect() as conn:
        # ------------------------------------------------------------------
        # 1. Total de filas
        # ------------------------------------------------------------------
        total = conn.execute(text(f"SELECT COUNT(*) FROM {TABLA}")).scalar()
        print("=" * 60)
        print("VALIDACIÓN DE CARGA - ventas_ml")
        print("=" * 60)
        print(f"\nTotal de filas: {total}")

        # ------------------------------------------------------------------
        # 2. Filas por año
        # ------------------------------------------------------------------
        por_anio = pd.read_sql(text(
            f"SELECT anio, COUNT(*) AS filas FROM {TABLA} GROUP BY anio ORDER BY anio"
        ), conn)
        print("\nFilas por año:")
        for _, r in por_anio.iterrows():
            print(f"  {int(r['anio']):>6}: {r['filas']:>6}")

        # ------------------------------------------------------------------
        # 3. Filas por año y mes
        # ------------------------------------------------------------------
        por_anio_mes = pd.read_sql(text(
            f"""SELECT anio, num_mes, mes, COUNT(*) AS filas
                FROM {TABLA}
                GROUP BY anio, num_mes, mes
                ORDER BY anio, num_mes"""
        ), conn)
        print("\nFilas por año y mes:")
        anio_actual = None
        for _, r in por_anio_mes.iterrows():
            if r["anio"] != anio_actual:
                anio_actual = r["anio"]
                print(f"\n  --- {int(anio_actual)} ---")
            mes_nombre = r["mes"] if r["mes"] else f"Mes {int(r['num_mes'])}"
            print(f"    {mes_nombre:>12}: {r['filas']:>5}")

        # ------------------------------------------------------------------
        # 4. Duplicados en id_unico
        # ------------------------------------------------------------------
        dup_id = pd.read_sql(text(f"""
            SELECT id_unico, COUNT(*) AS n
            FROM {TABLA}
            GROUP BY id_unico
            HAVING COUNT(*) > 1
            ORDER BY n DESC
            LIMIT 10
        """), conn)
        print(f"\nDuplicados en id_unico: {len(dup_id)}")
        if len(dup_id) > 0:
            print("  Primeros 10:")
            print(dup_id.to_string(index=False))

        # ------------------------------------------------------------------
        # 5. numero_venta repetido (esperado para oficiales)
        # ------------------------------------------------------------------
        dup_nv = pd.read_sql(text(f"""
            SELECT numero_venta, COUNT(*) AS n
            FROM {TABLA}
            WHERE numero_venta IS NOT NULL
            GROUP BY numero_venta
            HAVING COUNT(*) > 1
            ORDER BY n DESC
            LIMIT 15
        """), conn)
        print(f"\nnumero_venta con múltiples filas: {len(dup_nv)}")
        if len(dup_nv) > 0:
            print("  Top 15 (esto es normal para datos oficiales con devoluciones):")
            print(dup_nv.to_string(index=False))

        # ------------------------------------------------------------------
        # 6. Filas por origen_dato
        # ------------------------------------------------------------------
        por_origen = pd.read_sql(text(f"""
            SELECT origen_dato, calidad_dato, COUNT(*) AS filas
            FROM {TABLA}
            GROUP BY origen_dato, calidad_dato
        """), conn)
        print("\nFilas por origen y calidad:")
        print(por_origen.to_string(index=False))

        # ------------------------------------------------------------------
        # 7. Nulos en columnas clave
        # ------------------------------------------------------------------
        print("\nNulos en columnas clave:")
        for col in ["fecha", "producto", "cantidad", "monto_reportado_cop", "numero_venta"]:
            nulos = conn.execute(
                text(f"SELECT COUNT(*) FROM {TABLA} WHERE {col} IS NULL")
            ).scalar()
            print(f"  {col:>30}: {nulos:>6} nulos")

        # ------------------------------------------------------------------
        # 8. Rango de fechas
        # ------------------------------------------------------------------
        rango = pd.read_sql(text(f"""
            SELECT MIN(fecha) AS primera, MAX(fecha) AS ultima FROM {TABLA}
        """), conn)
        print(f"\nRango de fechas: {rango.iloc[0]['primera']} a {rango.iloc[0]['ultima']}")

    print("\nValidación completada.")


if __name__ == "__main__":
    main()
