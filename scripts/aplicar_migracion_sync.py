"""
aplicar_migracion_sync.py
=========================
Aplica la migracion migracion_sync_api.sql usando las credenciales del .env
del backend. Es idempotente: se puede correr varias veces sin riesgo.

Uso:
    python scripts/aplicar_migracion_sync.py
"""

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv

# =============================================================================
# CONFIGURACION
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]
env_path = PROJECT_ROOT / "sepia meli api" / ".env"
load_dotenv(dotenv_path=env_path)

_sql_arg = sys.argv[1] if len(sys.argv) > 1 else None
MIGRACION_SQL = Path(_sql_arg).resolve() if _sql_arg else PROJECT_ROOT / "scripts" / "migracion_sync_api.sql"

USUARIO = os.getenv("DB_USER", "postgres")
PASSWORD = os.getenv("DB_PASSWORD", "")
HOST = os.getenv("DB_HOST", "127.0.0.1")
PUERTO = int(os.getenv("DB_PORT", "5432"))
BASE_DATOS = os.getenv("DB_NAME", "mercado_libre_oficial")

if not MIGRACION_SQL.exists():
    print(f"ERROR: No se encontro el archivo {MIGRACION_SQL}")
    sys.exit(1)

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

# =============================================================================
# EJECUCION
# =============================================================================

print(f"Aplicando migracion en {HOST}:{PUERTO}/{BASE_DATOS} ...")
print(f"  Archivo: {MIGRACION_SQL.name}")
print()

# Leemos el SQL y removemos las directivas \echo (son de psql, no de SQLAlchemy)
sql_completo = MIGRACION_SQL.read_text(encoding="utf-8")
lineas_sql = [
    linea for linea in sql_completo.splitlines()
    if not linea.strip().startswith("\\echo")
]
sql_limpio = "\n".join(lineas_sql)

# Separamos el bloque DDL (transaccional) de las consultas de verificacion.
# La marca es el primer "COMMIT;" del archivo.
partes = sql_limpio.split("COMMIT;", 1)
bloque_ddl = partes[0] + "COMMIT;"
bloque_verif = partes[1] if len(partes) > 1 else ""

# 1) Ejecutar la migracion (DDL transaccional)
with ENGINE.connect() as conn:
    conn.execute(text("SET client_min_messages = WARNING"))
    # SQLAlchemy gestiona la transaccion; ejecutamos cada sentencia DDL
    # individualmente para que ADD COLUMN IF NOT EXISTS no falle si la
    # columna ya existe.
    sentencias = [s.strip() for s in bloque_ddl.split(";") if s.strip()]
    for s in sentencias:
        if s.upper() in ("BEGIN", "COMMIT"):
            continue
        try:
            conn.execute(text(s))
            conn.commit()
            preview = s.split("\n")[0][:70]
            print(f"  OK  {preview}...")
        except Exception as e:
            conn.rollback()
            print(f"  ERR {s[:70]}...")
            print(f"      {e}")
            raise

# 2) Verificacion (lee y muestra estado)
print()
print("=" * 60)
print("VERIFICACION POST-MIGRACION")
print("=" * 60)

with ENGINE.connect() as conn:
    print("\n--- Columnas nuevas en ventas_ml ---")
    rows = conn.execute(text("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'ventas_ml'
          AND column_name IN ('id_unico', 'numero_venta', 'order_item_id',
                              'origen_dato', 'calidad_dato',
                              'fecha_carga', 'fecha_ultima_actualizacion')
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:<35} {r[1]:<15} nullable={r[2]}")

    print("\n--- Indices en ventas_ml ---")
    rows = conn.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'ventas_ml' ORDER BY indexname"
    )).fetchall()
    for r in rows:
        print(f"  {r[0]}")

    existe = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'sync_log'
        )
    """)).scalar()
    print(f"\n--- Tabla sync_log existe: {existe}")

    marcadas = conn.execute(text(
        "SELECT COUNT(*) FROM ventas_ml WHERE fecha_ultima_actualizacion IS NOT NULL"
    )).scalar()
    total = conn.execute(text("SELECT COUNT(*) FROM ventas_ml")).scalar()
    print(f"\n--- Filas con fecha_ultima_actualizacion seteada: {marcadas} / {total}")

print("\nMigracion completada exitosamente.")
