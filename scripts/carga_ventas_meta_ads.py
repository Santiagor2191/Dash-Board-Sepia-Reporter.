"""
Extrae la serie mensual de Meta Ads del Excel y la emite como JSON.

Uso:
    python scripts/carga_ventas_meta_ads.py
    python scripts/carga_ventas_meta_ads.py --path "C:\\ruta\\archivo.xlsx"
"""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd

DEFAULT_EXCEL_PATH = Path(
    r"C:\Users\SANTIAGO\OneDrive - uniminuto.edu\Escritorio\Datos Clientes Y Contabilidad.xlsx"
)
DEFAULT_SHEET = "Análisis Ventas & Publicidad"


def normalize_col(value: Any) -> str:
    text = str(value or "").strip()
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace("&", " y ")
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def month_to_number(value: Any) -> int | None:
    text = normalize_col(value)
    mapping = {
        "ene": 1,
        "enero": 1,
        "feb": 2,
        "febrero": 2,
        "mar": 3,
        "marzo": 3,
        "abr": 4,
        "abril": 4,
        "abri": 4,
        "may": 5,
        "mayo": 5,
        "jun": 6,
        "junio": 6,
        "jul": 7,
        "julio": 7,
        "ago": 8,
        "agosto": 8,
        "sep": 9,
        "sept": 9,
        "septiembre": 9,
        "oct": 10,
        "octubre": 10,
        "nov": 11,
        "noviembre": 11,
        "dic": 12,
        "diciembre": 12,
    }
    return mapping.get(text)


def to_number(value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return None
        return int(value) if value.is_integer() else float(value)
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(parsed):
        return None
    return int(parsed) if parsed.is_integer() else parsed


def parse_sheet(path: Path, sheet_name: str) -> list[dict[str, Any]]:
    df = pd.read_excel(path, sheet_name=sheet_name, header=3)
    df.columns = [normalize_col(col) for col in df.columns]

    expected = {
        "ano": "anio",
        "mes": "mes",
        "ventas_brutas": "ventas_brutas",
        "devoluciones": "devoluciones",
        "ventas_netas": "ventas_netas",
        "gasto_publicidad": "gasto_publicidad",
        "costo_producto": "costo_producto",
        "utilidad_neta": "utilidad_neta",
        "roas": "roas",
        "roi": "roi_pct",
        "margen_neto": "margen_neto_pct",
    }

    missing = [col for col in expected if col not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas esperadas en hoja '{sheet_name}': {missing}")

    df = df[list(expected.keys())].rename(columns=expected).copy()
    df = df.dropna(how="all")

    df["anio"] = pd.to_numeric(df["anio"], errors="coerce")
    df["mes"] = df["mes"].astype(str).str.strip()
    df["num_mes"] = df["mes"].apply(month_to_number)

    numeric_cols = [
        "ventas_brutas",
        "devoluciones",
        "ventas_netas",
        "gasto_publicidad",
        "costo_producto",
        "utilidad_neta",
        "roas",
        "roi_pct",
        "margen_neto_pct",
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["anio", "num_mes", "ventas_netas"])
    df["anio"] = df["anio"].astype(int)
    df["num_mes"] = df["num_mes"].astype(int)
    df["periodo"] = pd.to_datetime(
        {"year": df["anio"], "month": df["num_mes"], "day": 1},
        errors="coerce",
    ).dt.date
    df = df.dropna(subset=["periodo"])

    rows = []
    for item in df.sort_values(["anio", "num_mes"]).to_dict(orient="records"):
        rows.append(
            {
                "periodo": item["periodo"].isoformat() if isinstance(item["periodo"], date) else None,
                "anio": int(item["anio"]),
                "num_mes": int(item["num_mes"]),
                "mes": str(item["mes"]).strip(),
                "ventas_brutas": float(item["ventas_brutas"] or 0),
                "devoluciones": float(item["devoluciones"] or 0),
                "ventas_netas": float(item["ventas_netas"] or 0),
                "gasto_publicidad": float(item["gasto_publicidad"] or 0),
                "costo_producto": float(item["costo_producto"] or 0),
                "utilidad_neta": float(item["utilidad_neta"] or 0),
                "roas": float(item["roas"] or 0),
                "roi_pct": float(item["roi_pct"] or 0),
                "margen_neto_pct": float(item["margen_neto_pct"] or 0),
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", default=str(DEFAULT_EXCEL_PATH))
    parser.add_argument("--sheet", default=DEFAULT_SHEET)
    args = parser.parse_args()

    path = Path(args.path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"No se encontró el archivo Excel: {path}")

    rows = parse_sheet(path, args.sheet)
    payload = {
        "metadata": {
            "sourcePath": str(path),
            "fileName": path.name,
            "sheetName": args.sheet,
            "lastModified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            "rowCount": len(rows),
        },
        "rows": rows,
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
