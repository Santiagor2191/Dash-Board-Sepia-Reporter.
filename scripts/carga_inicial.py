"""
carga_inicial.py
================
Carga inicial del histórico de ventas desde Excel a MySQL.
Lee mercado_libre_oficial.xlsx y lo inserta en la tabla ventas_ml.

Uso:
    python scripts/carga_inicial.py
"""

import hashlib
import os
import re
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv

# Cargar variables (.env del backend)
env_path = Path(__file__).resolve().parents[1] / "sepia meli api" / ".env"
load_dotenv(dotenv_path=env_path)

# =============================================================================
# CONFIGURACIÓN
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXCEL_PATH = PROJECT_ROOT / "data" / "Historico" / "mercado_libre_oficial.xlsx"

ARCHIVO_EXCEL = Path(os.getenv("SEPIA_EXCEL_SOURCE_PATH", str(DEFAULT_EXCEL_PATH)))
HOJA = os.getenv("SEPIA_EXCEL_SHEET", "Ventas_Unificadas")

USUARIO = os.getenv("DB_USER", "postgres")
PASSWORD = os.getenv("DB_PASSWORD", "")
HOST = os.getenv("DB_HOST", "127.0.0.1")
PUERTO = int(os.getenv("DB_PORT", "5432"))
BASE_DATOS = os.getenv("DB_NAME", "mercado_libre_oficial")
TABLA = os.getenv("DB_TABLE", "ventas_ml")

if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", TABLA):
    raise ValueError(f"Nombre de tabla invalido: {TABLA}")

ENGINE = create_engine(
    URL.create(
        "postgresql+psycopg2",
        username=USUARIO,
        password=PASSWORD,
        host=HOST,
        port=PUERTO,
        database=BASE_DATOS,
    )
)

if not ARCHIVO_EXCEL.exists():
    raise FileNotFoundError(
        f"No se encontró el archivo Excel esperado: {ARCHIVO_EXCEL}"
    )

# =============================================================================
# 1. LEER EXCEL
# =============================================================================

print(f"Leyendo {ARCHIVO_EXCEL.name} ...")
df = pd.read_excel(ARCHIVO_EXCEL, sheet_name=HOJA)
print(f"  Filas leídas: {len(df)}")

# =============================================================================
# 2. LIMPIAR NOMBRES DE COLUMNAS
# =============================================================================

df.columns = (
    df.columns.astype(str)
    .str.strip()
    .str.lower()
    .str.replace(" ", "_", regex=False)
    .str.replace("á", "a", regex=False)
    .str.replace("é", "e", regex=False)
    .str.replace("í", "i", regex=False)
    .str.replace("ó", "o", regex=False)
    .str.replace("ú", "u", regex=False)
    .str.replace("ñ", "n", regex=False)
    .str.replace("(", "", regex=False)
    .str.replace(")", "", regex=False)
)

RENOMBRES = {
    "año": "anio",
    "numero_de_venta": "numero_venta",
    "numero_venta/orden": "numero_venta",
    "variantetalla": "variante_talla",
    "variante": "variante_talla",
    "ingresos_por_productos_cop": "ingresos_productos_cop",
    "cargo_por_venta_e_impuestos_cop": "cargo_venta_impuestos_cop",
    "ingresos_por_envio_cop": "ingresos_envio_cop",
    "costos_de_envio_cop": "costos_envio_cop",
    "anulaciones_y_reembolsos_cop": "anulaciones_reembolsos_cop",
    "precio_unitario_de_la_publicacion_cop": "precio_unitario_publicacion_cop",
    "forma_de_entrega": "forma_entrega",
}
df = df.rename(columns=RENOMBRES)

# =============================================================================
# 3. ASEGURAR COLUMNAS ESPERADAS
# =============================================================================

COLUMNAS_DATOS = [
    "anio", "mes", "num_mes", "dia", "fecha", "numero_venta", "estado",
    "producto", "categoria", "variante_talla", "cantidad",
    "monto_reportado_cop", "ingresos_productos_cop",
    "cargo_venta_impuestos_cop", "ingresos_envio_cop", "costos_envio_cop",
    "anulaciones_reembolsos_cop", "sku", "publicacion_id",
    "precio_unitario_publicacion_cop", "comprador", "ciudad", "forma_entrega",
]

for col in COLUMNAS_DATOS:
    if col not in df.columns:
        df[col] = None

df = df[COLUMNAS_DATOS].copy()

# =============================================================================
# 4. ELIMINAR FILAS TOTALMENTE VACÍAS
# =============================================================================

antes = len(df)
df = df.dropna(how="all")
if len(df) < antes:
    print(f"  Filas vacías eliminadas: {antes - len(df)}")

