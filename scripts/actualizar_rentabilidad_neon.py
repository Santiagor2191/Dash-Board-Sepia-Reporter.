"""
actualizar_rentabilidad_neon.py
================================
Lee el Excel de Publicaciones Rentabilidad y actualiza la tabla
publicaciones_rentabilidad en Neon (TRUNCATE + INSERT).

Uso:
    python scripts/actualizar_rentabilidad_neon.py
"""

import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Cargar variables desde el .env del backend
env_path = Path(__file__).resolve().parents[1] / "sepia meli api" / ".env"
load_dotenv(dotenv_path=env_path)

# =============================================================================
# CONFIGURACION
# =============================================================================

EXCEL_PATH = Path(r"C:\Users\SANTIAGO\One Drive\OneDrive\Excel sepia\Rentabilidad Publicaciones Meli.xlsx")
SHEET_NAME = "Publicaciones Rentabilidad"

DB_HOST     = os.getenv("DB_HOST")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME     = os.getenv("RENTABILIDAD_DB_NAME", "publicaciones_ml_contabilidad")
DB_SSL      = os.getenv("DB_SSL", "false").lower() == "true"

# Mapeo columnas Excel → columnas BD
COLUMN_MAP = {
    "ID publicaciones":          "id_publicaciones",
    "Titulo":                    "titulo",
    "Precio venta historico ":   "precio_venta_historico",
    "Costo inicial":             "costo_inicial",
    "Cargo por venta ML":        "cargo_por_venta_ml",
    "Precio venta real":         "precio_venta_real",
    "Rete fuente":               "rete_fuente",
    "ICA":                       "ica",
    "Tipo de publicación":  "tipo_de_publicacion",
    "Costos financieros":        "costos_financieros",
    "Otros costos":              "otros_costos",
    "Costo Envio ":              "costo_envio",
    "Costo publicidad":          "costo_publicidad",
    "Costo total":               "costo_total",
    "Precio de venta ideal":     "precio_de_venta_ideal",
    "Utilidad Sepia":            "utilidad_sepia",
}

# =============================================================================
# LECTURA DEL EXCEL
# =============================================================================

print(f"Leyendo: {EXCEL_PATH}")
if not EXCEL_PATH.exists():
    print(f"ERROR: No se encontro el archivo en {EXCEL_PATH}")
    sys.exit(1)

df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME, dtype=str)

# Limpiar espacios en nombres de columna
df.columns = df.columns.str.strip()

# Mapear columnas al nombre de la BD
df = df.rename(columns=COLUMN_MAP)

# Quedarse solo con las columnas que existen en el mapa
cols_validas = [c for c in COLUMN_MAP.values() if c in df.columns]
df = df[cols_validas]

# Eliminar filas donde id_publicaciones este vacio
df = df[df["id_publicaciones"].notna() & (df["id_publicaciones"].str.strip() != "")]
df["id_publicaciones"] = df["id_publicaciones"].str.strip()

# Columnas enteras → pandas nullable Int64 (maneja NaN→NULL sin floats)
int_cols = [
    "precio_venta_historico", "costo_inicial", "precio_venta_real",
    "costos_financieros", "otros_costos", "costo_envio", "costo_publicidad",
]
# Columnas decimales → float64
float_cols = [
    "cargo_por_venta_ml", "rete_fuente", "ica",
    "costo_total", "precio_de_venta_ideal", "utilidad_sepia",
]

for col in int_cols:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce").round().astype("Int64")

for col in float_cols:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")  # float64, NaN → NULL

for col in ["titulo", "tipo_de_publicacion"]:
    if col in df.columns:
        df[col] = df[col].where(df[col].notna() & (df[col].str.strip() != ""), other=None)

print(f"Filas validas en Excel: {len(df)}")
print(f"Columnas: {list(df.columns)}")

# =============================================================================
# CONEXION A NEON
# =============================================================================

ssl_args = "?sslmode=require" if DB_SSL else ""
conn_str = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}{ssl_args}"

print(f"\nConectando a Neon ({DB_NAME})...")
engine = create_engine(conn_str, pool_pre_ping=True)

# =============================================================================
# CARGA: TRUNCATE + INSERT
# =============================================================================

# Contar filas actuales y truncar
with engine.begin() as conn:
    filas_antes = conn.execute(text("SELECT COUNT(*) FROM publicaciones_rentabilidad")).scalar()
    print(f"Filas en BD antes: {filas_antes}")
    conn.execute(text("TRUNCATE TABLE publicaciones_rentabilidad"))
    print("Tabla vaciada.")

# Insertar usando to_sql (maneja tipos Int64/float64 → INTEGER/NUMERIC correctamente)
df.to_sql(
    "publicaciones_rentabilidad",
    engine,
    if_exists="append",
    index=False,
    method="multi",
    chunksize=50,
)

# Verificar resultado
with engine.connect() as conn:
    filas_despues = conn.execute(text("SELECT COUNT(*) FROM publicaciones_rentabilidad")).scalar()

print(f"\nFilas en BD despues: {filas_despues}")
print(f"Diferencia: +{filas_despues - filas_antes} filas")
print("\nActualizacion completada exitosamente.")
