# Estructura del Excel de inventario actual

Análisis del archivo que Santiago usa hoy como maestro de inventario.

**Archivo:** `C:\Users\SANTIAGO\One Drive\OneDrive\Excel sepia\Template - copia (2).xlsm`
**Analizado:** 2026-06-01 (con `openpyxl`, solo lectura)

---

## Hojas del libro (23 en total)

| Hoja | Filas | Cols | Rol aparente |
|---|---|---|---|
| `INDICE` | 14 | 5 | Índice de navegación |
| **`Inventario`** | 1233 | 26 | **Maestro de inventario (vista global)** |
| `B-Inventarios3` | 104 | 14 | Sub-inventario / respaldo |
| `B-Inventarios2` | 57 | 14 | Sub-inventario / respaldo |
| `B-Inventarios2-3` | 57 | 15 | Sub-inventario / respaldo |
| **`Entradas`** | 1042 | 12 | **Log de entradas (compras/reposición)** |
| **`Salidas`** | 3673 | 13 | **Log de salidas (ventas)** |
| `X Pagina` | 3673 | 7 | Auxiliar de Salidas |
| `Paq-Flex` | 61 | 12 | Paquetería Flex (MeLi) |
| `T_F_ML_Int` | 301 | 14 | Tabla/formato MeLi interno |
| `Color` | 152 | 6 | Catálogo de colores |
| `Tallas_Pantalon` | 17 | 8 | Catálogo de tallas |
| `Costo` | 61 | 3 | Costos |
| `Datos-No agrupados` / `Datos-Agrupados` / `D-Agru-1` | varias | | Tablas dinámicas / análisis |
| `Dashboard-Pedidos`, `TD`, `Set 15 Años`, `Hoja2/3/4/6` | varias | | Dashboards y hojas sueltas |

Las hojas que importan para el inventario unificado son **`Inventario`**, **`Entradas`** y **`Salidas`**.

---

## Hoja `Inventario` (maestro) — encabezado en fila 4

| Columna | Significado |
|---|---|
| **Codigo de producto** | SKU interno (llave del producto). Ej: `141`, `98`, `143` |
| **# Publicacion** | ID de publicación en Mercado Libre (enlace al canal MeLi) |
| Descripción | Nombre del producto |
| Color | Color |
| Talla | Talla |
| Existencia Inicial | Stock de arranque |
| Entradas | Total de entradas (suma del log) |
| Salidas | Total de salidas (suma del log) |
| **Stock** | `Existencia Inicial + Entradas − Salidas` |
| **Disponible** | Disponible real → **esta es la columna que se importa como "foto base"** |
| Imagen | Imagen del producto |
| Observaciones / Observaciones2 | Notas |
| Precio Unidad | Precio |

---

## Hoja `Entradas` (log de reposiciones) — encabezado fila 1

`No. de compra · Fecha · Mes · Código · Descripción · Color · Talla · Cantidad · Observaciones · STOCK`

Cada fila es una entrada de mercancía. `Código` = SKU interno.

---

## Hoja `Salidas` (log de ventas) — encabezado en fila 4

`No. de compra · Fecha · Mes · Código · Descripción · Color · Talla · Cantidad · STOCK · Observaciones · Imagen · Costo Unidad · Total`

**Ejemplo de filas reales (mayo 2026):**

| No. | Fecha | Código | Descripción | Color | Cantidad | STOCK |
|---|---|---|---|---|---|---|
| 1 | 2026-05-25 14:45 | 141 | Corbata Niño Encauchada | Azul Oscuro | 1 | 6 |
| 2 | 2026-05-25 14:13 | 98 | Corbatín Moño Pajarita | Negro | 1 | 3 |
| 3 | 2026-05-26 13:09 | 141 | Corbata Niño Encauchada | Azul Oscuro | 2 | 6 |

> **Dato crítico para el diseño:** la hoja `Salidas` **ya contiene ventas con fecha y hora**.
> Esto confirma el riesgo de **doble conteo**: el modelo "foto base − ventas posteriores"
> debe restar únicamente ventas con fecha **posterior** al momento de importar la foto del Excel.
> Si no, las ventas que ya están reflejadas en la columna `Disponible` se restarían otra vez.

---

## Llaves de mapeo (importantes)

- **SKU interno = `Codigo de producto`** (en Inventario) = `Código` (en Entradas/Salidas).
  Es numérico/corto (`141`, `98`, …).
- **Mercado Libre = `# Publicacion`** (columna en la hoja Inventario).
- **Shopify = pendiente.** No existe columna; habrá que mapear el SKU interno a la
  variante de Shopify cuando se conecte la API.

---

## Notas técnicas para la importación

- El archivo es `.xlsm` (con macros). `openpyxl` lo lee sin problema en modo solo lectura.
- En el entorno local hay Python en `D:\dash board sepia BI\.venv\Scripts\python.exe`
  con `openpyxl 3.1.5` instalado.
- Los encabezados **no siempre están en la fila 1** (Inventario fila 4, Salidas fila 4) —
  el importador debe detectar la fila de encabezado, no asumir fila 1.
- Hay caracteres acentuados; leer/escribir en UTF-8.
