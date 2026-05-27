# Fase 4 — OneDrive API (Microsoft Graph)

**Duracion estimada**: 1 a 2 dias.

**Pre-requisito**: Fases 1-3 listas.

**Lo que vas a tener al final**:
- El backend en Render puede **descargar los Excel de tu OneDrive** automaticamente.
- Tus ETL Python ya no dependen de tu PC.
- Tu Excel sigue donde esta — tu lo editas en OneDrive, el sistema lo lee solo.

---

## 4.1 Entender que va a pasar

Hoy tus scripts Python hacen:
```python
pd.read_excel("C:\\Users\\SANTIAGO\\OneDrive\\Excel sepia\\Mercado LibreOFICIAL.xlsx")
```
Eso solo funciona en tu PC porque OneDrive sincroniza el archivo localmente.

En la nube vamos a:
1. Registrar una "app" en Microsoft (Azure AD) para poder hablar con la API de OneDrive.
2. Hacer un flujo OAuth (como el de MeLi) la primera vez para que autorices a la app a leer tu OneDrive.
3. El backend guarda esos tokens en Postgres (igual que los de MeLi tras Fase 1).
4. Cuando el ETL corre, descarga el Excel via API a una carpeta temporal, lo procesa, lo borra.

**Importante**: solo lectura (`Files.Read`), nada de escribir/borrar en tu OneDrive.

## 4.1.1 Decision importante: Excel NO debe ser la base final

Para la nube, no conviene que Excel sea la base de datos principal. Excel debe quedar como **fuente de entrada editable por el negocio**, y PostgreSQL debe ser la **base real** que consulta el dashboard.

Arquitectura recomendada:

```text
Excel en OneDrive
      ↓
Backend en nube descarga el archivo
      ↓
ETL valida y transforma datos
      ↓
PostgreSQL guarda tablas limpias
      ↓
Dashboard consulta PostgreSQL, no el Excel directamente
```

Esto permite que el equipo siga editando el Excel como hoy, pero el sistema gana estabilidad, historico, validaciones y consultas rapidas. El backend no deberia recalcular todo desde Excel en cada request del dashboard; lo correcto es cargar/sincronizar datos hacia tablas y servir desde Postgres.

### Opciones posibles

**Opcion A — Recomendada: OneDrive como fuente, Postgres como base**

- Mantienes el Excel en OneDrive.
- El backend lo descarga con Microsoft Graph.
- Los scripts ETL procesan el archivo.
- Los resultados se guardan en Neon/Postgres.
- El dashboard consulta Postgres.

Es la mejor transicion porque no cambia el flujo actual del negocio.

**Opcion B — Mas simple al principio: upload manual desde dashboard**

- El usuario sube el Excel desde una pantalla interna.
- El backend procesa ese archivo.
- Los resultados se guardan en Postgres.

Evita pelear con Microsoft Graph al inicio, pero exige subir el archivo manualmente cada vez.

**Opcion C — Mas madura: reemplazar hojas criticas por pantallas internas**

- Costos, clientes o configuraciones se editan directamente en el dashboard.
- Postgres guarda los cambios.
- Excel deja de ser necesario para esas tablas.

Es mejor a largo plazo, pero requiere construir UI, permisos, validaciones e historial de cambios.

### Ruta recomendada para Sepia BI

1. Migrar el Excel actual a tablas Postgres con scripts de carga.
2. Dejar el Excel en OneDrive como fuente editable.
3. Automatizar la descarga con Microsoft Graph.
4. Hacer que los ETL actualicen tablas limpias en Postgres.
5. Hacer que el dashboard consulte siempre Postgres.
6. Mas adelante, reemplazar las hojas mas criticas por pantallas internas.

Regla de diseno: **Excel puede iniciar el dato, pero Postgres debe servir el dato**.
---

## 4.2 Registrar la app en Azure AD

### Pre-requisitos
- Cuenta Microsoft (la misma del OneDrive, normalmente personal o de uniminuto.edu segun cual lo aloje).

