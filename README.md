# Sepia BI

Proyecto de analítica y operación para Mercado Libre con tres piezas principales:

1. `sepia meli api`
Backend Express que integra autenticación local, OAuth con Mercado Libre, consultas históricas en MySQL e inventario.

2. `sepia-dashboard`
Frontend React + Vite que consume el backend y muestra dashboard, analytics, inteligencia, órdenes, inventario y estrategias.

3. `scripts`
Utilidades Python para copiar Excel desde OneDrive, cargar histórico a MySQL y validar la carga.

## Estructura

- `sepia meli api/`
  Backend modularizado en `src/config`, `src/db`, `src/routes`, `src/security` y `src/services`.
- `sepia-dashboard/`
  Aplicación React con rutas en `src/main.jsx`, layout en `src/App.jsx` y páginas en `src/pages`.
- `scripts/`
  Scripts ETL dependientes de variables de entorno documentadas en `scripts/README.md`.
- `data/`
  Carpeta de datos locales usada por los scripts.

## Documentación disponible

- [Backend](./sepia%20meli%20api/README.md)
- [Frontend](./sepia-dashboard/README.md)
- [Scripts ETL](./scripts/README.md)

## Puesta en marcha

1. Backend
- Copia `sepia meli api/.env.example` a `.env`
- Instala dependencias con `npm install`
- Inicia con `npm run dev`

2. Frontend
- Copia `sepia-dashboard/.env.example` a `.env`
- Instala dependencias con `npm install`
- Inicia con `npm run dev`

3. Scripts
- Revisa variables y rutas en `scripts/README.md`
- Usa tu entorno Python local o `.venv`

## Flujo actual

1. El usuario entra al dashboard y hace login local contra el backend.
2. El frontend guarda un bearer token en `localStorage`.
3. El backend protege `/db/*`, `/meli/*` y las rutas sensibles de OAuth.
4. El dashboard consume MySQL histórico y APIs de Mercado Libre desde el backend.
5. Los scripts Python actualizan la base histórica fuera del runtime web.

## Verificación rápida

- Backend: `cd "sepia meli api" && npm test`
- Frontend: `cd sepia-dashboard && npm run lint && npm run build`

## Estado actual

- El backend ya no depende de un `server.js` monolítico; ahora actúa como ensamblador de módulos.
- Hay pruebas de humo para auth, db y meli.
