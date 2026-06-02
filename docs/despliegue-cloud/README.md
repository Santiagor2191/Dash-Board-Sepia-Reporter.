# Despliegue de Sepia BI en la nube

Documentacion paso a paso para mover el proyecto Sepia BI desde tu PC a un stack 100% en la nube, sin costo en el plan inicial.

> Para Santiago: esto NO es un manual tecnico denso. Cada fase esta pensada para que la sigas en orden y veas resultados intermedios. Si algo no es claro, preguntas antes de avanzar.

> ✅ **2026-06-01 — Fases 1 y 2 COMPLETAS y en produccion.** Para ver el estado REAL de lo desplegado y como operarlo (incluido el robot de Clientes/Contabilidad), lee **[Estado actual y operacion](estado-actual-y-operacion.md)**. Los `fase-*.md` son el plan original; en algunos puntos la realidad difiere (sobre todo la Fase 4, que se resolvio con un robot local en vez de Microsoft Graph).

## Indice

1. **[Fase 1 — Base de datos y Backend](fase-1-base-de-datos-y-backend.md)** (1-2 dias)
   Mover PostgreSQL a Neon y el backend Express a Render. Es la fase mas critica.

2. **[Fase 2 — Frontend en Netlify](fase-2-frontend.md)** (medio dia)
   Subir el dashboard React. Acceso desde cualquier PC con internet.

3. **[Fase 3 — GitHub Actions: cron y keep-alive](fase-3-cron-keep-alive.md)** (1 dia)
   Mantener el backend despierto y disparar el sync horario sin costo.

4. **[Fase 4 — OneDrive API](fase-4-onedrive-api.md)** (1-2 dias)
   Que el ETL en la nube pueda leer tus Excel de OneDrive automaticamente.

5. **[Checklist de migracion](checklist-migracion.md)**
   Lista verificable antes, durante y despues de cada fase. Incluye plan de rollback.

## Arquitectura final

```
                                         ┌───────────────────────┐
                                         │      USUARIOS         │
                                         │  (tu, tu equipo)      │
                                         └──────────┬────────────┘
                                                    │ HTTPS
                                                    ▼
                          ┌────────────────────────────────────────────┐
                          │           NETLIFY (frontend)               │
                          │    sepia-dashboard.netlify.app             │
                          │    React + Vite (build estatico)           │
                          └────────────────────┬───────────────────────┘
                                               │ API calls (HTTPS)
                                               ▼
                          ┌────────────────────────────────────────────┐
                          │            RENDER (backend)                │
                          │    sepia-backend.onrender.com              │
                          │    Express + node-cron                     │
                          │    Variables: MeLi, DB, OneDrive           │
                          └──────┬─────────────────────┬───────────────┘
                                 │                     │
                                 │ SQL                 │ HTTPS APIs
                                 ▼                     ▼
                ┌──────────────────────┐    ┌──────────────────────┐
                │    NEON (Postgres)   │    │  MeLi + OneDrive     │
                │ ventas_ml, etc.      │    │  + Microsoft Graph   │
                │ 500 MB free          │    └──────────────────────┘
                └──────────────────────┘
                                 ▲
                                 │ ping cada 10 min + cron horario
                                 │
                          ┌──────┴─────────────┐
                          │  GITHUB ACTIONS    │
                          │  (workflows YAML)  │
                          └────────────────────┘
```

## Estado real del repo antes de iniciar

Revision hecha el 26/05/2026. La arquitectura es viable, pero el codigo actual todavia necesita estos ajustes antes del primer deploy:

- Backend: agregar script `"start": "node server.js"` en `sepia meli api/package.json`.
- Backend: agregar soporte `DB_SSL=true` en `src/db/pool.js` y tambien en `src/db/rentabilidadPool.js`.
- Backend: persistir tokens de Mercado Libre en PostgreSQL. Hoy `src/services/meliClient.js` mantiene tokens en memoria/variables iniciales, lo cual no sobrevive reinicios de Render.
- Frontend: el codigo real usa `VITE_API_URL` en `sepia-dashboard-Fronted/src/api.js`, no `VITE_API_BASE_URL`.
- Cron externo: `/admin/sync-cron` no existe todavia; hay que crearlo con `CRON_SECRET` antes de usar GitHub Actions para sync.
- OneDrive: los servicios de Excel (`clientesContabilidadService.js` y `metaAdsSalesService.js`) leen archivo local con `stat()` y Python. Para nube hay que descargar el Excel a `/tmp`, instalar dependencias Python y adaptar la cache.

