# Sepia Dashboard

Frontend React + Vite para visualizar ventas históricas, analítica, inteligencia comercial, órdenes, inventario y estrategias de Sepia.

## Arquitectura

- `src/main.jsx`
  Declara las rutas activas de la app.
- `src/App.jsx`
  Layout principal, sesión local, filtros globales y carga base de datos histórica.
- `src/api.js`
  Cliente HTTP del backend y manejo de bearer token.
- `src/pages/`
  Vistas funcionales del dashboard.
- `src/components/`
  Componentes reutilizables.

## Rutas activas

- `/`
  Dashboard principal.
- `/analytics`
  Vista analítica.
- `/inteligencia`
  Inteligencia comercial.
- `/ordenes`
  Órdenes históricas.
- `/inventario`
  Inventario y alertas.
- `/estrategias`
  Estrategias.

## Variables de entorno

- `VITE_API_URL`
  URL base del backend. Default recomendado: `http://127.0.0.1:3000`

Usa `./.env.example` como base.

## Flujo de autenticación

1. La app llama `GET /auth/session/status`.
2. Si el backend exige sesión local, muestra pantalla de login.
3. Al hacer login guarda el bearer token en `localStorage` bajo la key `sepia_session_token`.
4. Todas las llamadas posteriores lo envían en `Authorization`.
5. Si el backend devuelve `401`, el frontend limpia sesión y obliga a reingresar.

## Scripts

- `npm run dev`
  Levanta Vite en desarrollo.
- `npm run lint`
  Ejecuta ESLint.
- `npm run build`
  Genera el build productivo.
- `npm run preview`
  Sirve el build localmente.

## Estado actual

- El login local ya está integrado con el backend.
- El dashboard consume histórico vía `/db/ventas`.
- Si MySQL falla, la UI entra en modo visual `DEMO`, pero no genera dataset ficticio completo.

## Desarrollo recomendado

1. Arranca primero el backend.
2. Luego inicia el dashboard.
3. Verifica login local.
4. Revisa `npm run lint` y `npm run build` antes de cerrar cambios.
