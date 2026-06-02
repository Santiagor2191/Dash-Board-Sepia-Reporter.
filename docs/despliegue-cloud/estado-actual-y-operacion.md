# Estado actual en la nube y cómo operarlo

> Documento vivo. Última actualización: **2026-06-01**.
> Resume lo que quedó **funcionando en producción** y cómo mantenerlo. Para el plan original ver los `fase-*.md`; aquí está lo que de verdad se desplegó (que en algunos puntos difiere del plan).

---

## 1. Qué está en línea hoy

| Pieza | Dónde | URL |
|---|---|---|
| **Frontend** (dashboard) | Netlify | https://dashboard-sepia-meli.netlify.app |
| **Backend** (API Express) | Render (plan Free) | https://dashboard-sepia-inventario.onrender.com |
| **Base de datos** | Neon (Postgres) | 2 bases: `mercado_libre_oficial` y `publicaciones_ml_contabilidad` |
| **Repositorio** | GitHub | `Santiagor2191/Dash-Board-Sepia-Reporter`, rama `main` |

- **Netlify y Render hacen auto-deploy** desde la rama `main`: cada `git push` reconstruye y publica solo.
- El plan Free de Render **duerme** tras inactividad (~50 s para despertar la primera petición). Es normal.

### Configuración clave (Netlify)
- Base directory: `sepia-dashboard-Fronted`
- Build command: `npm run build`
- Publish directory: `sepia-dashboard-Fronted/dist`
- Variable: `VITE_API_URL = https://dashboard-sepia-inventario.onrender.com`
- `public/_redirects` (regla `/* /index.html 200`) hace que las rutas internas de React no den 404.

### Configuración clave (Render — variables de entorno)
- `FRONTEND_ORIGINS = https://dashboard-sepia-meli.netlify.app` (sin barra final → habilita CORS).
- `MELI_REDIRECT_URI = https://dashboard-sepia-inventario.onrender.com/auth/mercadolibre/callback`
- Credenciales de BD apuntando a **Neon** (`DB_HOST` = host *pooler*, `DB_SSL=true`).
- `DASHBOARD_ADMIN_PASSWORD` = contraseña para entrar al dashboard (la eligió Santiago).
- Recomendado (opcional): `TRUST_PROXY = true`.

### Configuración en la app de Mercado Libre (developers.mercadolibre.com.co)
- **URI de redirect**: `https://dashboard-sepia-inventario.onrender.com/auth/mercadolibre/callback`
- **URL de notificaciones**: `https://dashboard-sepia-inventario.onrender.com/notifications`

---

## 2. El "robot" de Clientes y Contabilidad (lo más importante de operar)

### Por qué existe
Las páginas que dependen de Excel (Clientes/Contabilidad) no podían leerse en la nube, porque el Excel vive en el PC de Santiago y el procesamiento es en Python (que no corre en Render). 

**Solución:** un robot local en el PC procesa el Excel y sube el resultado a la base Neon. El dashboard lee desde Neon.

### Cómo funciona
```
Excel (OneDrive, en el PC)
        │  ← Santiago edita el Excel normalmente
        ▼
Robot local (Python)  ──cada 3 horas──►  Tabla en Neon: dashboard_snapshots
        │                                          │
   Tarea Programada de Windows                     ▼
                                          Backend Render lee el snapshot
                                                   │
                                                   ▼
                                          Dashboard muestra los datos
```

### Piezas
| Archivo / recurso | Función |
|---|---|
| `scripts/push_clientes_contabilidad_a_neon.py` | Procesa el Excel (reusa `extract_clientes_contabilidad.py`) y hace UPSERT del JSON en Neon. |
| `scripts/actualizar_contabilidad_nube.bat` | Lanza el script con el Python correcto y deja registro en `push_contabilidad.log`. |
| `scripts/.env` | Config local (**NO se sube a git**): ruta del Excel + cadena de conexión a Neon. |
| Tarea Programada `Sepia - Actualizar Contabilidad Nube` | Corre el `.bat` **cada 3 horas**. |
| Tabla Neon `mercado_libre_oficial.dashboard_snapshots` | Guarda el snapshot (`clave`, `payload` JSONB, `actualizado_en`). |