Si una sesion futura arranca esta migracion, debe empezar por estos cambios de preparacion antes de crear servicios en Render/Netlify.

## Stack y costos

| Pieza | Plataforma | Plan | Costo /mes |
|---|---|---|---|
| Frontend | Netlify | Free | $0 |
| Backend | Render | Free (Hobby) | $0 |
| PostgreSQL | Neon | Free | $0 |
| Cron / keep-alive | GitHub Actions | Free (2000 min) | $0 |
| OneDrive API | Microsoft Graph | Free siempre | $0 |
| **TOTAL** | | | **$0** |

Cuando crezcamos (mas usuarios o mas datos) el upgrade natural es:
- Render Starter: $7/mes (sin cold start)
- Neon Launch: $19/mes (mas almacenamiento + branching)

## Decisiones que tomamos y por que

### Decision sobre Excel y base de datos

Excel no debe ser la base principal en la nube. Para Sepia BI, Excel queda como fuente editable por el negocio y PostgreSQL queda como base real del backend.

Flujo objetivo:

```text
Excel en OneDrive → ETL → PostgreSQL → Dashboard
```

Esto conserva la forma actual de trabajo, pero evita que el dashboard dependa de archivos locales o de recalcular Excel en cada request. A largo plazo, las hojas mas criticas pueden reemplazarse por pantallas internas que escriban directo a Postgres.

### Por que NO usamos Netlify para el backend
Netlify es ideal para sitios estaticos + funciones cortas. Nuestro backend hace:
- Consultas a MeLi que tardan 20-40 segundos (Netlify Functions corta a 10s).
- Cachea ordenes en memoria (Netlify Functions son stateless).
- Necesita cron persistente (sync horario).
- Mantiene tokens OAuth vivos.

Todas estas cosas piden un proceso persistente, no una funcion serverless.

### Por que Neon y no Upstash
Upstash es excelente para Redis. Para Postgres tienen un producto reciente y menos maduro. Neon esta enfocado 100% en Postgres serverless, tiene mejor compatibilidad con `pg` (la libreria que usa el backend) y un plan gratis mas generoso.

### Por que Render y no Railway
Railway elimino el plan gratis permanente (ahora son $5/mes minimo). Render mantiene un plan free, pero no lo trates como produccion estable: el servicio duerme tras inactividad y el plan free tiene cupo mensual de horas por workspace. Para un dashboard que abres pocas veces al dia es aceptable vivir con cold start. Si se necesita disponibilidad constante, el upgrade natural es Render Starter.

Importante: un keep-alive cada 10 minutos puede consumir casi todo el cupo mensual free de Render. Usalo solo si el cold start realmente molesta, o baja la frecuencia a 15 minutos. Para operacion seria, Render Starter es mas simple y robusto.

### Por que dejamos el MCP local (Sepia-meli-mcp)
El MCP corre por stdio cuando Claude Code lo lanza. No tiene sentido desplegarlo en la nube porque solo lo usas tu desde tu PC. Una vez el backend este en la nube, el MCP se conectara a la URL publica de Render en lugar de localhost. Detalle en el doc de Fase 1.

## Como leer estos documentos

Cada fase tiene:

- **Que vas a tener al final** — el resultado concreto
- **Pre-requisitos** — cuentas a crear, info a tener a mano
- **Pasos numerados** — instrucciones literales
- **Como verificar que funciono** — pruebas para confirmar
- **Si algo sale mal** — errores comunes y como salir

Si algun paso te queda confuso, **paras y preguntas**. No avances con dudas porque la nube es de esos sitios donde un error pequeno toma 30 min de debug.