### Pasos

1. Entra a **https://portal.azure.com** con tu cuenta.
2. Buscar **"App registrations"** → **"New registration"**.
3. Llenar:
   - **Name**: `sepia-bi-onedrive`
   - **Supported account types**:
     - Si tu OneDrive es **personal** (outlook.com, hotmail.com): elige "Personal Microsoft accounts only".
     - Si es **del trabajo/escuela** (uniminuto.edu): elige "Accounts in this organizational directory only" (single tenant).
     - Si no estas seguro: elige "Accounts in any organizational directory and personal Microsoft accounts" (cubre los dos).
   - **Redirect URI**:
     - Tipo: **Web**
     - URL: `https://sepia-backend.onrender.com/auth/onedrive/callback`
4. **Register**.

Te muestra la pagina de tu app con:
- **Application (client) ID** → cópialo, sera `MS_CLIENT_ID`.
- **Directory (tenant) ID** → cópialo, sera `MS_TENANT_ID`.

### Crear el client secret

1. En la app: **Certificates & secrets** → **New client secret**.
2. Description: `sepia-bi-prod`.
3. Expires: **24 months** (despues hay que renovarlo, te avisa Azure).
4. **Add** → cópia el "Value" (NO el "Secret ID") inmediatamente. Sera `MS_CLIENT_SECRET`.

### Configurar permisos

1. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**.
2. Marca:
   - `Files.Read` (leer tus archivos)
   - `offline_access` (refresh tokens)
   - `User.Read` (basico de identidad)
3. **Add permissions**.
4. **"Grant admin consent"** si te lo pide (solo aplica en cuentas organizacionales).

---

## 4.3 Codigo del cliente OneDrive

> Esta seccion es para que entiendas lo que se va a anadir. La escribo yo cuando arranquemos la fase, pero asi sabes que va.

### Variables de entorno en Render

```
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
MS_TENANT_ID=...  ← "common" si elegiste cuentas mixtas, sino el ID que copiaste
MS_REDIRECT_URI=https://sepia-backend.onrender.com/auth/onedrive/callback
ONEDRIVE_EXCEL_PATH=/Excel sepia/Mercado LibreOFICIAL.xlsx
```

> `ONEDRIVE_EXCEL_PATH` es la ruta DENTRO de tu OneDrive (raiz = `/`).

### Modulo nuevo: `src/services/oneDriveClient.js`

Misma logica que `meliClient.js` pero contra Microsoft Graph:
- OAuth con `client_id`, `client_secret`, `redirect_uri`.
- Refresh automatico de tokens.
- Funcion `downloadFile(path)` que devuelve el binario del Excel.

### Tabla nueva en Neon: `onedrive_tokens`

```sql
CREATE TABLE onedrive_tokens (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Adaptar `clientesContabilidadService.js`

Hoy invoca Python pasandole una ruta local. Pasara a:
1. Llamar `oneDriveClient.downloadFile(ONEDRIVE_EXCEL_PATH)` → guarda en `/tmp/excel.xlsx`.
2. Invocar el script Python pasandole `/tmp/excel.xlsx`.
3. Borrar el temp.

El script Python no cambia su logica de parsing, solo el archivo que lee.

Tambien hay que adaptar `metaAdsSalesService.js`, porque hoy usa el mismo Excel local y hace `stat(excelPath)` para decidir si sincroniza. En nube, la cache debe depender de un identificador de OneDrive, por ejemplo `lastModifiedDateTime`, `eTag` o `cTag`, no del `mtime` local.

Revisar dependencias Python antes de Render:

- `pandas`
- `openpyxl`
- cualquier otra libreria importada por `scripts/extract_clientes_contabilidad.py` y `scripts/carga_ventas_meta_ads.py`

Render no instalara dependencias Python automaticamente si solo corre `npm install`. Hay que documentar/agregar un paso de build que instale `requirements.txt`, o mover el parsing a Node si se quiere simplificar el runtime.

### Endpoints nuevos en `authRoutes.js`

- `GET /auth/onedrive` — dispara OAuth.
- `GET /auth/onedrive/callback` — recibe el code y guarda tokens.

---

## 4.4 Primera autorizacion

Una vez el codigo este en produccion:

1. Abre `https://sepia-backend.onrender.com/auth/onedrive` en el navegador.
2. Microsoft te pide login (la cuenta de tu OneDrive).
3. Te muestra que la app `sepia-bi-onedrive` quiere `Files.Read`. **Acepta**.
4. Te redirige al callback, el backend guarda los tokens en Neon.
5. A partir de aqui, refresca solo. Vuelves a autorizar solo si los tokens caducan completamente (60 dias sin uso).

