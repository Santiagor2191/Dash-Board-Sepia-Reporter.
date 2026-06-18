// Backfill: convierte las filas opacas "Paquete de N productos" (importadas del
// Excel oficial) en una fila por producto real, consultando MeLi.
//   node backfill_packs.mjs           -> simulacion (no toca la base)
//   node backfill_packs.mjs --apply   -> aplica los cambios
//
// Reparte los valores EXACTOS de la fila original (bruto/neto/comision) entre los
// productos por peso, con correccion de redondeo en el ultimo item => los totales
// no cambian ni un peso. Idempotente: re-correrlo no duplica (las filas-paquete
// ya desglosadas desaparecen del WHERE).
import "dotenv/config";
import crypto from "node:crypto";
import * as env from "./src/config/env.js";
import { dbPool } from "./src/db/pool.js";
import { createMeliClient } from "./src/services/meliClient.js";
import { createMeliTokenStore } from "./src/services/meliTokenStore.js";

const APPLY = process.argv.includes("--apply");

const mapStatusToEstado = (s) => ({
  paid: "Entregado", cancelled: "Cancelada", confirmed: "Confirmada",
  payment_required: "Pago pendiente", payment_in_process: "Pago en proceso", invalid: "Invalida",
}[s] || s || "Desconocido");

const buildVarianteTalla = (attrs) => {
  if (!Array.isArray(attrs) || !attrs.length) return null;
  const p = attrs.map((a) => {
    const n = a?.name || a?.id, v = a?.value_name || a?.value_id;
    return n && v ? `${n} : ${v}` : null;
  }).filter(Boolean);
  return p.length ? p.join(" / ") : null;
};

const buildIdUnico = (orderId, itemId, variationId) =>
  crypto.createHash("sha256")
    .update(["api", String(orderId), String(itemId || ""), String(variationId || "none")].join("|"), "utf8")
    .digest("hex");

const inferCategoria = (title) => {
  if (!title) return null;
  const p = title.toLowerCase();
  if (/\bni[ñn]a\b/.test(p)) return "Niña";
  if (/\bni[ñn]o\b|\bbeb[eé]\b/.test(p)) return "Niño";
  if (/\bmujer\b|\bdama\b|\bnovia\b|\bquincea[ñn]era\b/.test(p)) return "Dama";
  if (/\bhombre\b|\bcaballero\b/.test(p)) return "Caballero";
  if (/\bunisex\b/.test(p)) return "Unisex";
  return null;
};

// Reparte total entre pesos w (suman 1) a 2 decimales, con el resto exacto en el
// ultimo item => la suma da identica al original (centavos incluidos).
const c2 = (x) => Math.round(x * 100) / 100;
const repartir = (total, pesos) => {
  const out = pesos.map((w) => c2(total * w));
  const diff = c2(total - out.reduce((s, x) => s + x, 0));
  if (out.length) out[out.length - 1] = c2(out[out.length - 1] + diff);
  return out;
};

const insertRow = (r) => dbPool.query(
  `INSERT INTO ventas_ml (
    id_unico, anio, num_mes, dia, fecha, numero_venta, estado,
    producto, categoria, variante_talla, cantidad,
    monto_reportado_cop, ingresos_productos_cop, cargo_venta_impuestos_cop,
    sku, publicacion_id, precio_unitario_publicacion_cop,
    comprador, ciudad, forma_entrega,
    origen_dato, calidad_dato, periodo_incompleto, archivo_origen,
    order_item_id, meli_order_id, fecha_ultima_actualizacion
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW())
  ON CONFLICT (id_unico) DO UPDATE SET
    estado=EXCLUDED.estado, cantidad=EXCLUDED.cantidad,
    monto_reportado_cop=EXCLUDED.monto_reportado_cop,
    ingresos_productos_cop=EXCLUDED.ingresos_productos_cop,
    cargo_venta_impuestos_cop=EXCLUDED.cargo_venta_impuestos_cop,
    precio_unitario_publicacion_cop=EXCLUDED.precio_unitario_publicacion_cop,
    producto=EXCLUDED.producto, categoria=COALESCE(EXCLUDED.categoria, ventas_ml.categoria),
    sku=EXCLUDED.sku, publicacion_id=EXCLUDED.publicacion_id,
    variante_talla=EXCLUDED.variante_talla, meli_order_id=EXCLUDED.meli_order_id,
    fecha_ultima_actualizacion=NOW()`,
  [
    r.id_unico, r.anio, r.num_mes, r.dia, r.fecha, r.numero_venta, r.estado,
    r.producto, r.categoria, r.variante_talla, r.cantidad,
    r.monto_reportado_cop, r.ingresos_productos_cop, r.cargo_venta_impuestos_cop,
    r.sku, r.publicacion_id, r.precio_unitario_publicacion_cop,
    r.comprador, r.ciudad, r.forma_entrega,
    "backfill_pack_api", "alta", false, r.archivo_origen,
    r.order_item_id, r.meli_order_id,
  ]
);

