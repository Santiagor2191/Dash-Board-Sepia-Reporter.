# Migración a Netlify Functions — pausada

`api.mjs` vive acá (fuera de `netlify/functions/`) a propósito. Netlify
detecta `netlify/functions/` por convención y trata de empaquetarla en
cada build, aunque `[functions]` esté comentado en `netlify.toml` — y esa
carpeta necesita las dependencias de `../sepia meli api/` (express, pg,
axios, etc.) que el build de Netlify no instala, así que el build fallaba.

Para retomar la migración (ver `../../docs/migracion-netlify.md`):
1. Resolver sesiones sin estado + mover el cron a GitHub Actions.
2. Mover `api.mjs` de vuelta a `netlify/functions/api.mjs`.
3. Descomentar el bloque `[functions]` y los redirects en `netlify.toml`.
4. Confirmar que el build de Netlify instala las dependencias del backend
   (ej. moviéndolas al `package.json` del frontend, o con un build command
   que también corra `npm install` dentro de `sepia meli api/`).
