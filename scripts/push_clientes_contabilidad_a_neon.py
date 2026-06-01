"""
Robot local: lee el Excel "Datos Clientes Y Contabilidad" (ya sincronizado por
OneDrive en este PC), lo procesa con el extractor de siempre y sube el resultado
(JSON) a la base Neon en la nube. El backend de Render lo lee desde ahi.

Pensado para correr en una Tarea Programada de Windows cada X horas, o a mano.

Configuracion (en scripts/.env, NO se sube a git):
    NEON_DATABASE_URL=postgresql://USUARIO:PASSWORD@HOST/mercado_libre_oficial?sslmode=require
    SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH=C:\\ruta\\a\\Datos Clientes Y Contabilidad.xlsx

Uso:
    python scripts/push_clientes_contabilidad_a_neon.py
    python scripts/push_clientes_contabilidad_a_neon.py --path "C:\\ruta\\archivo.xlsx"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Reutiliza el extractor existente sin duplicar logica.
from extract_clientes_contabilidad import summarize  # noqa: E402

SNAPSHOT_KEY = "clientes_contabilidad"


def normalizar_url(url: str) -> str:
    """Acepta la cadena de Neon tal cual (postgresql://...) y la adapta a SQLAlchemy."""
    url = url.strip()
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    elif url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    if "sslmode=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"
    return url


def main() -> None:
    load_dotenv(SCRIPT_DIR / ".env")
    load_dotenv()  # tambien intenta .env del directorio actual

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--path",
        default=os.getenv("SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH"),
    )
    args = parser.parse_args()

    if not args.path:
        print(
            "ERROR: falta la ruta del Excel. Define SEPIA_CLIENTES_CONTABILIDAD_EXCEL_PATH "
            "en scripts/.env o pasala con --path."
        )
        sys.exit(1)

    excel_path = Path(args.path).expanduser()
    if not excel_path.exists():
        print(f"ERROR: no se encontro el Excel en: {excel_path}")
        sys.exit(1)

    db_url = os.getenv("NEON_DATABASE_URL")
    if not db_url:
        print("ERROR: falta NEON_DATABASE_URL (la cadena de conexion a Neon) en scripts/.env.")
        sys.exit(1)

    print(f"[1/3] Leyendo y procesando Excel: {excel_path}")
    payload = summarize(excel_path)
    payload_json = json.dumps(payload, ensure_ascii=False)
    print(f"      OK ({len(payload_json):,} caracteres de datos extraidos).")

    print("[2/3] Conectando a Neon...")
    engine = create_engine(normalizar_url(db_url), pool_pre_ping=True)

    print("[3/3] Subiendo snapshot a la base...")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS dashboard_snapshots (
                  clave TEXT PRIMARY KEY,
                  payload JSONB NOT NULL,
                  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO dashboard_snapshots (clave, payload, actualizado_en)
                VALUES (:clave, CAST(:payload AS JSONB), now())
                ON CONFLICT (clave) DO UPDATE
                  SET payload = EXCLUDED.payload, actualizado_en = now()
                """
            ),
            {"clave": SNAPSHOT_KEY, "payload": payload_json},
        )

    print("LISTO: datos de clientes y contabilidad actualizados en la nube (Neon).")


if __name__ == "__main__":
    main()
