# Plan de la tienda MeLi — agosto 2026 a enero 2027

Revisado con `/plan-ceo-review` el 2026-07-28, modo HOLD SCOPE, enfoque "doble pista".
Voz externa: Codex (15 huecos, incorporados abajo).

## El diagnóstico en cuatro números

- **$34.052.403** de inventario activo al costo.
- **$18.867.935 parados**: 1.503 unidades sin una sola venta en 30 días. Es un piso, no el total: solo 164 de 283 publicaciones tienen costo cargado.
- **86% de esa plata es estacional** ($16,3M ceremonia y ropa de niño). Solo $2,5M no lo es.
- **Rotación de inventario: 0,7 veces al año.** Un negocio de accesorios sano rota 3 o 4.

El error que casi cometemos: medimos julio, que es el piso del año para la línea de ceremonia (20,5 uds/año contra 71,3 en noviembre). Liquidar en julio habría sido vender barato justo antes del pico.

## Las dos líneas

| | Accesorios masculinos | Ceremonia y niño |
|---|---|---|
| Calendario | todo el año | ago prepara, sep-dic vende, ene cierra |
| Estado | base del negocio, convierte 6,7% en $0-30k | $16,3M parados esperando temporada |
| Regla de compra | reponer lo que rota | comprar solo contra temporada, nunca fuera |
| Qué la mide | conversión y rotación | unidades de sep+oct contra el histórico |

---

## Movimiento 1 — Reponer las 6 ganadoras. Esta semana.

**No espera a la liquidación.** Es el cambio que trajo la voz externa: el Bolo Rodeo tiene 3 unidades y a 5 ventas al mes se agota en semanas, mientras que rematar 57 corbatas a 19 visitas al mes toma meses. Si se agotan, MeLi deja de mostrarlas y se pierde la posición ganada.

| Producto | Stock | Conversión |
|---|---|---|
| Corbata Bolo Rodeo | 3 | 5,4% |
| Corbata Bolo Vaquero Dorado | 4 | 13,3% |
| Corbata Bolo Vaquero Plateado | 5 | 10,5% |
| Corbata Bolo Unisex | 6 | 7,0% |
| Kit Cirio de Bautizo | 7 | 4,9% |
| Mancornas Doctor Strange | 10 | 10,3% |

**Hecho el 2026-07-31: los bolos ya se pidieron, llegan en ~15 días** (mediados de agosto,
a tiempo para la temporada). Ese plazo de 15 días es ahora la regla de compra de todo el
calendario, ver la sección de estacionalidad al final.

**Falta pedir tres más**, que la estacionalidad destapó y no estaban en esta lista:

| Producto | Vendió oct-nov 2025 | Stock hoy | Alcanza |
|---|---|---|---|
| Tirantes Cargaderas + Corbatín | 17 uds | 2 | 7 días |
| Peineta Novia Matrimonio | 13 uds | 4 | 19 días |
| Corbata Satinada Slim Juvenil | **100 uds** | 57 | 35 días |

Los tres parecían muertos en julio, y dos estaban en la lista de "peores publicaciones".
Son estacionales de segundo semestre.

## Movimiento 2 — Liquidar solo lo que nunca vendió ($3,1M)

**Corregido el 2026-07-30.** La lista original salía de "no vendió en 30 días", que en julio
es la misma trampa que ya nos había engañado con la ropa de niño. Al mirar el historial
mes a mes de 2025, dos de los tres primeros de esa lista resultaron ser estacionales de
segundo semestre:

| Producto | ene-jul 2025 | ago-dic 2025 | Veredicto |
|---|---|---|---|
| Corbata Larga Satinada Slim Juvenil (57 uds) | 67 uds | **146 uds**, pico 77 en octubre | **NO liquidar** |
| Kit Corbata Caballero Pañuelo (24 uds) | 17 uds | 31 uds | **NO liquidar** |
| Guantes Niña Primera Comunión (17 uds) | 8 uds | 19 uds | **NO liquidar** |
| Tirantes + Corbatín (2 uds) | 7 uds | 27 uds | **NO liquidar** |

**El filtro correcto es "no vendió una sola unidad desde enero de 2025"**, no "no vendió el
mes pasado". Con ese filtro quedan **115 publicaciones y $3.106.834**:

