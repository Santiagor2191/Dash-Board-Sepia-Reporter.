# Scripts auxiliares

Todos viven en `scripts/` y se corren desde la raiz del proyecto:

```powershell
cd "D:\dash board sepia BI"
python scripts/NOMBRE.py
```

Cada script lee las credenciales de `sepia meli api/.env` automaticamente.

---

## Scripts de operacion

### `aplicar_migracion_sync.py`
**Cuando usarlo:** la primera vez (ya se aplico). Tambien si en el futuro
agregamos mas columnas via SQL.

Ejecuta `migracion_sync_api.sql` y al final imprime verificacion del estado
de la base.

```powershell
python scripts/aplicar_migracion_sync.py
```

Es idempotente — se puede correr varias veces sin riesgo.

---

### `disparar_sync.py`
**Cuando usarlo:** para forzar un sync sin esperar al cron, sin necesidad de
abrir el navegador.

Loguea al backend usando `DASHBOARD_ADMIN_PASSWORD` del `.env`, captura la
cookie de sesion y hace `POST /admin/sync-ahora`.

```powershell
python scripts/disparar_sync.py
```

Output esperado:
```
-> Login en http://127.0.0.1:3000/auth/session/login ...
   Login OK (cookie: sepia_dashboard_session=...)

-> POST http://127.0.0.1:3000/admin/sync-ahora ...
   Respuesta del backend:
{
  "ok": true,
  "sync_id": 12,
  "rango_desde": "2026-05-12",
  "rango_hasta": "2026-05-26",
  "ordenes_procesadas": 86,
  "ordenes_nuevas": 0,
  "ordenes_actualizadas": 86,
  "errores": 0,
  "mensaje": "OK: 86 ordenes, 86 lineas (0 nuevas, 86 actualizadas), 0 errores"
}
```

---

### `correr_reconciliacion.py`
**Cuando usarlo:** para validar que tan parecidos son los datos de la API a
los del Excel oficial en un rango especifico.

```powershell
python scripts/correr_reconciliacion.py 2026-03-01 2026-04-30
```

(Si se omiten fechas, usa por defecto marzo-abril 2026.)

Imprime un reporte formateado con:
- Conteos de ordenes en API, Excel, ambos y huerfanas
- Tasas de match (perfecto y por cantidad)
- Totales de unidades y revenue por lado, con diferencia absoluta y porcentual
- Top 10 ordenes con mayor diferencia de monto
- Primeras 10 huerfanas de cada lado

---

## Scripts de verificacion / diagnostico

### `verificar_sync.py`
**Cuando usarlo:** cada vez que quieras saber el estado actual del sync.

```powershell
python scripts/verificar_sync.py
```

Muestra:
- Ultimas 5 corridas en `sync_log` con duracion, rango, conteos y mensaje
- Conteo total de filas en `ventas_ml` por `origen_dato`
- Conteo de filas preliminares agrupado por mes

---

### `diagnostico_excel.py`
**Cuando usarlo:** para entender por que el sync calcula tal o cual fecha
como "ultimo dia oficial".

```powershell
python scripts/diagnostico_excel.py
```

Muestra:
- Fecha de hoy segun PostgreSQL (`CURRENT_DATE`)
- Cual fecha va a usar el sync como cutoff (ignorando futuras)
- Filas del Excel con `fecha > hoy` (datos sospechosos)
- Ultimos 10 dias con ventas oficiales

---

### `verificar_paquetes.py`
**Cuando usarlo:** para descomponer el Excel y entender que parte del revenue
corresponde a paquetes vs ordenes individuales vs filas con monto en blanco.

```powershell
python scripts/verificar_paquetes.py
```

Imprime una tabla con 3 categorias:
- Filas "Paquete de N productos" (resumen, qty=0)
- Filas con monto=0 (probable: items dentro de paquetes)
- Ordenes normales (qty>0, monto>0)

Y compara contra el total que reporto la API en el rango.

---

## Resumen visual

```
┌─────────────────────────────────────────────────────────────────┐
│ APLICAR/MODIFICAR SCHEMA                                        │
│   aplicar_migracion_sync.py  ← una sola vez (ya aplicada)       │
├─────────────────────────────────────────────────────────────────┤
│ OPERAR EL SYNC                                                  │
│   disparar_sync.py           ← forzar sync sin esperar cron     │
├─────────────────────────────────────────────────────────────────┤
│ VERIFICAR ESTADO                                                │
│   verificar_sync.py          ← ver corridas y filas             │
│   diagnostico_excel.py       ← entender cutoff de fechas        │
│   verificar_paquetes.py      ← descomponer revenue del Excel    │
├─────────────────────────────────────────────────────────────────┤
│ ANALIZAR CALIDAD                                                │
│   correr_reconciliacion.py   ← API vs Excel, reporte completo   │
└─────────────────────────────────────────────────────────────────┘
```
