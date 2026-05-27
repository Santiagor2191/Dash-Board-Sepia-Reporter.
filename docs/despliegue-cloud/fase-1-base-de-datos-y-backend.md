# Fase 1 — Base de datos en Neon + Backend en Render

**Duracion estimada**: 1 a 2 dias (no de trabajo continuo, sino con pausas para esperar deploys y verificar).

**Lo que vas a tener al final**:
- Tu base de datos PostgreSQL corriendo en Neon (con todos los datos historicos migrados).
- El backend Express corriendo en Render con URL HTTPS publica.
- El dashboard de tu PC sigue funcionando, pero ahora apuntando a la nube.
- ngrok ya no se necesita para el OAuth de MeLi.

---

## 1.1 Crear cuenta en Neon y la base de datos

### Pre-requisitos
- Una cuenta de email (puede ser la misma de tu CRM si quieres centralizar).

### Pasos

1. Entra a **https://neon.tech** y haz "Sign up" con Google/GitHub/email.
2. En el dashboard, click **"Create project"**.
3. Configura:
   - **Project name**: `sepia-bi`
   - **Postgres version**: la version mas reciente (16 o 17)
   - **Region**: la mas cercana a tus usuarios. Para Colombia: **AWS us-east-1 (N. Virginia)** o **AWS us-east-2 (Ohio)**. Latencia ~50ms.
4. Click **"Create project"**.
5. En la pantalla siguiente, Neon te da una **connection string** tipo:
   ```
   postgresql://user:password@ep-...neon.tech/neondb?sslmode=require
   ```
   **Copiala y guardala** — la vas a necesitar varias veces.

### Como verificar que funciono
- En el dashboard de Neon ves la base `neondb` con un panel SQL.
- Ejecuta `SELECT version();` en el panel — debe devolver "PostgreSQL 16.x" o similar.

---

## 1.2 Renombrar la base (opcional pero recomendado)

Neon por defecto crea `neondb`. Para que coincida con tu local, vamos a crear `mercado_libre_oficial`.

1. En el panel SQL de Neon, ejecuta:
   ```sql
   CREATE DATABASE mercado_libre_oficial;
   ```
2. Cambia tu connection string para usar la nueva base — solo cambia el nombre al final de la URL:
   ```
   postgresql://user:password@ep-...neon.tech/mercado_libre_oficial?sslmode=require
   ```

---

## 1.3 Migrar los datos de tu PC a Neon

Tienes 8.748 filas en `ventas_ml` (y otras tablas) en tu Postgres local. Hay que copiarlas a Neon.

### Pre-requisitos
- Tener `pg_dump` y `psql` instalados (vienen con PostgreSQL). En PowerShell, prueba:
  ```powershell
  pg_dump --version
  ```
  Si dice "command not found", anade `C:\Program Files\PostgreSQL\17\bin` al PATH de Windows, o usa la ruta completa.

### Pasos

1. **Hacer dump de tu BD local**:
   ```powershell
   $env:PGPASSWORD = "Sepia2026!"
   pg_dump -h 127.0.0.1 -U postgres -d mercado_libre_oficial -F c -f sepia_bi.dump
   ```
   Genera un archivo `sepia_bi.dump` (~10 MB).

2. **Restaurar el dump en Neon**:
   ```powershell
   # Tomar la URL de Neon (la que copiaste antes, sin el "?sslmode=require")
   pg_restore --no-owner --no-acl --dbname="postgresql://user:pass@ep-...neon.tech/mercado_libre_oficial" sepia_bi.dump
   ```
   Tarda 1-3 minutos.

3. **Verificar la migracion**:
   En el panel SQL de Neon:
   ```sql
   SELECT COUNT(*) FROM ventas_ml;
   ```
   Debe dar 8.748 (o mas, segun cuanto haya crecido).

### Si algo sale mal
- **"role 'postgres' does not exist"**: agrega `--no-owner --no-acl` al `pg_restore` (ya esta arriba).
- **"connection refused"**: revisa que la URL de Neon sea exacta y que tu firewall no bloquee salidas en el puerto 5432.
- **Tarda mucho**: Neon en plan gratis "duerme" la BD tras 5 min sin uso. Las primeras consultas tras dormir tardan ~3s. Despues, instantaneo.

---

## 1.4 Preparar el backend para la nube

Hay 4 cambios chicos en el codigo antes de subirlo.

### 1.4.0 Agregar script de produccion

El `package.json` actual del backend no tiene script `start`. Render puede arrancar con `node server.js`, pero conviene dejarlo explicito:

```json
"scripts": {
  "dev": "nodemon server.js",
  "start": "node server.js",
  "test": "node --test --test-isolation=none test/**/*.test.js"
}
```

En Render puedes usar:

```
Start Command: npm start
```

### 1.4.1 Persistir tokens MeLi en BD

Hoy el backend guarda los tokens MeLi en memoria. Cuando Render reinicie el contenedor, los pierde. Hay que guardarlos en PostgreSQL.

**Que cambia**:
- Crear tabla `meli_tokens` (id, access_token, refresh_token, expires_at, updated_at).
- En `meliClient.js`: cuando se refrescan tokens, escribirlos a la tabla; al arrancar, leerlos de la tabla.

**Esto lo hago yo cuando arranquemos esta fase**. Es ~30 lineas de codigo y una migracion SQL.

### 1.4.2 Variables de entorno listas para produccion

El backend ya esta bien con `dotenv`. Solo hay que tener claro que en Render NO subes el `.env` — pones cada variable en el panel de Render. Lista de las que necesita:

```
PORT (Render la pone solo, no la toques)
HOST=0.0.0.0
MELI_CLIENT_ID=...
MELI_CLIENT_SECRET=...
MELI_REDIRECT_URI=https://sepia-backend.onrender.com/auth/mercadolibre/callback
SESSION_SECRET=... (generar uno nuevo, no el de tu PC)
DASHBOARD_ADMIN_PASSWORD=... (cambialo, no uses el de tu PC)
DB_HOST=ep-...neon.tech
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=mercado_libre_oficial
DB_SSL=true  ← NUEVO, Neon exige SSL
FRONTEND_ORIGINS=https://sepia-dashboard.netlify.app
```

### 1.4.3 Forzar SSL en la conexion a Postgres

Neon exige `sslmode=require`. Hay que actualizar **dos pools**:

- `sepia meli api/src/db/pool.js`
- `sepia meli api/src/db/rentabilidadPool.js`

Tambien hay que exportar `DB_SSL` desde `src/config/env.js`.

```js
const pgPool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  max: DB_CONNECTION_LIMIT,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});
```

Esto **no rompe** el desarrollo local porque por defecto `DB_SSL` no esta seteada.

---

## 1.5 Crear cuenta y servicio en Render

### Pre-requisitos
- Cuenta de **GitHub** (o GitLab/Bitbucket).
- Tu repo `dash board sepia BI` subido a GitHub. Si todavia esta solo local, te ayudo a subirlo.

### Pasos

1. Ve a **https://render.com**, "Sign up" con GitHub (lo mas rapido — autoriza acceso a tus repos).
2. Una vez dentro, click **"New +"** → **"Web Service"**.
3. Selecciona tu repo `dash board sepia BI`.
4. Configura:
   - **Name**: `sepia-backend`
   - **Region**: la misma que pusiste en Neon (us-east).
   - **Branch**: `main` (o la que uses para produccion).
   - **Root Directory**: `sepia meli api` *(importante, porque el backend esta en una subcarpeta)*.
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` *(o `node server.js` si aun no agregaste el script)*
   - **Instance Type**: **Free**
5. En **"Environment Variables"** anade todas las del paso 1.4.2.
6. Click **"Create Web Service"**.

Render hace el primer deploy (~3-5 min). Veras logs en vivo.

### Como verificar que funciono
1. Render te da una URL tipo `https://sepia-backend.onrender.com`.
2. Abrela en el navegador — debe responder `{"ok":true}`.
3. Prueba un endpoint de BD:
   ```
   https://sepia-backend.onrender.com/health
   ```
   o el que tengas. Si responde, la conexion a Neon funciona.

### Si algo sale mal
- **"Database connection refused"**: revisa que `DB_HOST` no tenga `https://` ni el puerto, solo el host. Y que `DB_SSL=true`.
- **"Module not found"**: el `Root Directory` esta mal. Debe apuntar a `sepia meli api` (con espacio, sin slash inicial).
- **"Application failed to start"**: mira los logs en Render. Generalmente es una variable de entorno faltante.

---

## 1.6 Actualizar el redirect URI de MeLi

Tu URL de produccion en MeLi tiene que ser la de Render (no la de ngrok).

1. Entra a **https://developers.mercadolibre.com.co/devcenter**.
2. Abre tu app → "URIs de redireccion".
3. **Anade** `https://sepia-backend.onrender.com/auth/mercadolibre/callback`.
4. No quites las anteriores hasta confirmar que la nueva funciona.

---

## 1.7 Re-autorizar MeLi en la nube

Como migramos a otra URL, hay que volver a hacer el flujo OAuth una vez.

1. Abre `https://sepia-backend.onrender.com/auth/mercadolibre` *(o el endpoint que dispara el OAuth en tu app)*.
2. Le das "Permitir" en MeLi.
3. Render redirige a tu frontend... que todavia no esta en Netlify. Para esta primera prueba, puedes apuntar `FRONTEND_ORIGINS` a `http://localhost:5173` temporalmente.

### Como verificar
- Llama a un endpoint que requiera token: `GET /meli/me` desde tu dashboard local.
- Si responde con info del vendedor, el OAuth en la nube funciono.

---

## 1.8 Apuntar tu dashboard local al backend en la nube

Editar `sepia-dashboard-Fronted/.env`:

```
VITE_API_URL=https://sepia-backend.onrender.com
```

El cliente actual lee `VITE_API_URL` en `sepia-dashboard-Fronted/src/api.js`. Si en el futuro se renombra a `VITE_API_BASE_URL`, actualizar esta documentacion y Netlify al mismo tiempo.

Reinicia `npm run dev` y verifica que el dashboard se vea **igual que antes** pero ahora consumiendo el backend remoto.

---

## 1.9 Actualizar el MCP para usar el backend en la nube

El MCP Sepia-meli-mcp esta conectandose directo a MeLi (con sus propios tokens). Eso sigue funcionando igual. Lo que SI cambia es la BD: hoy apunta a `127.0.0.1:5432`, debe apuntar a Neon.

Editar `Sepia-meli-mcp/.env`:

```
DB_HOST=ep-...neon.tech
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=mercado_libre_oficial
DB_SSL=true
```

Y agregar el flag SSL en `Sepia-meli-mcp/src/dbPool.js` (mismo cambio que en el backend).

---

## Resumen de Fase 1

Cuando termines tendras:

- [x] PostgreSQL en Neon con tus datos migrados
- [x] Backend Express corriendo en Render con HTTPS publico
- [x] OAuth de MeLi funcionando en la nube
- [x] Tu dashboard local apuntando al backend remoto
- [x] El MCP usando Neon para historicos

**Aun corre en tu PC**: el frontend (`npm run dev`).

**Proximo paso**: [Fase 2 — Frontend en Netlify](fase-2-frontend.md).