| Producto | Uds | Visitas/mes | Capital | Precio |
|---|---|---|---|---|
| Traje de Niño Tipo Bautizo Tirantas | 17 | 10 | $1.164.500 | $194.800 |
| Set Tiara Collar Aretes Anillo 15 Años | 12 | 6 | $840.000 | $280.000 |
| Conjunto Collar Aretes y Tiara Quinceañera | 11 | 6 | $328.900 | $145.000 |
| Traje Completo Niño | 2 | 24 | $169.000 | $215.900 |
| Traje Niño Tipo Bautizo | 2 | 10 | $166.000 | $265.900 |
| Balaca Niña Bautizo | 10 | 3 | $90.000 | $37.900 |
| Otras 109 publicaciones | | | $348.434 | |

Antes de rematar, verificar que ninguna sea una publicación creada hace poco: "sin ventas
desde 2025" no significa nada si la publicaste en junio.

**Antes de fijar el precio de remate, mira el margen, no solo el costo.** La tabla `publicaciones_rentabilidad` tiene `costo_total` y `utilidad_sepia`: el costo inicial no incluye comisión de MeLi, envío ni impuestos. Rematar "al costo inicial" puede ser vender a pérdida.

Nota sobre el Kit Corbata Caballero y el Anillo 15 Años: tienen 70 visitas al mes cada uno. Antes de rematarlos, bajar el precio y ver qué pasa es más barato que rematar. Tienen demanda; lo que no cierran es la venta.

## Movimiento 3 — Preparar la temporada. Agosto, con lista cerrada.

"Mejorar todo" no es un plan para una sola persona. Estos ocho concentran $9,2M de los $16,3M parados. Solo estos:

| Producto | Capital | Visitas/mes | Qué le falta |
|---|---|---|---|
| Pantalón de Drill Niño | $1.740.000 | 17 | precio ($117.900 con costo de $30.000) |
| Zapatilla Baleta Ceremonia | $1.666.000 | 7 | nadie la ve: título y categoría |
| Traje Niño Elegante Bautizo | $1.540.000 | 43 | tráfico sí, no cierra: precio y fotos |
| Traje Niño Tirantas | $1.164.500 | 10 | título y categoría |
| Sandalia Tacón Niña | $1.024.000 | 5 | nadie la ve |
| Set Tiara Collar 15 Años | $840.000 | 6 | nadie la ve |
| Sandalia Niña Fiesta | $646.000 | 6 | nadie la ve |
| Traje Niño Chaleco | $630.000 | 21 | precio y fotos |

Seis de los ocho reciben menos de 21 visitas al mes. **Ese no es problema de conversión, es que MeLi no los está mostrando**: título, categoría o precio fuera de rango. El módulo SEO Títulos que ya tienes trae las tendencias reales de MeLi por categoría, que es exactamente la herramienta para esto.

Fecha límite: **31 de agosto**. Lo que no esté listo, no entra a temporada.

## Movimiento 4 — Publicidad de MeLi, con tres filtros

Corrección de la voz externa: mi regla original ("solo publicaciones sobre 8% de conversión") era mecánica. Un producto con 1 venta en 10 visitas marca 10% y no significa nada.

Una publicación entra a publicidad solo si cumple las tres:
1. **50 visitas o más** al mes (que el dato sea real)
2. **Conversión sobre 8%**
3. **Stock para 30 días** al ritmo actual

Hoy califican: Kit Corbatín (119 vis, 10,8%), Cirio Sencillo (105 vis, 8,6%) y Bolo Vaquero (60 vis, 13,3%) si repones stock.

El **Pisa Corbata** es el caso aparte: 25% de conversión, la mejor de la tienda, con solo 24 visitas. No califica por visitas, pero es el candidato más obvio a que le des tráfico. Prueba con presupuesto pequeño y mira si la conversión aguanta al subir el volumen.

## Movimiento 5 — Envío gratis en los dos trajes caros

Quitarlo del Traje de Niño ($195.900) y el Conjunto con Boina ($84.500). Son las únicas dos con envío gratis y las dos venden cero.

**Contrapunto de la voz externa, que es válido:** quitar el envío gratis mejora el margen pero puede empeorar la conversión, y el problema del rango $90k+ probablemente es más profundo. Como ambas llevan 30 días en cero, no hay conversión que empeorar. Si al mes de quitarlo siguen en cero, el problema era el precio o el producto, no el envío.

---

## La señal de corte: 20 de octubre

| Año | Ceremonia sep+oct |
|---|---|
| 2023 | 136 uds |
| 2024 | 243 uds |
| 2025 | 151 uds |

La banda histórica es 136 a 243. El ancla es 2025 (151 uds) y el piso es **90 unidades (-40%)**.

