# Changelog — Dashboard Sepia BI

## 2026-06-18

### Datos / confiabilidad
- **Desglose de paquetes**: las 327 ventas "Paquete de N productos" (importadas del Excel oficial) se desarmaron en 765 filas de productos reales, consultando MeLi (`/packs` → `/orders`). Reparte el valor exacto de cada paquete entre sus productos (bruto y neto cuadran al peso). Script reusable: `sepia meli api/backfill_packs.mjs` (correr con `--apply` tras cada import de Excel).
- Validación Excel vs base de datos: el bruto cuadra **exacto** 2021–mayo 2026; la única diferencia anual es el mes en curso (junio, que el dashboard ya tiene en vivo).

### Analytics
- Tarjetas KPI renombradas para igualar al Dashboard: "Revenue Total" → **Ingresos Sepia** (neto), "Ingresado Neto" → **Precio de Venta** (bruto). Antes los nombres estaban invertidos respecto a su significado.
- "Precio de Venta" y "Ticket Promedio" ahora usan el mismo cálculo que el Dashboard (bruto de todas las órdenes / órdenes).

### Rankings de productos
- "Top productos" (Analytics) y "Productos más vendidos" (Dashboard) excluyen wrappers genéricos sin desglose ("Paquete de N productos", "1 paquete", "Paquete 2", filas sin nombre). Su plata sigue contando en los totales; solo se ocultan del ranking. Helper `isRealProduct` en `utils.js`.

### Meta Ads
- Extractor reescrito (`scripts/carga_ventas_meta_ads.py`): la serie mensual de Meta Ads se calcula desde la hoja **"Datos clientes"** + **"Data publicidad"** del Excel (antes leía una hoja que ya no existe). Coincide con las tablas dinámicas. 25 meses (jun 2024–jun 2026) cargados a `ventas_meta_ads_mensual`. Nota: "Costo producto" ya es total de línea (no se multiplica por cantidad).

### Bugs de producción (post-deploy)
- **Zona horaria (crítico)**: `getVentas` armaba la fecha según la zona del servidor. Render corre en UTC → las ventas del día 1 (medianoche Colombia) salían como mes anterior e inflaban los totales (~$94k en "Ene–May 2026"). Fix: fecha desde `anio/num_mes/dia` a mediodía UTC, estable en cualquier zona.
- **Caché del navegador**: las peticiones GET no desactivaban caché → el dashboard mostraba datos viejos aun recargando. Fix: `cache: "no-store"` en `api.js`.

### Despliegue
- Publicado a producción: frontend (Netlify) + backend (Render). Verificado: 2026 Ene–May cuadra al peso con el Excel ($35.667.243).

## 2026-06-17

### Apariencia
- Glassmorphism sutil (vidrio esmerilado) en tarjetas KPI y paneles, alineado al acento copper. Fondo con manchas cobrizas suaves, saturación y filo de luz; lift al pasar el mouse sobre las KPI.

### Dashboard (página principal)
- KPIs reordenados: Precio de Venta, Ingresos Sepia, Cargos por Venta, Costo Producto, Utilidad Neta, Órdenes Totales, Unidades Vendidas, Ticket Promedio.
- Nueva ficha **Unidades Vendidas** (suma de cantidades, con % de cambio).
- Quitada la ficha **Margen %**.
- "Últimas órdenes" reemplazada por **Productos más vendidos** (ranking por unidades, top 15, con export CSV).

### Analytics
- Nueva sección **Inteligencia del negocio** (datos que el backend ya calculaba pero no se mostraban): estacionalidad por mes, productos en caída, ciudades top y combos (productos que se compran juntos).
- Nueva sección **Devoluciones y cancelaciones**: tasa del periodo + productos que más se cancelan/devuelven.
- Nueva sección **Clientes que repiten**: % de recompra y mejores clientes.

### Inventario
- Nueva sección **Reposición sugerida**: lista de compra con cuánto reponer por producto, según velocidad de venta y cobertura elegible (30/45/60 días). Export CSV.

### Backend / datos
- "Ciudades top" agrupa las 20 localidades de Bogotá en una sola "Bogotá" (antes aparecían fragmentadas como ciudades distintas). Filtra ciudades en blanco.

### Infraestructura local
- `.env.production` apunta al backend de Render al construir; `.env` (localhost:3001) queda solo para desarrollo.
- `iniciar-dashboard-local.bat` para levantar backend + frontend en local con doble clic.