// --- arranque ---
const ml = createMeliClient({
  apiBase: env.MELI_API_BASE, clientId: env.MELI_CLIENT_ID,
  clientSecret: env.MELI_CLIENT_SECRET, redirectUri: env.MELI_REDIRECT_URI,
  initialTokens: env.MELI_INITIAL_TOKENS,
});
const store = createMeliTokenStore({ dbPool });
await ml.loadTokens((await store.load()) ?? env.MELI_INITIAL_TOKENS);

const [packs] = await dbPool.query(`
  SELECT id, numero_venta, anio, num_mes, dia, fecha, comprador, ciudad, forma_entrega,
         archivo_origen, ingresos_productos_cop, monto_reportado_cop, cargo_venta_impuestos_cop
  FROM ventas_ml
  WHERE producto ILIKE 'paquete de%' OR estado ILIKE 'paquete de%'
  ORDER BY fecha
`);

console.log(`MODO: ${APPLY ? "APLICAR (escribe en la base)" : "SIMULACION (no toca nada)"}`);
console.log(`Filas-paquete a procesar: ${packs.length}\n`);

let okPacks = 0, okRows = 0, skipped = 0;
let brutoAntes = 0, brutoDespues = 0, netoAntes = 0, netoDespues = 0;

for (const p of packs) {
  const B = Number(p.ingresos_productos_cop) || 0;
  const M = Number(p.monto_reportado_cop) || 0;
  const C = Number(p.cargo_venta_impuestos_cop) || 0;
  try {
    const pack = await ml.mlGet(`/packs/${p.numero_venta}`);
    const lineas = [];
    for (const o of pack.orders || []) {
      const order = await ml.mlGet(`/orders/${o.id}`);
      for (const li of order.order_items || []) {
        lineas.push({ orderId: o.id, status: order.status, item: li.item || {}, qty: Number(li.quantity) || 1, unit: Number(li.unit_price) || 0 });
      }
    }
    const sumBruto = lineas.reduce((s, l) => s + l.unit * l.qty, 0);
    if (!lineas.length || sumBruto <= 0) { console.log(`  ⚠ ${p.numero_venta}: sin items utilizables, se deja igual`); skipped++; continue; }

    const pesos = lineas.map((l) => (l.unit * l.qty) / sumBruto);
    const brutos = repartir(B, pesos);
    const netos = repartir(M, pesos);
    const cargos = repartir(C, pesos);

    const nuevasFilas = lineas.map((l, i) => ({
      id_unico: buildIdUnico(l.orderId, l.item.id, l.item.variation_id),
      anio: p.anio, num_mes: p.num_mes, dia: p.dia, fecha: p.fecha, numero_venta: String(p.numero_venta),
      estado: mapStatusToEstado(l.status),
      producto: l.item.title || null,
      categoria: l.item.category_name || inferCategoria(l.item.title),
      variante_talla: buildVarianteTalla(l.item.variation_attributes),
      cantidad: l.qty,
      monto_reportado_cop: netos[i], ingresos_productos_cop: brutos[i], cargo_venta_impuestos_cop: cargos[i] || null,
      sku: l.item.seller_sku || null, publicacion_id: l.item.id || null, precio_unitario_publicacion_cop: l.unit,
      comprador: p.comprador, ciudad: p.ciudad, forma_entrega: p.forma_entrega, archivo_origen: p.archivo_origen,
      order_item_id: `${l.item.id || "X"}:${l.item.variation_id || "X"}`, meli_order_id: String(l.orderId),
    }));

    brutoAntes += B; netoAntes += M;
    brutoDespues += brutos.reduce((s, x) => s + x, 0); netoDespues += netos.reduce((s, x) => s + x, 0);
    okPacks++; okRows += nuevasFilas.length;

    if (!APPLY) {
      console.log(`  ${p.numero_venta} ($${B}) -> ${nuevasFilas.map((f) => `"${(f.producto || "").slice(0, 30)}" $${f.ingresos_productos_cop}`).join(" + ")}`);
    } else {
      for (const f of nuevasFilas) await insertRow(f);   // hijos primero (idempotente)
      await dbPool.query(`DELETE FROM ventas_ml WHERE id = $1`, [p.id]);   // luego se borra el padre
      console.log(`  ✓ ${p.numero_venta}: ${nuevasFilas.length} productos`);
    }
  } catch (e) {
    console.log(`  ✗ ${p.numero_venta}: ${e.response ? e.response.status + " " + (e.response.data?.error || "") : e.message}`);
    skipped++;
  }
}

console.log(`\n--- RESUMEN ---`);
console.log(`Paquetes desglosados: ${okPacks} | filas nuevas: ${okRows} | omitidos: ${skipped}`);
console.log(`Bruto antes:  $${Math.round(brutoAntes).toLocaleString()}  | despues: $${Math.round(brutoDespues).toLocaleString()}  | dif: $${Math.round(brutoDespues - brutoAntes)}`);
console.log(`Neto  antes:  $${Math.round(netoAntes).toLocaleString()}  | despues: $${Math.round(netoDespues).toLocaleString()}  | dif: $${Math.round(netoDespues - netoAntes)}`);
console.log(APPLY ? "\nAPLICADO." : "\nSimulacion. Corre con --apply para aplicar.");
process.exit(0);