---

## 4.5 Verificar end-to-end

1. Edita tu Excel en OneDrive (cambia una celda).
2. Espera 1-2 min para que OneDrive sincronice en la nube de Microsoft.
3. Disparas el ETL: `POST https://sepia-backend.onrender.com/admin/sync-clientes` (o el endpoint que tenga tu app).
4. Veras en los logs de Render:
   ```
   [onedrive] Descargando /Excel sepia/Mercado LibreOFICIAL.xlsx ...
   [onedrive] OK 8.4 MB descargado en 2.1s
   [etl] Procesando 8.500 filas ...
   ```
5. La nueva info debe reflejarse en tu dashboard.

---

## 4.6 Limites de Microsoft Graph

- **Rate limit**: ~10.000 requests / 10 minutos. Imposible llegar para tu uso.
- **Tamaño max de archivo via API**: 250 MB. Tus Excel estan en <10 MB.
- **Tokens**: access token vive 1h, refresh token 90 dias (renovable automatico mientras lo uses).

---

## 4.7 Si algo sale mal

- **"AADSTS50011: Reply URL mismatch"**: el `redirect_uri` que envia el backend no coincide con el registrado en Azure. Verifica que sea exactamente el mismo string.
- **"invalid_grant"**: refresh token caducado. Vuelve a hacer `/auth/onedrive` una vez.
- **"itemNotFound" al descargar**: la ruta del archivo en OneDrive cambio. Revisa `ONEDRIVE_EXCEL_PATH`.
- **"Forbidden" para tu cuenta organizacional**: tu administrador (uniminuto) puede haber bloqueado apps de terceros. Hablar con IT o usar una cuenta personal.

---

## 4.8 Alternativa si OneDrive es un dolor

Si en algun momento te canses de pelear con Azure AD, hay una salida:

**Migrar el Excel a Google Sheets**:
- Subes el Excel a Google Drive, lo abres como Sheet.
- Registras una app en Google Cloud (mas amigable que Azure).
- Usas la API de Sheets en lugar de Graph.
- Ventaja: trabajar en Sheets es colaborativo y mas estable.

Esto duplica el trabajo de esta fase, pero es una opcion si Azure resulta hostil.

---

## Resumen de Fase 4

- [x] Backend lee tus Excel directamente de OneDrive
- [x] No dependes de tu PC ni para los ETL
- [x] Tokens persistentes en BD, refresh automatico
- [x] Tu flujo de trabajo con OneDrive no cambia

**Estado final**: el proyecto corre **100% en la nube**. Tu PC es solo otro cliente mas.

---

## Que queda fuera (por si lo necesitas mas adelante)

- **Backups de la BD**: Neon hace backups automaticos (point-in-time recovery 7 dias en plan gratis).
- **Logs persistentes**: Render guarda logs 7 dias. Si quieres mas, integrar Logtail/Better Stack (free tier 1 GB/mes).
- **Alertas**: si el sync falla 3 veces seguidas, recibir email. Se hace con un step extra en el workflow de GitHub Actions.
- **Multi-usuario**: el sistema asume 1 admin. Si crece, hay que migrar a sesiones por usuario y roles.

Cuando quieras alguno de esos, lo documentamos aparte.
