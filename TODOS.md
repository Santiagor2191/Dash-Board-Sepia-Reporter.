# TODOS

## Pendientes

### Retirar el origen viejo `*.netlify.app` de FRONTEND_ORIGINS (Render)
- **Qué:** sacar la URL vieja del dashboard (`*.netlify.app`) de la variable `FRONTEND_ORIGINS` en Render, dejando solo `https://app.sepiamodaymas.com`.
- **Por qué:** en el eng-review del CRM embebido (2026-07-20, decisión 1A) se dejaron ambos orígenes vivos a propósito como respaldo durante la transición de dominio. Dejarlo para siempre es superficie innecesaria.
- **Contexto:** la lista se lee en `sepia meli api/src/config/env.js:110` (match exacto de strings). El primer origen de la lista es también el destino del redirect post-OAuth de MeLi (`authRoutes.js:26`) — el dominio nuevo ya quedó primero.
- **Depende de:** transición a `app.sepiamodaymas.com` completada y estable por unas semanas.

### Rotar la contraseña de Neon del CRM (Sepia-CRM)
- **Qué:** cambiar la contraseña del `DATABASE_URL` de Sepia-CRM en Neon y actualizarla en `D:\Proyecto CRM Sepia Api WhatsApp\sepia-crm\.env` y en las variables de entorno de Netlify del CRM.
- **Por qué:** la cadena de conexión (contraseña incluida) quedó impresa en la salida de la sesión de revisión del 2026-07-20. Una credencial que pasó por un chat deja de ser secreta.
- **Contexto:** mismo tipo de pendiente que la rotación de la Neon del dashboard (ya anotada en memoria del proyecto). Conviene rotar ambas el mismo día. Tras rotar, verificar que el CRM siga conectando (login + buzón de prospectos).
- **Depende de:** nada — se puede hacer cuando haya 15 minutos tranquilos.
