# Fase 2 — Frontend en Netlify

**Duracion estimada**: medio dia.

**Pre-requisito**: Fase 1 completa (backend ya respondiendo en `https://sepia-backend.onrender.com`).

**Lo que vas a tener al final**:
- El dashboard accesible desde `https://sepia-dashboard.netlify.app` (o el dominio que elijas).
- Funciona igual que en tu PC pero desde cualquier internet.
- Deploys automaticos cada vez que hagas push a `main`.

---

## 2.1 Preparar el frontend para produccion

### 2.1.1 Variable de entorno para la URL del backend

El frontend tiene un cliente API en `sepia-dashboard-Fronted/src/api.js`. En la revision del 26/05/2026, el codigo real usa `VITE_API_URL`.

Crear archivo `sepia-dashboard-Fronted/.env.production`:
```
VITE_API_URL=https://sepia-backend.onrender.com
```

Crear/actualizar `sepia-dashboard-Fronted/.env`:
```
VITE_API_URL=http://localhost:3000
```

En `api.js`, asegurarse de leer la variable:
```js
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
```

> Si ya esta asi, no toques nada.

### 2.1.2 Configurar redirects de SPA

React Router DOM necesita que cualquier ruta del frontend (ej. `/analytics`, `/ordenes`) sirva `index.html`. Netlify lo hace si le decimos.

Crear `sepia-dashboard-Fronted/public/_redirects`:
```
/*    /index.html   200
```

Ese archivo se copia al build automaticamente.

### 2.1.3 Verificar el build local

```powershell
cd "D:\dash board sepia BI\sepia-dashboard-Fronted"
npm run build
```

Debe crear una carpeta `dist/` con los archivos. Si falla, hay que arreglarlo antes de subir.

---

## 2.2 Crear cuenta y sitio en Netlify

### Pre-requisitos
- Cuenta de GitHub con el repo del proyecto (mismo que usaste en Render).

### Pasos

1. Ve a **https://netlify.com**, "Sign up" con GitHub.
2. Click **"Add new site"** → **"Import an existing project"** → **"Deploy with GitHub"**.
3. Selecciona el repo `dash board sepia BI`.
4. Configura el deploy:
   - **Branch to deploy**: `main`
   - **Base directory**: `sepia-dashboard-Fronted`
   - **Build command**: `npm run build`
   - **Publish directory**: `sepia-dashboard-Fronted/dist`
5. En **"Environment variables"** anade:
   ```
   VITE_API_URL = https://sepia-backend.onrender.com
   ```
6. Click **"Deploy site"**.

Netlify hace el build (~2 min) y te asigna una URL random tipo `https://amazing-curie-123abc.netlify.app`.

### 2.2.1 Cambiar el nombre del sitio

1. **Site settings** → **Change site name** → poner `sepia-dashboard` (o el que quieras).
2. Tu URL queda `https://sepia-dashboard.netlify.app`.

---

## 2.3 Actualizar CORS en el backend

El backend solo acepta requests del origen `FRONTEND_ORIGINS`. Ahora el origen es Netlify.

En Render:
1. **Environment** → editar `FRONTEND_ORIGINS`:
   ```
   FRONTEND_ORIGINS=https://sepia-dashboard.netlify.app
   ```
2. Render reinicia el backend solo (~1 min).

---

## 2.4 Verificar end-to-end

1. Abre `https://sepia-dashboard.netlify.app` en una pestana incognito.
2. Te pide login (el password admin que pusiste en Render).
3. Login → debes ver tus KPIs, graficos, etc.
4. Ve a Inventario → debe traer datos en vivo de MeLi.
5. Ve a Historico → debe traer datos de Neon.

### Si algo sale mal
- **"CORS error" en la consola del navegador**: el `FRONTEND_ORIGINS` no coincide. Verifica que sea exactamente la URL de Netlify, sin slash al final.
- **"401 Unauthorized" en /db**: el login no funciono. Revisa que `DASHBOARD_ADMIN_PASSWORD` este bien en Render.
- **Datos no aparecen**: abre DevTools → Network. Si ves `502 Bad Gateway`, el backend de Render esta cold-started. Espera 30s y refresca. (Esto se arregla en Fase 3.)

---

## 2.5 (Opcional) Dominio propio

Si quieres `https://dashboard.sepia.com` en lugar de `.netlify.app`:

1. Compra el dominio (Namecheap, GoDaddy, etc.).
2. Netlify: **Domain settings** → **Add custom domain** → seguir las instrucciones DNS.
3. Cambiar `FRONTEND_ORIGINS` en Render al nuevo dominio.

Esto cuesta el dominio (~$10/ano), no es Netlify.

---

## Resumen de Fase 2

- [x] Frontend en Netlify, deploys automaticos al push
- [x] Backend acepta requests desde Netlify
- [x] Dashboard accesible desde cualquier internet
- [x] Tu PC ya no es necesaria para ver el dashboard

**Aun corre en tu PC**: nada. **Tu PC ya puede apagarse y todo sigue funcionando**, excepto:
- Los scripts ETL de Python que leen Excel local (Fase 4).
- El sync horario tarda en arrancar tras inactividad (Fase 3).

**Proximo paso**: [Fase 3 — GitHub Actions](fase-3-cron-keep-alive.md).
