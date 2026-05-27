"""
correr_reconciliacion.py
========================
Llama al endpoint /admin/reconciliacion del backend, que compara las ordenes
que devuelve MeLi (API) contra las filas que tienes en ventas_ml (Excel oficial)
en un rango de fechas. NO modifica la base.

Uso:
    python scripts/correr_reconciliacion.py 2026-03-01 2026-04-30

Si se omiten fechas, usa por defecto marzo-abril 2026.
"""

import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / "sepia meli api" / ".env")

BASE = os.getenv("DASHBOARD_BASE_URL", "http://127.0.0.1:3000")
PWD = os.getenv("DASHBOARD_ADMIN_PASSWORD", "")

if not PWD:
    print("ERROR: DASHBOARD_ADMIN_PASSWORD no esta en .env")
    sys.exit(1)


def parse_date_arg(arg, default):
    if arg and re.fullmatch(r"\d{4}-\d{2}-\d{2}", arg):
        return arg
    return default


FROM = parse_date_arg(sys.argv[1] if len(sys.argv) > 1 else None, "2026-03-01")
TO = parse_date_arg(sys.argv[2] if len(sys.argv) > 2 else None, "2026-04-30")


def login():
    body = json.dumps({"password": PWD}).encode("utf-8")
    req = Request(
        f"{BASE}/auth/session/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        res = urlopen(req, timeout=30)
    except HTTPError as e:
        print(f"FALLO login: HTTP {e.code} - {e.read().decode(errors='replace')}")
        sys.exit(1)
    except URLError as e:
        print(f"No se puede conectar al backend en {BASE}: {e.reason}")
        sys.exit(1)

    for line in res.headers.get_all("Set-Cookie") or []:
        kv = line.split(";")[0].strip()
        if kv:
            return kv
    print("ERROR: backend respondio sin Set-Cookie")
    sys.exit(1)


def get_reconciliacion(cookie):
    url = f"{BASE}/admin/reconciliacion?{urlencode({'from': FROM, 'to': TO})}"
    req = Request(url, headers={"Cookie": cookie})
    try:
        res = urlopen(req, timeout=300)
        return json.loads(res.read())
    except HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"FALLO reconciliacion: HTTP {e.code}")
        print(body)
        sys.exit(1)


# -----------------------------------------------------------------------------
# Ejecutar
# -----------------------------------------------------------------------------
print(f"-> Login en {BASE} ...")
cookie = login()
print(f"   OK\n")

print(f"-> GET /admin/reconciliacion?from={FROM}&to={TO} ...")
print("   (esto puede tardar 30-90 segundos segun cuantas ordenes haya)\n")
reporte = get_reconciliacion(cookie)

# -----------------------------------------------------------------------------
# Formatear reporte humano
# -----------------------------------------------------------------------------
c = reporte.get("conteos", {})
t = reporte.get("tasas", {})
tot = reporte.get("totales", {})

print("=" * 78)
print(f"RECONCILIACION API MeLi  vs  EXCEL OFICIAL")
print(f"Rango: {FROM} -> {TO}")
print("=" * 78)

print("\n--- CONTEOS DE ORDENES ---")
print(f"  Total en API MeLi:           {c.get('api', 0):>6}")
print(f"  Total en Excel oficial:      {c.get('excel', 0):>6}")
print(f"  Coinciden (ambos lados):     {c.get('ambos', 0):>6}")
print(f"  Solo en API (no en Excel):   {c.get('solo_api', 0):>6}")
print(f"  Solo en Excel (no en API):   {c.get('solo_excel', 0):>6}")

print("\n--- CALIDAD DEL MATCH (sobre ordenes en ambos lados) ---")
print(f"  Match perfecto (cantidad + monto):   {c.get('match_perfecto', 0):>6}")
print(f"  Cantidad OK, monto diferente:        {c.get('match_cantidad_ok_monto_diff', 0):>6}")
print(f"  Cantidad diferente:                  {c.get('match_cantidad_diff', 0):>6}")
print(f"  -> % match perfecto:        {t.get('match_perfecto_pct', 0):>6.2f}%")
print(f"  -> % match en cantidad:     {t.get('match_cantidad_pct', 0):>6.2f}%")

print("\n--- TOTALES DEL RANGO ---")
print(f"                          API MeLi          Excel oficial")
print(f"  Unidades vendidas:    {tot.get('api_cantidad', 0):>10}      {tot.get('excel_cantidad', 0):>10}")
print(f"  Revenue (COP):        {tot.get('api_monto_cop', 0):>10,}      {tot.get('excel_monto_cop', 0):>10,}")
print(f"  Diferencia unidades:  {tot.get('diff_cantidad', 0):+d}")
print(f"  Diferencia revenue:   {tot.get('diff_monto_cop', 0):+,} COP  ({tot.get('diff_monto_pct', 0):+.2f}%)")

top = reporte.get("top_discrepancias_monto", [])
if top:
    print("\n--- TOP 10 ORDENES CON MAYOR DIFERENCIA DE MONTO ---")
    print(f"  {'numero_venta':<15} {'fecha':<12} {'api':>10} {'excel':>10} {'diff':>12} {'%':>8}")
    for r in top:
        nv = str(r.get("numero_venta", ""))[:15]
        f = str(r.get("fecha", ""))[:10]
        api_m = r.get("api_monto", 0)
        exc_m = r.get("excel_monto", 0)
        diff = r.get("diff_monto", r.get("diff", 0))
        pct = r.get("diff_pct")
        pct_s = f"{pct:+.2f}%" if isinstance(pct, (int, float)) else "-"
        print(f"  {nv:<15} {f:<12} {api_m:>10,} {exc_m:>10,} {diff:>+12,} {pct_s:>8}")

huerf_api = reporte.get("huerfanas_solo_api", [])
if huerf_api:
    print(f"\n--- HUERFANAS SOLO EN API (primeras 10 de {c.get('solo_api', 0)}) ---")
    for r in huerf_api:
        print(f"  {r.get('numero_venta', '?'):<15} {r.get('fecha', '?'):<12} "
              f"qty={r.get('cantidad', 0)} monto={r.get('monto', 0):,} estado={r.get('estado_meli', '?')}")

huerf_excel = reporte.get("huerfanas_solo_excel", [])
if huerf_excel:
    print(f"\n--- HUERFANAS SOLO EN EXCEL (primeras 10 de {c.get('solo_excel', 0)}) ---")
    for r in huerf_excel:
        print(f"  {r.get('numero_venta', '?'):<15} {r.get('fecha', '?'):<12} "
              f"qty={r.get('cantidad', 0)} monto={r.get('monto', 0):,} estado={r.get('estado_excel', '?')}")

print("\n" + "=" * 78)
print("Lectura del reporte:")
print(" - 'Match perfecto' alto = API y Excel coinciden, datos preliminares confiables.")
print(" - 'Cantidad OK, monto diferente' = ajustes post-venta (descuentos, comisiones).")
print(" - 'Solo en API/Excel' = ordenes que tu Excel o MeLi tardaron en mostrar.")
print("=" * 78)
