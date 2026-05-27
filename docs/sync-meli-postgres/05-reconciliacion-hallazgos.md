# Hallazgos de la primera reconciliacion API vs Excel

**Fecha del analisis:** 2026-05-26
**Rango comparado:** marzo-abril 2026
**Script usado:** `python scripts/correr_reconciliacion.py 2026-03-01 2026-04-30`

---

## Numeros gruesos

| Metrica | API MeLi | Excel oficial |
|---|---:|---:|
| Total ordenes | 351 | 343 |
| Coinciden por `numero_venta` | 225 | 225 |
| Solo en un lado | 126 (API) | 118 (Excel) |
| Match perfecto en cantidad | 100% sobre los 225 que matchean | — |
| Revenue total | $15,303,024 COP | $10,037,189 COP |
| Diferencia revenue | +$5,265,835 | (52% mas en API) |

---

## Hallazgo #1: Las filas "Paquete" del Excel

Cuando una venta agrupa varios productos en un paquete, el Excel:
- Deja **en blanco el monto** de las filas individuales de cada producto
- Crea **una fila resumen** con `estado='Paquete de N productos'`, `qty=0` y
  el monto total del paquete

Confirmado por Santiago el 2026-05-26.

Descomposicion del Excel en el rango marzo-abril:

| Tipo de fila | Filas | Qty | Monto |
|---|---:|---:|---:|
| A. Filas Paquete (resumen) | 34 | 14 | $1,713,042 |
| B. Filas con monto=0 (dentro de paquete) | 83 | 86 | $0 |
| C. Ordenes normales (qty>0, monto>0) | 226 | 256 | $8,324,143 |
| **TOTAL** | 343 | 356 | **$10,037,185** |

---

## Hallazgo #2: El `numero_venta` del Excel NO es el `order.id` de la API

**El descubrimiento clave.** Verificado por Santiago en MercadoLibre Vendedor:
- La API devolvio una orden con `order.id = 2000015364216952`
- En el UI de MeLi Vendedor (y en el Excel) esa misma orden aparece con
  `numero_venta = 2000011817532403`
- El `order.id` (`2000015364216952`) no se ve en ninguna parte del UI

**Por que pasa esto.** MeLi maneja dos identificadores diferentes:
- `order.id` — identificador tecnico de cada orden individual (1 producto = 1 order)
- `pack_id` (o equivalente) — identificador del agrupamiento que MeLi muestra al
  vendedor como "numero de venta". Cuando una venta tiene varios productos,
  todos comparten el mismo `pack_id`.

El Excel exporta el `pack_id`. La API devuelve el `order.id`. **Mi sync inicial
usaba `order.id`, por eso las ordenes empaquetadas aparecian como "huerfanas".**

---

## Hallazgo #3: API y Excel usan distintos conceptos de "monto"

Las ordenes que SI matchean por `numero_venta` muestran:
- **Cantidad: 100% identica** entre API y Excel
- **Monto: casi siempre diferente** — el API tiende a reportar el precio bruto,
  el Excel el neto despues de descuentos

Ejemplo verificado:
- API: $73,720 (bruto)
- Excel: $59,464 (neto) → descuento aplicado del 19% al cliente

Esto es **comportamiento esperado**. Para reportes financieros confiables usar
siempre el monto del Excel oficial.

---

## El gap de $5.3M explicado

Componente | Monto
---|---:
API total | $15.3M
Excel total (todas las filas) | $10.0M
**Diferencia** | **+$5.3M**

Origen de la diferencia:
- ~$7M de las 126 ordenes "solo en API" que en realidad **si estan en el
  Excel pero con otro `numero_venta`** (su `pack_id` en vez de su `order.id`)
- Compensado parcialmente por ~$1.7M de filas "Paquete" del Excel que no
  tienen contrapartida directa en la API (porque la API te da las ordenes
  individuales, no el paquete)
- Neto: ~$5.3M

**Es un problema de matching, no de datos.** Una vez arreglado el uso de
`pack_id`, este gap deberia caer a casi cero (solo quedando las diferencias
reales de monto bruto vs neto).

---

## Fix planeado (pendiente)

Documentado en [`06-pendientes.md`](06-pendientes.md).

Resumen:
1. Modificar `orderToRows()` en `syncMeliToDbService.js` para leer
   `order.pack_id` (ademas de `order.id`)
2. Usar `pack_id || order.id` como `numero_venta` en `ventas_ml`
3. Agregar columna `meli_order_id` para conservar el `order.id` por trazabilidad
4. Re-correr sync (sera UPDATE de las filas existentes via UPSERT)
5. Re-correr reconciliacion → esperado match > 90%

Tiempo estimado: ~15 minutos de codigo + verificacion.

---

## Como leer reportes de reconciliacion en general

- **"Match perfecto" alto** → API y Excel coinciden, datos preliminares confiables.
- **"Cantidad OK, monto diferente"** → ajustes post-venta esperados (descuentos, comisiones).
- **"Solo en API/Excel"** → o IDs distintos (este caso), o realmente faltan en un lado.
