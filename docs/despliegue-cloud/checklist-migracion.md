# Checklist de migracion a la nube

Lista verificable para no olvidar nada en cada fase. Marca con [x] segun avanzas.

---

## Pre-flight (antes de empezar)

- [ ] Repo del proyecto subido a GitHub (privado o publico, da igual)
- [ ] `.env`, `.tokens.json` y `node_modules/` estan en `.gitignore` en TODAS las subcarpetas
- [ ] Backup de la BD local hecho hoy: `pg_dump -h 127.0.0.1 -U postgres -d mercado_libre_oficial -F c -f backup-$(Get-Date -Format yyyy-MM-dd).dump`
- [ ] Lista de variables de entorno actuales documentada (revisa `.env` del backend y `.env` del MCP)
- [ ] Capturas/screenshots del dashboard funcionando localmente — para comparar despues
- [ ] Backend `package.json` tiene `"start": "node server.js"`
- [ ] Confirmado que el frontend usa `VITE_API_URL` o se actualizo codigo/docs a un unico nombre

---

## Fase 1 — BD + Backend

### Neon
- [ ] Cuenta creada en neon.tech
- [ ] Proyecto `sepia-bi` creado
- [ ] BD `mercado_libre_oficial` creada
- [ ] Connection string guardada en un sitio seguro (1Password, gestor de contras)
- [ ] `pg_restore` ejecutado sin errores
- [ ] `SELECT COUNT(*) FROM ventas_ml` devuelve 8.748+ filas
- [ ] Otras tablas migradas: `publicaciones_ml_contabilidad` (rentabilidad), tablas de sync, etc.

### Backend en Render
- [ ] Cuenta creada en render.com con GitHub
- [ ] Web Service creado apuntando a `sepia meli api/`
- [ ] Variables de entorno completas y revisadas (incluyendo `DB_SSL=true`)
- [ ] `SESSION_SECRET` regenerado (NO el de tu PC)
- [ ] `DASHBOARD_ADMIN_PASSWORD` regenerado
- [ ] Primer deploy exitoso (logs en verde)
- [ ] `https://sepia-backend.onrender.com/` responde `{"ok":true}`

### Codigo
- [ ] `src/db/pool.js` actualizado con flag `ssl`
- [ ] `src/db/rentabilidadPool.js` actualizado con flag `ssl`
- [ ] `DB_SSL` exportado desde `src/config/env.js`
- [ ] `meliClient.js` adaptado para persistir tokens en Neon
- [ ] Tabla `meli_tokens` creada en Neon
- [ ] Migracion SQL aplicada

### MeLi
- [ ] Nueva URI registrada en developers.mercadolibre.com.co
- [ ] OAuth realizado con la nueva URL de Render
- [ ] Tokens persistidos correctamente en Neon (verificar `SELECT * FROM meli_tokens`)

### MCP local
- [ ] `Sepia-meli-mcp/.env` actualizado con `DB_HOST` de Neon
- [ ] `Sepia-meli-mcp/src/dbPool.js` con flag SSL
- [ ] Probar una tool desde Claude Code y confirmar que trae datos de Neon

### Validacion
- [ ] Dashboard local apuntando a `https://sepia-backend.onrender.com` responde igual que antes
- [ ] KPIs, tabla de ordenes, inventario y publicidad muestran datos correctos
- [ ] No hay errores en consola del navegador (DevTools → Console)

---

## Fase 2 — Frontend

- [ ] `sepia-dashboard-Fronted/.env.production` creado con `VITE_API_URL`
- [ ] `public/_redirects` creado para SPA routing
- [ ] `npm run build` local funciona y crea `dist/`
- [ ] Cuenta creada en netlify.com con GitHub
- [ ] Sitio creado apuntando a `sepia-dashboard-Fronted/`
- [ ] Variable de entorno `VITE_API_URL` configurada en Netlify
- [ ] Nombre del sitio renombrado a algo memorable
- [ ] Primer deploy exitoso
- [ ] `FRONTEND_ORIGINS` actualizado en Render con la URL de Netlify
- [ ] Backend reiniciado con la nueva variable
- [ ] Login funciona en `https://...netlify.app`
- [ ] Navegacion funciona (ir a `/analytics` directo carga la pagina, no 404)
- [ ] Datos de MeLi e historico cargan correctamente

---

## Fase 3 — Cron y keep-alive

- [ ] `.github/workflows/keep-alive.yml` creado
- [ ] Decision tomada: keep-alive apagado, cada 15 min, cada 10 min, o Render Starter
- [ ] `.github/workflows/sync-meli.yml` creado
- [ ] Endpoint `/admin/sync-cron` agregado al backend (autenticacion por secret)
- [ ] Variable `CRON_SECRET` agregada en Render (valor aleatorio)
- [ ] Secret `CRON_SECRET` agregado en GitHub Settings → Secrets
- [ ] Workflows habilitados en pestana Actions de GitHub
- [ ] Disparar manualmente `keep-alive` — debe terminar verde
- [ ] Disparar manualmente `sync-meli` — debe sincronizar y terminar verde
- [ ] Esperar 1 hora sin tocar nada — verificar que keep-alive corrio sin intervencion

