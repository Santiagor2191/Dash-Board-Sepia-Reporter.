# Sepia MeLi MCP

Servidor MCP que expone a Claude las herramientas para consultar ordenes, inventario, ventas historicas y conversion de la tienda Sepia en Mercado Libre.

Corre como proceso local que Claude Code lanza solo cuando lo necesita (transport stdio).

## Tools expuestas

| Tool | Que hace | Fuente |
|---|---|---|
| `obtener_ordenes_hoy` | Ordenes del dia con monto, comprador y estado | API MeLi |
| `obtener_ordenes_rango` | Ordenes entre dos fechas | API MeLi |
| `inventario_alertas` | Productos por nivel de alerta (critico/bajo/medio/ok) | API MeLi |
| `stock_producto` | Stock y dias de cobertura de un SKU/item | API MeLi |
| `historico_ventas` | Ventas historicas con filtros (categoria, mes, producto) | PostgreSQL `ventas_ml` |
| `top_productos` | Ranking por ingresos o cantidad en un periodo | PostgreSQL `ventas_ml` |
| `visitas_y_conversion` | Visitas, ventas y % conversion por producto + diagnostico | API MeLi |

## Setup paso a paso

### 1. Instalar dependencias

```powershell
cd "D:\dash board sepia BI\Sepia-meli-mcp"
npm install
```

### 2. Configurar .env

```powershell
Copy-Item .env.example .env
notepad .env
```

Completa estos valores (copialos del `.env` del backend, `sepia meli api\.env`):

```
MELI_CLIENT_ID=...
MELI_CLIENT_SECRET=...
DB_PASSWORD=...
```

Las demas variables ya tienen defaults razonables.

### 3. Registrar el redirect URI del MCP en MeLi

MeLi solo acepta redirect URIs HTTPS. Aprovechamos el ngrok del backend.

Esto se hace **una sola vez**:

1. Entra a **https://developers.mercadolibre.com.co/devcenter** con tu cuenta.
2. Abre tu aplicacion (la misma que usa el backend).
3. Busca la seccion **"URIs de redireccion"**.
4. **Agrega** esta URI nueva (la del backend con un path distinto):
   ```
   https://nontransposable-veda-unintrudingly.ngrok-free.dev/mcp-callback
   ```
5. **No quites** la URI del backend que ya tienes (`/auth/mercadolibre/callback`). Tendras dos.
6. Guardar cambios.

Si tu URL de ngrok es diferente, ajusta `MCP_REDIRECT_URI` en `.env` y registra la URI correspondiente.

### 4. Autorizar el MCP (one-shot)

**Pre-requisito**: el backend Express tiene que estar corriendo (porque ngrok apunta a el).

```powershell
npm run authorize
```

Lo que va a pasar:
1. El script levanta un servidor local en `http://127.0.0.1:8765/internal-callback`.
2. Te abre el navegador en la pagina de login de MeLi.
3. Le das **"Permitir"**.
4. MeLi te redirige a `https://...ngrok.../mcp-callback?code=...`.
5. El backend reenvia (HTTP 302) a `http://127.0.0.1:8765/internal-callback?code=...`.
6. El script captura el code, lo cambia por tokens y los guarda en `.tokens.json`.
7. Veras un mensaje **"Listo"** en el navegador y `[OK] Tokens guardados` en consola.

Despues de esto el MCP se refresca los tokens solo. **No vuelves a correr este paso** salvo que pierdas `.tokens.json` o MeLi revoque la autorizacion. Y el backend ya **no es necesario** para el funcionamiento normal del MCP.

### 5. Registrar el MCP en Claude Code

```powershell
claude mcp add sepia-meli node "D:\dash board sepia BI\Sepia-meli-mcp\src\index.js"
```

Verifica:

```powershell
claude mcp list
```

### 6. Probar

Abre una nueva conversacion en Claude Code y prueba:
- *"Cuantas ordenes tuve hoy?"*
- *"Que productos estan en stock critico?"*
- *"Top 10 productos mas vendidos en 2026"*
- *"Cuales son mis productos con muchas visitas pero pocas ventas?"*

## Estructura

```
Sepia-meli-mcp/
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── index.js              # Entry point MCP (stdio)
    ├── config.js             # Vars de entorno
    ├── tokenStore.js         # Persistencia de tokens MeLi
    ├── meliClient.js         # Cliente axios + refresh automatico
    ├── dbPool.js             # Pool PostgreSQL
    ├── bin/
    │   └── authorize.js      # Script OAuth standalone (npm run authorize)
    └── tools/
        ├── ordenes.js        # obtener_ordenes_hoy, obtener_ordenes_rango
        ├── inventario.js     # inventario_alertas, stock_producto
        ├── historico.js      # historico_ventas, top_productos
        └── conversion.js     # visitas_y_conversion
```

## Notas

- **Independencia en runtime**: una vez autorizado, el MCP es independiente. Puedes apagar el backend Express, el MCP sigue funcionando con sus propios tokens.
- **Backend solo necesario para autorizar**: el flujo OAuth reusa el ngrok del backend (porque MeLi exige HTTPS y el MCP corre en HTTP local). Despues de la autorizacion inicial el MCP no toca al backend.
- **Mismo client_id**: ambos comparten la app de MeLi (mismo `client_id`/`client_secret`), pero usan redirect URIs distintos (`/auth/mercadolibre/callback` vs `/mcp-callback`).
- **Cache**: a diferencia del backend, el MCP no cachea entre llamadas. Cada pregunta a Claude hace queries frescas. Si se vuelve lento, podemos agregar cache despues.
- **Refresh de tokens**: automatico cuando se acercan al vencimiento (60s de buffer). Se reescribe `.tokens.json` cada vez.
