"""
Calcula la serie MENSUAL de ventas Meta Ads desde los datos crudos y la emite como JSON.

Fuente (igual que las tablas dinámicas del Excel):
  - Hoja "Datos clientes": cada venta (Total, Costo producto, Estado, Año, Mes).
      ventas_brutas = suma de Total           (todas las filas del mes)
      costo_producto = suma de Costo producto (todas las filas del mes)
      devoluciones   = suma de Total con Estado "Devolución"
  - Hoja "Data publicidad": gasto_publicidad = suma de Pago por mes.

Derivados (modelo de Santiago):
  ventas_netas = brutas - devoluciones
  utilidad_neta = brutas - devoluciones - costo_producto - gasto_publicidad
  roas = utilidad / publicidad ; roi% = utilidad / (costo+publicidad) ; margen% = utilidad / brutas

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
SHEET_VENTAS = "Datos clientes"
SHEET_PUBLICIDAD = "Data publicidad"

MES_NOMBRE = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
    7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}


def normalize_col(value: Any) -> str:
    text = str(value or "").strip()
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace("&", " y ")
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def month_to_number(value: Any) -> int | None:
    if value is None:
        return None
    # Numérico directo (1-12)
    try:
        n = int(float(value))
        if 1 <= n <= 12:
            return n
    except (TypeError, ValueError):
        pass
    text = normalize_col(value)
    mapping = {
        "ene": 1, "enero": 1, "feb": 2, "febrero": 2, "mar": 3, "marzo": 3,
        "abr": 4, "abril": 4, "abri": 4, "may": 5, "mayo": 5, "jun": 6, "junio": 6,
        "jul": 7, "julio": 7, "ago": 8, "agosto": 8, "sep": 9, "sept": 9, "septiembre": 9,
        "oct": 10, "octubre": 10, "nov": 11, "noviembre": 11, "dic": 12, "diciembre": 12,
    }
    return mapping.get(text)


def num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def safe_div(a: float, b: float) -> float:
    return a / b if b else 0.0


def parse(path: Path) -> list[dict[str, Any]]:
    # --- Ventas y costo desde "Datos clientes" ---
    dc = pd.read_excel(path, sheet_name=SHEET_VENTAS, header=0)
    dc.columns = [normalize_col(c) for c in dc.columns]
    for col in ("ano", "mes", "total", "costo_producto"):
        if col not in dc.columns:
            raise ValueError(f"Falta la columna '{col}' en la hoja '{SHEET_VENTAS}'")
        dc[col] = num(dc[col])
    estado = dc.get("estado_del_envio", pd.Series([""] * len(dc))).astype(str).str.lower()
    dc["_es_dev"] = estado.str.contains("devoluc", na=False)
    dc = dc.dropna(subset=["ano", "mes"])
    dc["ano"] = dc["ano"].astype(int)
    dc["mes"] = dc["mes"].astype(int)

    ventas = {}
    for (anio, mes), g in dc.groupby(["ano", "mes"]):
        ventas[(anio, mes)] = {
            "ventas_brutas": float(g["total"].sum()),
            "costo_producto": float(g["costo_producto"].sum()),
            "devoluciones": float(g.loc[g["_es_dev"], "total"].sum()),
        }

    # --- Gasto de publicidad desde "Data publicidad" ---
    pub_por_mes: dict[tuple[int, int], float] = {}
    try:
        pub = pd.read_excel(path, sheet_name=SHEET_PUBLICIDAD, header=0)
        pub.columns = [normalize_col(c) for c in pub.columns]
        pub["pago"] = num(pub["pago"])
        pub["_anio"] = num(pub["ano"]).astype("Int64")
        pub["_mes"] = pub["mes"].apply(month_to_number)
        pub = pub.dropna(subset=["_anio", "_mes"])
        for (anio, mes), g in pub.groupby(["_anio", "_mes"]):
            pub_por_mes[(int(anio), int(mes))] = float(g["pago"].sum())
    except Exception:
        pub_por_mes = {}

    # --- Combinar y derivar ---
    rows = []
    for (anio, mes) in sorted(ventas.keys()):
        anio, mes = int(anio), int(mes)
        v = ventas[(anio, mes)]
        brutas = v["ventas_brutas"]
        devol = v["devoluciones"]
        costo = v["costo_producto"]
        pub_gasto = pub_por_mes.get((anio, mes), 0.0)
        netas = brutas - devol
        utilidad = brutas - devol - costo - pub_gasto
        rows.append({
            "periodo": date(anio, mes, 1).isoformat(),
            "anio": anio,
            "num_mes": mes,
            "mes": MES_NOMBRE.get(mes, str(mes)),
            "ventas_brutas": round(brutas, 2),
            "devoluciones": round(devol, 2),
            "ventas_netas": round(netas, 2),
            "gasto_publicidad": round(pub_gasto, 2),
            "costo_producto": round(costo, 2),
            "utilidad_neta": round(utilidad, 2),
            "roas": round(safe_div(utilidad, pub_gasto), 4),
            "roi_pct": round(safe_div(utilidad, costo + pub_gasto) * 100, 4),
            "margen_neto_pct": round(safe_div(utilidad, brutas) * 100, 4),
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", default=str(DEFAULT_EXCEL_PATH))
    args = parser.parse_args()

    path = Path(args.path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"No se encontró el archivo Excel: {path}")

    rows = parse(path)
    payload = {
        "metadata": {
            "sourcePath": str(path),
            "fileName": path.name,
            "sheets": [SHEET_VENTAS, SHEET_PUBLICIDAD],
            "lastModified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            "rowCount": len(rows),
        },
        "rows": rows,
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
