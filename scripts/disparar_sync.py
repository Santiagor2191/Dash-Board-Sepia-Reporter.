"""
disparar_sync.py
================
Dispara una sincronizacion manual via HTTP usando las credenciales del .env.
Loguea al dashboard, captura la cookie de sesion, y hace POST /admin/sync-ahora.

Util para probar el sync sin tener que pelear con CORS/cookies del navegador.
"""

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / "sepia meli api" / ".env")

BASE = os.getenv("DASHBOARD_BASE_URL", "http://127.0.0.1:3000")
PWD = os.getenv("DASHBOARD_ADMIN_PASSWORD", "")

if not PWD:
    print("ERROR: DASHBOARD_ADMIN_PASSWORD no esta definido en sepia meli api/.env")
    sys.exit(1)


def post_json(url, body, headers=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = Request(url, data=data, headers=h, method="POST")
    return urlopen(req, timeout=120)


# -----------------------------------------------------------------------------
# 1. Login al dashboard
# -----------------------------------------------------------------------------
print(f"-> Login en {BASE}/auth/session/login ...")
try:
    res = post_json(f"{BASE}/auth/session/login", {"password": PWD})
except HTTPError as e:
    print(f"   FALLO login: {e.code}")
    try:
        print(f"   {e.read().decode()}")
    except Exception:
        pass
    sys.exit(1)
except URLError as e:
    print(f"   No se puede conectar al backend: {e.reason}")
    print("   Verifica que el backend este corriendo en", BASE)
    sys.exit(1)

# Extraemos la cookie de sesion del header Set-Cookie
raw_set_cookie = res.headers.get_all("Set-Cookie") or []
session_cookie = None
for line in raw_set_cookie:
    # Formato: "sepia_session=ABC123; Path=/; HttpOnly; SameSite=Lax"
    cookie_kv = line.split(";")[0].strip()
    if cookie_kv:
        session_cookie = cookie_kv
        break

if not session_cookie:
    print("   ADVERTENCIA: no se recibio cookie de sesion (status: %s)" % res.status)
    print("   Body:", res.read().decode())
    sys.exit(1)

print(f"   Login OK (cookie: {session_cookie.split('=')[0]}=...)")

# -----------------------------------------------------------------------------
# 2. Disparar sync
# -----------------------------------------------------------------------------
print(f"\n-> POST {BASE}/admin/sync-ahora ...")
try:
    res = post_json(
        f"{BASE}/admin/sync-ahora",
        None,
        headers={"Cookie": session_cookie},
    )
    payload = json.loads(res.read())
    print("   Respuesta del backend:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
except HTTPError as e:
    print(f"   FALLO sync: HTTP {e.code}")
    try:
        body = e.read().decode()
        print(f"   {body}")
    except Exception:
        pass
    sys.exit(1)