- **Si al 20 de octubre vas sobre 90 uds:** la temporada funciona. Sigues hasta diciembre y revisas en enero.
- **Si vas bajo 90 uds:** descuentas en **noviembre**, no en enero. Noviembre tiene 3,5 veces el tráfico de enero. Rematar en enero es rematar cuando no pasa nadie.

**Chequeo parcial el 15 de septiembre** (lo pidió la voz externa y tiene razón): si a esa fecha vas bajo 25 unidades, no esperes al 20 de octubre para empezar a ajustar precios.

Regla permanente: **comparar siempre contra el mismo mes del año anterior**, nunca contra el mes pasado. En un negocio con esta estacionalidad, comparar noviembre contra octubre te hace creer que mejoraste cuando solo cambió el mes.

## Metas corregidas

Las metas que puse en la primera versión no eran alcanzables con las decisiones tomadas. Codex lo señaló y es aritmética, no opinión: si no se toca ceremonia, hay $16,3M que no se pueden mover antes de la temporada.

| Indicador | Hoy | Meta a 31 de enero | Por qué esta y no otra |
|---|---|---|---|
| Capital quieto | $18,9M | **menos de $12M** | $2,5M de liquidación + lo que mueva la temporada |
| Rotación de inventario | 0,7x | **1,2x** | la meta de 3-4x es de un catálogo ya saneado, no de este |
| Conversión promedio | 3,18% | **4%** | sin podar el catálogo, 5% no da: 219 publicaciones sin venta siguen contando |
| Ganadoras agotadas | 6 | **0** | control directo, no depende de la temporada |

La meta de conversión de 5% y la de rotación de 3-4x quedan para después de enero, cuando se decida qué hacer con el catálogo.

## Lo que NO está en este plan

| Qué | Por qué |
|---|---|
| Podar el catálogo | Decisión tuya del 2026-07-28: se documenta, no se poda. Costo aceptado: el tráfico se sigue repartiendo. |
| Liquidar ceremonia ahora | Julio es el piso del año. Se decide el 20 de octubre. |
| Usar el CRM de WhatsApp y Meta Ads para mover inventario | Modo HOLD SCOPE. La voz externa lo señaló como oportunidad real. Queda pendiente. |
| Qué hacer con la joyería femenina | Las 3 publicaciones más visitadas de la tienda convierten bajo 1,5%. Sin decidir. |
| Espiar precios de la competencia automáticamente | La API de MeLi da 403. A mano, 20 minutos al mes. |
| Módulos nuevos en el dashboard | Nada de este plan necesita código. |

## Lo que ya existe y este plan reutiliza

- Página `/conversion` del dashboard: el diagnóstico de visitas y conversión, ya construida.
- MCP de MeLi: consultas por chat, 7 herramientas, funcionando desde hoy.
- Módulo SEO Títulos: tendencias reales de MeLi en 43 de 52 categorías.
- Base Neon con 2021-2026: la comparación año contra año.
- Tabla `publicaciones_rentabilidad`: costos y utilidad por publicación.

## Qué mirar cada semana

Tres números, en `/conversion` o preguntándole al chat:

1. **Stock de las 6 ganadoras** (que ninguna llegue a cero)
2. **Unidades de ceremonia acumuladas** desde el 1 de septiembre, contra 151 del año pasado
3. **Visitas totales de la tienda** (si caen, es MeLi mostrándote menos, no tus precios)

## Riesgos abiertos

| Riesgo | Cubierto |
|---|---|
| El proveedor tarda más de lo que creemos | **NO** — falta preguntar |
| La temporada mueve solo una fracción de 1.503 uds | Parcial — el corte del 20 de octubre limita la pérdida |
| Rematar al costo inicial es vender a pérdida | Mitigado — revisar `utilidad_sepia` antes |
| Quedarte sin caja operativa por reponer | **NO** — depende de tu flujo, que no conozco |
| Tallas sueltas o moda vencida en ropa de niño | **NO** |

---

Anexo: [publicaciones-flojas.md](publicaciones-flojas.md) y [publicaciones-sin-venta-2026-07.csv](publicaciones-sin-venta-2026-07.csv)

---

# Calendario de estacionalidad

Añadido 2026-07-31. Base: 2021-2026 en Neon, normalizado por año (cada mes se
divide entre los años que tienen dato, porque faltan agosto y diciembre de 2024
y enero de 2021). Agrupado por palabras clave del producto, no por la columna
`categoria`, que cambió de nombres en 2026.

## Índice por línea de negocio

100 = mes promedio de esa línea. En **negrita** los meses 50% o más sobre su promedio.

