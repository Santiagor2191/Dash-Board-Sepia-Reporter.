# Changelog — Dashboard Sepia BI

## 2026-07-11

### Meta Ads
- El filtro del histórico mensual (antes chips de Años/Meses) ahora es el mismo **selector de fechas estilo Meta**, extraído a componente compartido `MetaDateRangePicker.jsx`. Presets extra para histórico: Este año, El año pasado y Máximo (default). Los KPIs, gráficas comparativas y Top 10 productos se recalculan con el rango elegido; "restablecer" vuelve a Máximo.
- Helpers de fecha (`fmtYmd`, `daysAgo`, `prettyDate`) movidos a `utils.js`.

### Filtro global del tablero
- La barra superior (Dashboard/Analytics/Órdenes/etc.) reemplazó el sistema "Año/Mes + Rango libre + Aplicar" por el **selector de fechas estilo Meta** compartido; los rangos aplican al instante y Mensual/Trimestral/Anual también. Se eliminó `MultiSelectDropdown` (~80 líneas menos). Nota: ya no hay selección de meses salteados, el filtro es siempre un rango continuo.

### Redes — versión profesional con recomendaciones
- **Comparación con el periodo anterior** en los KPIs de Instagram (alcance, vistas, interacciones, visitas al perfil, nuevos seguidores): el backend trae la ventana previa de igual duración y cada tarjeta muestra su % de cambio.
- **Panel "Recomendaciones"** calculado con reglas sobre los datos reales: cadencia de publicación (meta 3–4/semana), formato ganador (video/foto/carrusel por interacciones promedio), tendencia de alcance, engagement sobre alcance (referencia 1–3%) y reparto de pauta FB/IG (>80% en FB dispara aviso de ubicaciones).
- Encabezado con perfil: foto de @sepiamodaymas (link al perfil), seguidores y publicaciones. KPI nuevo de **Engagement %**. Gráfica de alcance como área con relleno copper. Tabla de publicaciones con columna de interacciones y la mejor del grupo marcada. Pauta por plataforma con **costo por 1.000 personas alcanzadas**.

### Nueva página "Redes"
- **Instagram @sepiamodaymas**: seguidores, nuevos seguidores, alcance, vistas, visitas al perfil, interacciones, gráfica de alcance por día y últimas 12 publicaciones con likes/comentarios/link. **Facebook Sepia Moda y Más**: seguidores, interacciones, visitas y videos.
- Backend: `metaSocialService.js` + `GET /db/meta-redes?since&until` (cache 15 min por rango). Límite de Meta manejado: IG entrega máx. 30 días por consulta → se recorta al final del rango y se avisa en la UI.
- Token regenerado como usuario del sistema (no vence) con permisos +`instagram_basic` +`instagram_manage_insights` tras agregar el caso de uso de Instagram a la app "Ads For Manus".

## 2026-07-10

### Meta Ads — métricas en vivo
- Nueva sección **"Campañas Meta en vivo"** en Ventas Meta Ads: gasto, conversaciones de WhatsApp, costo por conversación, pedidos, costo por pedido y CTR de los últimos 30 días, por anuncio, leídos directo de la API de Meta (Graph v23.0). Servicio nuevo `metaAdsLiveService.js` + endpoint `GET /db/meta-ads-live` (sesión requerida, cache 15 min).
- Nueva sección **"Recomendaciones de la IA de Meta"**: sugerencias que Meta genera para campañas y conjuntos activos.
- **Alerta de presupuesto desalineado**: si un anuncio concentra >40% del gasto con costo por pedido >2x el mejor, el dashboard lo marca (Meta reparte plata hacia el CPM barato, no hacia el que más vende).
- Config: `META_ACCESS_TOKEN` y `META_AD_ACCOUNT_ID` en el `.env` del backend (y en Render para producción). El token de usuario extendido dura ~60 días; al vencer, la sección lo avisa con mensaje claro.
- **Filtro de fechas estilo Meta Ads Manager**: botón de periodo en "Campañas Meta en vivo" con panel de presets (Hoy, Ayer, Últimos 7/14/28/30/90 días, Esta semana, La semana pasada, Este mes, El mes pasado) + rango personalizado Desde/Hasta, con Cancelar/Actualizar. El backend acepta `?since=YYYY-MM-DD&until=YYYY-MM-DD` (fechas inválidas caen al default de 30 días); cache de 15 min por rango.

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