- **Excel oficial:** `C:\Users\SANTIAGO\One Drive\OneDrive\Excel sepia\Datos Clientes Y Contabilidad.xlsx`
  (ojo: hay varias copias en el PC; esta es la buena. La carpeta "One Drive" lleva espacio.)
- **Python usado:** el global `C:\Users\SANTIAGO\AppData\Local\Python\pythoncore-3.14-64\python.exe`
  (el `.venv` de la raíz NO tiene `psycopg2`; el global sí tiene todo.)

### Uso diario
- **No tienes que hacer nada.** Editas el Excel como siempre; el robot actualiza la nube cada 3 horas.
- **Para forzar una actualización inmediata:** doble clic en
  `D:\dash board sepia BI\scripts\actualizar_contabilidad_nube.bat`
- El robot **funciona aunque tengas el Excel abierto** (se arregló para copiarlo con PowerShell).
- **Condición:** el PC debe estar encendido para que el robot corra.

### Revisar que el robot esté corriendo bien
- Log de la última corrida: `scripts/push_contabilidad.log` (debe terminar en `codigo de salida 0`).
- Ver la tarea: abre "Programador de tareas" de Windows → busca `Sepia - Actualizar Contabilidad Nube`.

---

## 3. Arreglos aplicados en esta migración (referencia técnica)

| Problema | Causa | Arreglo (commit) |
|---|---|---|
| 404 en rutas internas (ej. `/ordenes`) en Netlify | SPA sin fallback | `public/_redirects` + `netlify.toml` |
| "Failed to fetch" en el dashboard | CORS: Netlify no autorizado en el backend | `FRONTEND_ORIGINS` en Render |
| "Tu sesión expiró" en bucle | Cookie `SameSite=Lax` no viaja entre dominios distintos | `dashboardAuth.js`: cookie `SameSite=None; Secure` en https (d534f77) |
| Meta Ads: error en la nube | Intentaba leer Excel/Python inexistentes | `metaAdsSalesService.js` tolera Excel ausente y sirve la BD (3b230cc) |
| Clientes/Contabilidad: "No se pudo procesar el archivo" | Lee Excel local + Python, no existen en Render | Robot local + lectura de snapshot en Neon (27c40f3) |
| El robot fallaba al copiar el Excel | `cmd copy` no puede con archivo abierto en Excel/OneDrive | `extract_clientes_contabilidad.py`: copia con PowerShell Copy-Item |

### Nota sobre la vía descartada (Azure / Microsoft Graph)
Se intentó leer el Excel directo de OneDrive con Microsoft Graph, pero la cuenta personal de Microsoft (basada en Gmail) **no tiene un "directorio" propio** y Azure rechaza registrar apps sin él. Por eso se optó por el **robot local**, que es más simple, seguro y reutiliza el código existente.

---

## 4. Pendientes

- 🔒 **Rotar la contraseña de Neon** (quedó expuesta en conversaciones). Al cambiarla hay que actualizarla en **2 lugares**:
  1. Render → variables de entorno del backend.
  2. `scripts/.env` en el PC (la cadena `NEON_DATABASE_URL` del robot).
- ⚙️ **Fase 3** (opcional): GitHub Actions para mantener Render despierto y/o disparar el sync de MeLi automáticamente.
- 🧹 Limpieza menor: actualizar `.env` locales (frontend y `sepia meli api`) que conservan valores viejos (ngrok / localhost). No afecta la nube.
- 📈 A futuro: el robot también puede refrescar Meta Ads (`carga_ventas_meta_ads.py`) si se quiere.

---

## 5. Resolución rápida de problemas

| Síntoma | Qué revisar |
|---|---|
| El dashboard no carga datos | ¿Render está "Live"? Puede estar despertando (~50 s). Recarga. |
| "Failed to fetch" | ¿Cambió la URL de Netlify? Actualiza `FRONTEND_ORIGINS` en Render. |
| "Tu sesión expiró" al instante | Revisar que el backend tenga el fix de cookie (commit d534f77) desplegado. |
| Clientes/Contabilidad sin datos o desactualizado | Correr el `.bat` a mano y revisar `push_contabilidad.log`. Verificar que el PC esté encendido. |
| El robot da error de conexión | Revisar `NEON_DATABASE_URL` en `scripts/.env` (¿cambió la contraseña de Neon?). |
