# Inventario Unificado (Mercado Libre + Shopify)

Plan y diseño de una página de inventario que muestre el stock real combinado
y se descuente automáticamente cuando se vende por Mercado Libre o Shopify.

**Fecha de diseño:** 2026-06-01
**Estado:** 🟡 EN DISEÑO — todavía no se ha construido nada. Pendiente de retomar
después de terminar el despliegue cloud (ver [`../despliegue-cloud/`](../despliegue-cloud/)).

---

## ¿Qué quiere Santiago?

Una página especial donde el inventario:

1. Se vea unificado (un stock maestro por producto).
2. Se descuente automáticamente cuando se vende por **Mercado Libre**.
3. Se descuente automáticamente cuando se vende por **Shopify**.

Hoy el inventario real vive en un Excel:
`C:\Users\SANTIAGO\One Drive\OneDrive\Excel sepia\Template - copia (2).xlsm`
(estructura documentada en [`estructura-excel-actual.md`](estructura-excel-actual.md)).

---

## Estado actual del sistema (lo que ya existe)

- **Página Inventario actual** (`sepia-dashboard-Fronted/src/pages/Inventario.jsx`):
  solo **lee** el stock de Mercado Libre vía API (cantidad disponible, vendida,
  velocidad de venta, alertas). **No administra ni descuenta** nada.
  Lógica en `sepia meli api/src/routes/meliRoutes.js` (`computeStockAlert`,
  consulta `/users/{sellerId}/items/search` + `/items`).
- **Shopify:** no hay ninguna integración. La tienda existe pero **sin API configurada**.
- **Excel:** es el maestro real del inventario. Modelo clásico:
  `Stock = Existencia Inicial + Entradas − Salidas`.

---

## Decisiones tomadas con Santiago (2026-06-01)

| Pregunta | Respuesta de Santiago |
|---|---|
| ¿Cómo está Shopify? | **Existe pero sin API configurada** |
| ¿Alcance del inventario? | **Solo vista unificada primero** (no anti-sobreventa todavía) |
| ¿Dónde vive el maestro? | **Seguir editando en Excel** (el Excel es el maestro) |

---

## La tensión clave (y cómo se resuelve)

> Santiago quiere **seguir editando en Excel** Y que el stock **se descuente solo**.
> Un archivo Excel que él edita a mano **no puede ser modificado por el dashboard
> al mismo tiempo** — no pueden ser ambos "dueños" del número.

**Solución: modelo "foto base − ventas posteriores".** Respeta el Excel sin tocarlo:

```
Disponible en vivo  =  Stock del Excel (a la fecha en que se subió)
                       −  vendido en MeLi   después de esa fecha
                       −  vendido en Shopify después de esa fecha
```

- Se toma una "foto" de la columna **Disponible** del Excel + la fecha de importación.
  **NO se modifica el archivo .xlsm.**
- El dashboard resta en vivo lo vendido *después* de esa foto.
- Cuando Santiago actualiza su Excel (entradas, ajustes), vuelve a subirlo y la
  foto se refresca.

Así el Excel sigue siendo el maestro, Santiago trabaja igual que hoy, y la página
muestra el disponible real al minuto, sin riesgo de que el sistema y él se pisen.

⚠️ **Cuidado con el doble conteo:** hay que definir bien la fecha de corte de la
"foto". Si la hoja `Salidas` del Excel ya incluye ventas recientes de MeLi (porque
se cargaron del Excel oficial), restar otra vez esas mismas ventas las contaría dos
veces. La regla: solo restar ventas con fecha **posterior** al timestamp de importación.

---

## El tope de Shopify

**Sin API, no se pueden leer las ventas de Shopify automáticamente.** Dos caminos:

- **Opción A — Activar la API (recomendada):** crear una "app personalizada" en el
  panel de administración de Shopify → da un token de Admin API (~10 min). Con eso
  las ventas de Shopify entran solas, igual que las de MeLi.
- **Opción B — Importación manual:** exportar periódicamente las ventas de Shopify
  a Excel y subirlas. Funciona pero es manual y se desactualiza.

> ⏳ Pendiente de que Santiago decida entre A y B.

---

## Plan por etapas

### Etapa 1 — Vista unificada con lo que ya tenemos
- Importar la "foto base" del Excel (SKU + Disponible + fecha) a una tabla en Neon.
  **Solo lectura del Excel; no se modifica.**
- Construir página **"Inventario Unificado"** con descuento automático de **MeLi**
  (las órdenes ya se sincronizan a `ventas_ml`).
- Shopify aparece en la tabla pero en cero hasta conectarlo.
- Columnas sugeridas: Codigo de producto · Descripción · Color · Talla ·
  Stock base (Excel) · Vendido MeLi (desde fecha) · Vendido Shopify · **Disponible en vivo** · Alerta.

### Etapa 2 — Conectar Shopify
- Activar la API de Shopify (Opción A) → sus ventas también descuentan solas.
- Mapear cada producto (SKU "Codigo de producto") a su variante de Shopify.

### Etapa 3 — Anti-sobreventa (futuro)
- Empujar el stock actualizado a los dos canales (MeLi `PUT /items/{id}` +
  Shopify Inventory API) para que ninguno venda lo que ya no existe.
- **Requiere mover el maestro del Excel a la base de datos.** Se deja para cuando
  Santiago lo necesite.

---

## El mapeo de productos (SKU)

La llave que une todo es **"Codigo de producto"** del Excel. Cada SKU debe mapear a:
- Su(s) **# Publicacion** de Mercado Libre (ya está en el Excel).
- Su **variante de Shopify** (pendiente, cuando se conecte la API).

---

## Preguntas abiertas para retomar

1. ¿El modelo "foto base − ventas posteriores" le sirve a Santiago? (confirmado en
   concepto, validar al construir).
2. Shopify: ¿Opción A (activar API) u Opción B (importación manual)?
3. ¿La hoja `Salidas` del Excel ya incluye ventas de MeLi? (define la fecha de corte
   para no doble-contar).
4. ¿"Codigo de producto" es único y consistente entre MeLi y Shopify?

---

## Orden recomendado

Terminar primero el **despliegue cloud** (faltan 2 pasos chicos) y luego arrancar
esto en una rama aparte. Acordado con Santiago el 2026-06-01.