| Línea | uds/año | ene | feb | mar | abr | may | jun | jul | ago | sep | oct | nov | dic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Corbatería caballero | 835 | 70 | 69 | 87 | 89 | 119 | 81 | 94 | 78 | 91 | **156** | **168** | 100 |
| Ceremonia religiosa | 320 | 44 | 46 | 73 | 82 | 96 | 63 | 61 | 123 | 116 | **171** | **198** | 128 |
| Ropa y calzado niño | 188 | 65 | 85 | 70 | 68 | 96 | 63 | 56 | 88 | 86 | **175** | **207** | 142 |
| Novia y matrimonio | 173 | 63 | 87 | 122 | 109 | 110 | 68 | 71 | 68 | 88 | **186** | 122 | 108 |
| Quinceañera y tiaras | 161 | 67 | 66 | 81 | 86 | 93 | 85 | 71 | 99 | 82 | **184** | **191** | 95 |
| Joyería y bisutería | 70 | 68 | 68 | 88 | 85 | **154** | 94 | 60 | 90 | 75 | 143 | 96 | **179** |
| **LA TIENDA** | **1.902** | 63 | 70 | 84 | 84 | 112 | 79 | 76 | 89 | 95 | **170** | **168** | 110 |

## Las cuatro temporadas

**1. Octubre y noviembre: EL negocio.** Índice 170 y 168, el doble de enero. Las
seis líneas pican a la vez. Aquí se juega el año.

La demanda está **repartida**, no concentrada en Black Friday: octubre reparte
14% / 15% / 28% / 31% / 12% por semana, y noviembre día a día es plano. No es un
pico de campaña, es demanda real. La segunda quincena de octubre es la más
fuerte (59% del mes entre el 15 y el 28).

**2. Mayo: pico secundario.** Índice 112. Lo mueven corbatería (119) y sobre todo
joyería (154), que es su mejor mes junto con diciembre. Día de la madre.

**3. Diciembre: temporada de regalo.** Índice 110, pero con mezcla distinta:
joyería 179 y ropa de niño 142, mientras corbatería cae a 100.

**4. Enero y febrero: el piso.** Índice 63 y 67. Ninguna línea levanta. Es el mes
de ordenar el inventario, no de comprar.

Fuera de eso, **marzo y abril son de novia y matrimonio** (122 y 109): la única
línea que sube en el primer trimestre.

## Qué se vende en cada pico

| Mes | Los que mandan |
|---|---|
| Mayo | Kit Corbatín Pañuelo y Mancornas (54 uds), Corbatín Caballero (25), Pañoletas Dama |
| Agosto | Kit Primera Comunión (22), Corbatín Caballero (22), Corbata Satinada Slim Juvenil (18) |
| Septiembre | Kit PC (35), Kit Corbatín Pañuelo y Mancornas (35), Corbata Satinada Slim Juvenil (20) |
| **Octubre** | **Corbata Satinada Slim Juvenil (86)**, Pañoletas Dama (74), Kit PC (46) |
| **Noviembre** | **Kit Corbatín Pañuelo y Mancornas (61)**, Kit PC (46), Kit Corbatín (46) |
| Diciembre | Kit Corbatín (28), Kit PC (27), cirios de bautizo |

## Regla de compra

El proveedor tarda **~15 días** (confirmado 2026-07-31 con el pedido de bolos).

- **Pedido de temporada alta: sale antes del 15 de septiembre.** Si sale el 1 de
  octubre, la mercancía llega el 15 y se pierde la primera mitad del mes fuerte.
- **Pedido de mayo: sale antes del 15 de abril.**
- **Enero y febrero no se compra.** Es el piso del año.

## Stock contra la temporada que viene

Unidades vendidas en oct-nov 2025 contra el stock de hoy:

| Producto | oct-nov 2025 | Stock | Alcanza |
|---|---|---|---|
| Tirantes Cargaderas + Corbatín | 17 uds | **2** | **7 días** |
| Peineta Novia Matrimonio | 13 uds | **4** | **19 días** |
| Corbata Satinada Slim Juvenil | **100 uds** | 57 | 35 días |
| Cirio de Bautizo Decorados | 23 uds | 26 | 69 días |
| Kit Corbatín Pañuelo Caballero | 42 uds | 59 | 86 días |
| Kit Primera Comunión | 18 uds | 29 | 98 días |

Los tres primeros se agotan en plena temporada. La Corbata Satinada Slim Juvenil
es el caso más grave: **es el producto más vendido de octubre con 100 unidades** y
solo hay 57. Se agota a mediados de noviembre.