# Filas de paquetes MeLi: producto vacío pero estado dice "Paquete de N productos"
mask_paquete = df["producto"].isna() & df["estado"].str.contains("Paquete", case=False, na=False)
df.loc[mask_paquete, "producto"] = df.loc[mask_paquete, "estado"]
paquetes = mask_paquete.sum()
if paquetes:
    print(f"  Paquetes MeLi etiquetados: {paquetes}")

# =============================================================================
# 5. TIPOS DE DATOS
# =============================================================================

# Fecha — dayfirst=True para formato colombiano DD/MM/YYYY
df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce", dayfirst=True)

# Completar anio/mes/num_mes/dia a partir de fecha cuando falten
df["anio"] = df["anio"].fillna(df["fecha"].dt.year)
df["num_mes"] = df["num_mes"].fillna(df["fecha"].dt.month)
df["dia"] = df["dia"].fillna(df["fecha"].dt.day)

# Columnas numéricas
COLS_NUMERICAS = [
    "anio", "num_mes", "dia", "cantidad",
    "monto_reportado_cop", "ingresos_productos_cop",
    "cargo_venta_impuestos_cop", "ingresos_envio_cop",
    "costos_envio_cop", "anulaciones_reembolsos_cop",
    "precio_unitario_publicacion_cop",
]
for col in COLS_NUMERICAS:
    df[col] = pd.to_numeric(df[col], errors="coerce")

# Enteros donde corresponda (sin decimales)
for col in ["anio", "num_mes", "dia", "cantidad"]:
    df[col] = df[col].astype("Int64")  # nullable integer

# numero_venta: convertir float a string limpio (sin notación científica)
df["numero_venta"] = df["numero_venta"].apply(
    lambda x: str(int(x)) if pd.notna(x) else None
)

# sku: igual tratamiento
df["sku"] = df["sku"].apply(
    lambda x: str(int(x)) if pd.notna(x) and isinstance(x, float) else
              (str(x).strip() if pd.notna(x) else None)
)

# =============================================================================
# 6. GENERAR ID ÚNICO
# =============================================================================
# Para la carga inicial histórica, incluimos el índice de fila (row.name)
# en TODOS los registros. Esto garantiza que cada fila del Excel genera un
# id_unico diferente, incluso si los datos son idénticos.
# Esto es correcto para la carga inicial porque cada fila del Excel
# representa una transacción real que queremos preservar.


def generar_id_unico(row):
    """Genera un hash SHA-256 único por fila para la carga inicial."""
    anio = row["anio"]
    nv = row["numero_venta"]
    numero_venta = str(nv) if pd.notna(nv) and nv is not None else ""

    if pd.notna(anio) and int(anio) >= 2025 and numero_venta:
        prefijo = "oficial"
    else:
        prefijo = "manual"

    # Incluir row.name (índice de fila del DataFrame) para garantizar
    # unicidad absoluta en la carga inicial
    partes = [
        prefijo,
        str(row.name),
        numero_venta,
        str(row["fecha"]),
        str(row["producto"]).strip() if pd.notna(row["producto"]) else "",
        str(row["variante_talla"]).strip() if pd.notna(row["variante_talla"]) else "",
        str(row["estado"]).strip() if pd.notna(row["estado"]) else "",
        str(row["cantidad"]) if pd.notna(row["cantidad"]) else "",
        str(row["monto_reportado_cop"]) if pd.notna(row["monto_reportado_cop"]) else "",
    ]

    base = "|".join(partes)
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


df["id_unico"] = df.apply(generar_id_unico, axis=1)

# Verificar que no hay duplicados internos
duplicados = df["id_unico"].duplicated().sum()
if duplicados > 0:
    print(f"  ADVERTENCIA: {duplicados} id_unico duplicados internos (no debería pasar)")
else:
    print("  id_unico: sin duplicados internos")

# =============================================================================
# 7. COLUMNAS DE CONTROL
# =============================================================================

df["origen_dato"] = df["anio"].apply(
    lambda a: "manual_historico" if pd.notna(a) and int(a) <= 2024 else "mercadolibre_oficial"
)

df["calidad_dato"] = df["anio"].apply(
    lambda a: "media" if pd.notna(a) and int(a) <= 2024 else "alta"
)

df["periodo_incompleto"] = df["anio"].apply(
    lambda a: pd.notna(a) and int(a) == 2024
)

df["archivo_origen"] = ARCHIVO_EXCEL.name

# =============================================================================
# 8. PREPARAR PARA INSERCIÓN
# =============================================================================

