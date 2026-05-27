# Sync MeLi → PostgreSQL

Documentacion del sistema que sincroniza las ordenes en vivo desde la API de
Mercado Libre hacia la base de datos PostgreSQL, sin esperar al Excel oficial
de fin de mes.

**Fecha de implementacion:** 2026-05-25 / 2026-05-26
**Estado:** funcional en local, pendientes documentados en [`06-pendientes.md`](06-pendientes.md)

---

## ¿Que problema resuelve?

Antes de este sistema, los datos de ventas en PostgreSQL **solo se actualizaban
al recargar el Excel oficial** de Mercado Libre (manual, una vez al mes).
Eso significaba que durante el mes en curso, el dashboard y los analisis
historicos no podian responder preguntas como *"¿que se vendio esta semana?"*.

La solucion: un sync horario automatizado que trae las ordenes desde la
API de MeLi y las inserta en la misma tabla `ventas_ml`, marcadas como
**"preliminares"** hasta que llega el Excel oficial y las pisa.

---

## Estructura de la documentacion

| Archivo | Contenido |
|---|---|
| [`01-arquitectura.md`](01-arquitectura.md) | Diseño general, flujo de datos y reglas |
| [`02-migracion-sql.md`](02-migracion-sql.md) | Cambios aplicados a `ventas_ml` y nueva tabla `sync_log` |
| [`03-backend-cambios.md`](03-backend-cambios.md) | Nuevo servicio, endpoints y cron en el backend Express |
| [`04-scripts.md`](04-scripts.md) | Scripts Python auxiliares para operar y verificar el sync |
| [`05-reconciliacion-hallazgos.md`](05-reconciliacion-hallazgos.md) | Resultados del primer reporte de reconciliacion API vs Excel y el descubrimiento del `pack_id` |
| [`06-pendientes.md`](06-pendientes.md) | Que falta por hacer y en que orden |

---

## Resumen rapido para usar el sistema

### Verificar estado del sync
```powershell
python scripts/verificar_sync.py
```
Muestra las ultimas corridas en `sync_log` y conteos por origen.

### Disparar un sync manual
```powershell
python scripts/disparar_sync.py
```
Loguea al backend automaticamente y llama `POST /admin/sync-ahora`.

### Comparar API vs Excel en un rango
```powershell
python scripts/correr_reconciliacion.py 2026-03-01 2026-04-30
```
Genera un reporte detallado de match, discrepancias y huerfanas.

### Sync automatico
El backend programa un cron que corre **cada hora en el minuto 5** (zona Bogota).
No requiere intervencion mientras el backend este corriendo y el token de MeLi
siga vivo.