---

## Fase 4 — OneDrive

### Azure AD
- [ ] App `sepia-bi-onedrive` registrada en portal.azure.com
- [ ] `Application (client) ID` guardado
- [ ] `Directory (tenant) ID` guardado
- [ ] Client secret generado (anotada fecha de expiracion para renovar)
- [ ] Permisos delegados anadidos: `Files.Read`, `offline_access`, `User.Read`
- [ ] Admin consent dado si era necesario
- [ ] Redirect URI registrada: `https://sepia-backend.onrender.com/auth/onedrive/callback`

### Backend
- [ ] Decision confirmada: Excel es fuente editable, Postgres es base real del backend
- [ ] Tablas destino en Postgres definidas para cada hoja/dataset critico del Excel
- [ ] Carga inicial del Excel a Postgres probada localmente
- [ ] Dashboard confirmado consultando Postgres, no recalculando Excel en cada request
- [ ] `oneDriveClient.js` creado
- [ ] Tabla `onedrive_tokens` creada en Neon
- [ ] Variables `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`, `MS_REDIRECT_URI`, `ONEDRIVE_EXCEL_PATH` configuradas en Render
- [ ] Endpoints `/auth/onedrive` y `/auth/onedrive/callback` funcionando
- [ ] OAuth de Microsoft realizado, tokens guardados en Neon
- [ ] `clientesContabilidadService.js` adaptado para descargar de OneDrive
- [ ] Otros services que leian Excel local tambien adaptados

### Validacion
- [ ] Disparar el ETL en produccion descarga el Excel correctamente
- [ ] Los datos del Excel aparecen actualizados en el dashboard
- [ ] El refresh automatico de tokens funciona (esperar 1h y volver a probar)

---

## Post-deploy

- [ ] Documentar URLs publicas en algun sitio accesible (Notion, README del proyecto)
- [ ] Tomar capturas del dashboard funcionando para comparar contra el pre-flight
- [ ] Verificar que el MCP sigue trayendo datos correctos desde Claude Code
- [ ] Confirmar que apagar tu PC NO afecta el dashboard ni el sync horario

---

## Plan de rollback

Si algo se rompe gravemente en cualquier fase, vuelve atras:

### Rollback rapido (sin tocar BD)
1. En Netlify: cambia el dominio a apuntar al frontend local (no aplica, mejor solo abrir tu PC).
2. En Render: si el backend esta roto, **suspender** el servicio. Tu BD en Neon sigue accesible.
3. Levantar tu backend local (`npm start` en `sepia meli api/`) apuntando a Neon.
4. Cambiar `VITE_API_URL` del frontend local a `http://localhost:3000`.

### Rollback de BD (perdida de datos catastrofica)
1. Neon tiene **point-in-time recovery** hasta 7 dias atras. Desde el panel de Neon → **Branches** → restaurar a un timestamp anterior.
2. Si el dano fue antes de 7 dias o no quieres usar PITR, restaurar el dump pre-flight:
   ```powershell
   pg_restore --no-owner --no-acl --clean --if-exists \
     --dbname="postgresql://..." \
     backup-2026-MM-DD.dump
   ```

### Rollback de codigo
- Render: pestana **Deploys** → click en un deploy anterior → **"Redeploy"**. Cada push a `main` genera un deploy aparte, asi que volver atras es trivial.
- Netlify: igual, pestana **Deploys** → click → **"Publish deploy"** en cualquier deploy anterior.

---

## Renovaciones que requieren tu atencion futura

| Item | Cada cuanto | Que hacer |
|---|---|---|
| Client secret de Azure (OneDrive) | 24 meses | Generar uno nuevo en portal.azure.com, actualizar en Render |
| Refresh token de MeLi | Si la tienda esta inactiva 6 meses | Volver a hacer OAuth |
| Refresh token de OneDrive | Si pasan 90 dias sin sync exitoso | Volver a hacer OAuth |
| Plan free de Render | Permanente, pero pueden cambiar terminos | Monitorear Render changelog |
| Plan free de Neon | Permanente | Monitorear uso de storage (500 MB limite) |
| Plan free de Netlify | Permanente, generoso | Bandwidth 100 GB/mes (imposible llegar) |

Recomendado: **agendar revision cada 6 meses** de:
1. Tamano de BD en Neon
2. Uso de minutos en GitHub Actions
3. Logs de errores en Render