# Orden final de columnas (sin 'id' ni 'fecha_carga', los genera MySQL)
COLUMNAS_FINALES = (
    ["id_unico"] + COLUMNAS_DATOS +
    ["origen_dato", "calidad_dato", "periodo_incompleto", "archivo_origen"]
)
df = df[COLUMNAS_FINALES]

# Convertir fecha a date (sin hora)
df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce").dt.date

# Reemplazar NaN/NaT por None para MySQL
df = df.where(df.notna(), None)

# periodo_incompleto: asegurar booleano
df["periodo_incompleto"] = df["periodo_incompleto"].apply(
    lambda x: bool(x) if x is not None else False
)

# =============================================================================
# 9. VACIAR TABLA E INSERTAR EN BLOQUE
# =============================================================================

print(f"\nVaciando tabla {TABLA} ...")
with ENGINE.begin() as conn:
    conn.execute(text(f"DROP TABLE IF EXISTS {TABLA} CASCADE"))
    conn.execute(text(f"""
        CREATE TABLE {TABLA} (
            id SERIAL PRIMARY KEY,
            id_unico VARCHAR(255) UNIQUE NOT NULL,
            anio INTEGER,
            mes TEXT,
            num_mes INTEGER,
            dia INTEGER,
            fecha DATE,
            numero_venta TEXT,
            estado TEXT,
            producto TEXT,
            categoria TEXT,
            variante_talla TEXT,
            cantidad INTEGER,
            monto_reportado_cop NUMERIC,
            ingresos_productos_cop NUMERIC,
            cargo_venta_impuestos_cop NUMERIC,
            ingresos_envio_cop NUMERIC,
            costos_envio_cop NUMERIC,
            anulaciones_reembolsos_cop NUMERIC,
            sku TEXT,
            publicacion_id TEXT,
            precio_unitario_publicacion_cop NUMERIC,
            comprador TEXT,
            ciudad TEXT,
            forma_entrega TEXT,
            origen_dato TEXT,
            calidad_dato TEXT,
            periodo_incompleto BOOLEAN,
            archivo_origen TEXT,
            fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            order_item_id TEXT,
            meli_order_id TEXT,
            fecha_ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    # Indices usados por el sync incremental desde la API de MeLi
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_ventas_ml_numero_venta ON {TABLA} (numero_venta)"))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_ventas_ml_origen_dato ON {TABLA} (origen_dato)"))
    # Tabla de auditoria del sync (se conserva entre cargas de Excel)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS sync_log (
            id SERIAL PRIMARY KEY,
            inicio TIMESTAMP NOT NULL,
            fin TIMESTAMP,
            duracion_ms INTEGER,
            rango_desde DATE,
            rango_hasta DATE,
            ordenes_procesadas INTEGER DEFAULT 0,
            ordenes_nuevas INTEGER DEFAULT 0,
            ordenes_actualizadas INTEGER DEFAULT 0,
            errores INTEGER DEFAULT 0,
            mensaje TEXT,
            estado TEXT NOT NULL DEFAULT 'en_curso'
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sync_log_inicio ON sync_log (inicio DESC)"))
    conn.execute(text(f"TRUNCATE TABLE {TABLA} RESTART IDENTITY CASCADE"))
print("  Tabla preparada y vaciada.")

print(f"Insertando {len(df)} filas ...")
# Inserción en bloques de 500 filas (rápido y seguro)
BATCH_SIZE = 500
insertados = 0

for inicio in range(0, len(df), BATCH_SIZE):
    bloque = df.iloc[inicio:inicio + BATCH_SIZE]
    with ENGINE.begin() as conn:
        bloque.to_sql(TABLA, con=conn, if_exists="append", index=False)
    insertados += len(bloque)
    if insertados % 2000 == 0 or insertados == len(df):
        print(f"  {insertados}/{len(df)} insertados ...")

# =============================================================================
# 10. RESUMEN FINAL
# =============================================================================

print("\n" + "=" * 50)
print("RESUMEN DE CARGA")
print("=" * 50)
print(f"Total filas Excel:     {len(df)}")
print(f"Total insertados:      {insertados}")

with ENGINE.connect() as conn:
    total_mysql = pd.read_sql(text(f"SELECT COUNT(*) AS total FROM {TABLA}"), conn)
    print(f"Total en MySQL:        {total_mysql.iloc[0, 0]}")

    por_anio = pd.read_sql(
        text(f"SELECT anio, COUNT(*) AS filas FROM {TABLA} GROUP BY anio ORDER BY anio"),
        conn,
    )
    print("\nFilas por año:")
    for _, r in por_anio.iterrows():
        print(f"  {int(r['anio']):>6}: {r['filas']:>6} filas")

print("\nCarga inicial completada exitosamente.")
