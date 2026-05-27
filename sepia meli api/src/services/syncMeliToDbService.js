import crypto from "node:crypto";

const ORDERS_PAGE_LIMIT = 50;
const DEFAULT_MAX_ORDERS = 1000;

// =============================================================================
// HELPERS DE FECHA - Colombia es UTC-5 sin horario de verano
// =============================================================================

const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

const toColombiaDateParts = (isoString) => {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  // Convertimos a hora Colombia restando el offset y leyendo en UTC
  const co = new Date(d.getTime() - COLOMBIA_OFFSET_MS);
  return {
    iso: co.toISOString().slice(0, 10),
    year: co.getUTCFullYear(),
    month: co.getUTCMonth() + 1,
    day: co.getUTCDate(),
  };
};

const ymdToColombiaIso = (ymd, endOfDay = false) => {
  const sufijo = endOfDay ? "T23:59:59.999-05:00" : "T00:00:00.000-05:00";
  return new Date(`${ymd}${sufijo}`).toISOString();
};

const todayColombiaYmd = () => {
  const now = new Date();
  const co = new Date(now.getTime() - COLOMBIA_OFFSET_MS);
  return co.toISOString().slice(0, 10);
};

const addDaysToYmd = (ymd, days) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// =============================================================================
// HELPERS DE MAPEO
// =============================================================================

const mapStatusToEstado = (status) => {
  switch (status) {
    case "paid": return "Entregado";
    case "cancelled": return "Cancelada";
    case "confirmed": return "Confirmada";
    case "payment_required": return "Pago pendiente";
    case "payment_in_process": return "Pago en proceso";
    case "invalid": return "Invalida";
    default: return status || "Desconocido";
  }
};

const inferCategoriaFromTitle = (title) => {
  if (!title) return null;
  const p = title.toLowerCase();
  if (/\bni[ñn]a\b/.test(p) || /\bbeb[eé]\s*(ni[ñn]a|mujer)/.test(p)) return "Niña";
  if (/\bni[ñn]o\b/.test(p) || /\bbeb[eé]\b/.test(p)) return "Niño";
  if (/\bmujer\b|\bdama\b|\bnovia\b|\bquincea[ñn]era\b/.test(p)) return "Dama";
  if (/\bhombre\b|\bcaballero\b/.test(p)) return "Caballero";
  if (/\bunisex\b/.test(p)) return "Unisex";
  return null;
};

const buildVarianteTalla = (variationAttributes) => {
  if (!Array.isArray(variationAttributes) || !variationAttributes.length) return null;
  const partes = variationAttributes
    .map((attr) => {
      const name = attr?.name || attr?.id;
      const value = attr?.value_name || attr?.value_id;
      if (!name || !value) return null;
      return `${name} : ${value}`;
    })
    .filter(Boolean);
  return partes.length ? partes.join(" / ") : null;
};

// id_unico DETERMINISTICO para filas de la API: re-ejecutar el sync genera
// el mismo id, por lo que el ON CONFLICT funciona como UPSERT.
const buildIdUnico = (orderId, itemId, variationId) => {
  const base = ["api", String(orderId), String(itemId || ""), String(variationId || "none")].join("|");
  return crypto.createHash("sha256").update(base, "utf8").digest("hex");
};

// =============================================================================
// SERVICIO
// =============================================================================

export const createSyncMeliToDbService = ({ mlGet, dbPool, meliOrdersService }) => {
  // ---------------------------------------------------------------------------
  // Trae todas las ordenes en un rango usando paginacion
  // ---------------------------------------------------------------------------
  const fetchOrdersInRange = async (sellerId, fromIso, toIso, cap) => {
    const params = {
      seller: sellerId,
      sort: "date_asc",
      "order.date_created.from": fromIso,
      "order.date_created.to": toIso,
    };
    const all = [];
    let offset = 0;
    const maxCap = Math.min(Math.max(Number(cap) || DEFAULT_MAX_ORDERS, 1), 5000);

    while (offset < maxCap) {
      const limit = Math.min(ORDERS_PAGE_LIMIT, maxCap - offset);
      const page = await mlGet("/orders/search", { ...params, offset, limit });
      const batch = page?.results || [];
      all.push(...batch);
      if (!batch.length || batch.length < limit) break;
      offset += batch.length;
      if (page?.paging?.total && offset >= page.paging.total) break;
    }
    return all;
  };

  // ---------------------------------------------------------------------------
  // Determina la ultima fecha "oficial" en ventas_ml (regla Excel gana).
  // Importante: ignoramos fechas FUTURAS para que datos sucios del Excel
  // (fechas mal digitadas adelante en el tiempo) no bloqueen el sync.
  // ---------------------------------------------------------------------------
  const getLastOfficialDate = async () => {
    const [rows] = await dbPool.query(`
      SELECT MAX(fecha) AS last_date
      FROM ventas_ml
      WHERE origen_dato IN ('mercadolibre_oficial', 'manual_historico')
        AND fecha IS NOT NULL
        AND fecha <= CURRENT_DATE
    `);
    const raw = rows[0]?.last_date;
    return raw ? new Date(raw) : null;
  };

  // ---------------------------------------------------------------------------
  // UPSERT de una linea de orden en ventas_ml
  // Devuelve true si fue INSERT, false si fue UPDATE.
  // ---------------------------------------------------------------------------
  const upsertOrderLine = async (row) => {
    const [rows] = await dbPool.query(
      `
      INSERT INTO ventas_ml (
        id_unico, anio, num_mes, dia, fecha, numero_venta, estado,
        producto, categoria, variante_talla, cantidad,
        monto_reportado_cop, ingresos_productos_cop,
        sku, publicacion_id, precio_unitario_publicacion_cop,
        comprador, ciudad, forma_entrega,
        origen_dato, calidad_dato, periodo_incompleto, archivo_origen,
        order_item_id, meli_order_id, fecha_ultima_actualizacion
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13,
        $14, $15, $16,
        $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, NOW()
      )
      ON CONFLICT (id_unico) DO UPDATE SET
        estado = EXCLUDED.estado,
        cantidad = EXCLUDED.cantidad,
        monto_reportado_cop = EXCLUDED.monto_reportado_cop,
        ingresos_productos_cop = EXCLUDED.ingresos_productos_cop,
        precio_unitario_publicacion_cop = EXCLUDED.precio_unitario_publicacion_cop,
        producto = COALESCE(EXCLUDED.producto, ventas_ml.producto),
        categoria = COALESCE(EXCLUDED.categoria, ventas_ml.categoria),
        comprador = COALESCE(EXCLUDED.comprador, ventas_ml.comprador),
        numero_venta = EXCLUDED.numero_venta,
        meli_order_id = COALESCE(EXCLUDED.meli_order_id, ventas_ml.meli_order_id),
        fecha_ultima_actualizacion = NOW()
      RETURNING (xmax = 0) AS inserted
      `,
      [
        row.id_unico, row.anio, row.num_mes, row.dia, row.fecha, row.numero_venta, row.estado,
        row.producto, row.categoria, row.variante_talla, row.cantidad,
        row.monto_reportado_cop, row.ingresos_productos_cop,
        row.sku, row.publicacion_id, row.precio_unitario_publicacion_cop,
        row.comprador, row.ciudad, row.forma_entrega,
        row.origen_dato, row.calidad_dato, row.periodo_incompleto, row.archivo_origen,
        row.order_item_id, row.meli_order_id,
      ]
    );
    return rows[0]?.inserted === true;
  };

  // ---------------------------------------------------------------------------
  // Convierte una orden MeLi en N filas (una por order_item)
  // ---------------------------------------------------------------------------
  const orderToRows = async (order) => {
    const dateSource = order.date_closed || order.date_created;
    const parts = toColombiaDateParts(dateSource);
    if (!parts) return [];

    const buyer = order.buyer || null;
    const compradorFullName = buyer
      ? ([buyer.first_name, buyer.last_name].filter(Boolean).join(" ").trim() || buyer.nickname || null)
      : null;

    // pack_id agrupa sub-ordenes; es el identificador que usa el Excel.
    // Cuando no existe (orden simple), se usa order.id como fallback.
    const packId = order.pack_id || null;
    const numeroVenta = packId ? String(packId) : String(order.id);

    const rows = [];
    for (const lineItem of order.order_items || []) {
      const item = lineItem.item || {};
      const itemId = item.id || null;
      const variationId = item.variation_id || null;
      const unitPrice = Number(lineItem.unit_price) || 0;
      const quantity = Number(lineItem.quantity) || 1;
      const lineSubtotal = Math.round(unitPrice * quantity);

      let categoria = item.category_name || null;
      if (!categoria && item.category_id && meliOrdersService?.getCategoryName) {
        try { categoria = await meliOrdersService.getCategoryName(item.category_id); }
        catch { categoria = null; }
      }
      if (!categoria) categoria = inferCategoriaFromTitle(item.title);

      rows.push({
        id_unico: buildIdUnico(order.id, itemId, variationId),
        anio: parts.year,
        num_mes: parts.month,
        dia: parts.day,
        fecha: parts.iso,
        numero_venta: numeroVenta,
        meli_order_id: String(order.id),
        estado: mapStatusToEstado(order.status),
        producto: item.title || null,
        categoria,
        variante_talla: buildVarianteTalla(item.variation_attributes),
        cantidad: quantity,
        monto_reportado_cop: lineSubtotal,
        ingresos_productos_cop: lineSubtotal,
        sku: item.seller_sku || lineItem.seller_sku || null,
        publicacion_id: itemId,
        precio_unitario_publicacion_cop: unitPrice,
        comprador: compradorFullName,
        ciudad: null,           // v1: no consultamos /shipments para evitar costo extra
        forma_entrega: null,    // v1: idem
        origen_dato: "api_meli_preliminar",
        calidad_dato: "preliminar",
        periodo_incompleto: true,
        archivo_origen: "api_meli_sync",
        order_item_id: `${itemId || "X"}:${variationId || "X"}`,
      });
    }
    return rows;
  };

  // ---------------------------------------------------------------------------
  // Auditoria en sync_log
  // ---------------------------------------------------------------------------
  // Capturamos inicio desde Node (no desde Postgres NOW()) para que la duracion
  // calculada en milisegundos sea consistente con el reloj de Node y no se vea
  // afectada por desfases de timezone entre la sesion PostgreSQL y el proceso.
  const logSyncStart = async ({ rangoDesde, rangoHasta }) => {
    const inicio = new Date();
    const [rows] = await dbPool.query(
      `INSERT INTO sync_log (inicio, rango_desde, rango_hasta, estado)
       VALUES ($1, $2, $3, 'en_curso')
       RETURNING id`,
      [inicio, rangoDesde, rangoHasta]
    );
    return { id: rows[0].id, inicio };
  };

  const logSyncFinish = async ({
    id, inicio,
    ordenesProcesadas, ordenesNuevas, ordenesActualizadas, errores,
    mensaje, estado,
  }) => {
    const fin = new Date();
    const duracionMs = fin.getTime() - inicio.getTime();
    await dbPool.query(
      `UPDATE sync_log SET
         fin = $1, duracion_ms = $2,
         ordenes_procesadas = $3, ordenes_nuevas = $4,
         ordenes_actualizadas = $5, errores = $6,
         mensaje = $7, estado = $8
       WHERE id = $9`,
      [fin, duracionMs, ordenesProcesadas, ordenesNuevas, ordenesActualizadas, errores, mensaje, estado, id]
    );
  };

  // ---------------------------------------------------------------------------
  // Funcion principal: sincroniza los ultimos N dias
  // ---------------------------------------------------------------------------
  const syncRecentOrders = async ({ daysBack = 14, maxOrders = DEFAULT_MAX_ORDERS } = {}) => {
    const hastaYmd = todayColombiaYmd();
    const candidatoDesdeYmd = addDaysToYmd(hastaYmd, -daysBack);

    const lastOfficial = await getLastOfficialDate();
    let desdeYmd = candidatoDesdeYmd;
    if (lastOfficial) {
      const dayAfterOfficial = addDaysToYmd(
        lastOfficial.toISOString().slice(0, 10),
        1
      );
      if (dayAfterOfficial > candidatoDesdeYmd) desdeYmd = dayAfterOfficial;
    }

    if (desdeYmd > hastaYmd) {
      const log = await logSyncStart({ rangoDesde: desdeYmd, rangoHasta: hastaYmd });
      await logSyncFinish({
        id: log.id, inicio: log.inicio,
        ordenesProcesadas: 0, ordenesNuevas: 0, ordenesActualizadas: 0, errores: 0,
        mensaje: "Excel oficial ya cubre todo el rango; nada que sincronizar.",
        estado: "completado",
      });
      return {
        sync_id: log.id, rango_desde: desdeYmd, rango_hasta: hastaYmd,
        ordenes_procesadas: 0, ordenes_nuevas: 0, ordenes_actualizadas: 0, errores: 0,
        mensaje: "Excel oficial ya cubre todo el rango; nada que sincronizar.",
      };
    }

    const log = await logSyncStart({ rangoDesde: desdeYmd, rangoHasta: hastaYmd });

    try {
      const me = await mlGet("/users/me");
      const sellerId = me?.id;
      if (!sellerId) throw new Error("No se pudo obtener seller_id de MeLi");

      const orders = await fetchOrdersInRange(
        sellerId,
        ymdToColombiaIso(desdeYmd, false),
        ymdToColombiaIso(hastaYmd, true),
        maxOrders
      );

      let nuevas = 0;
      let actualizadas = 0;
      let errores = 0;
      let lineasProcesadas = 0;

      for (const order of orders) {
        try {
          const rows = await orderToRows(order);
          for (const row of rows) {
            const wasInsert = await upsertOrderLine(row);
            if (wasInsert) nuevas += 1; else actualizadas += 1;
            lineasProcesadas += 1;
          }
        } catch (err) {
          errores += 1;
          console.error(`[sync] Error procesando orden ${order?.id}:`, err.message);
        }
      }

      const mensaje = `OK: ${orders.length} ordenes, ${lineasProcesadas} lineas (${nuevas} nuevas, ${actualizadas} actualizadas), ${errores} errores`;
      await logSyncFinish({
        id: log.id, inicio: log.inicio,
        ordenesProcesadas: orders.length,
        ordenesNuevas: nuevas, ordenesActualizadas: actualizadas, errores,
        mensaje,
        estado: errores > 0 ? "completado_con_errores" : "completado",
      });

      return {
        sync_id: log.id, rango_desde: desdeYmd, rango_hasta: hastaYmd,
        ordenes_procesadas: orders.length,
        lineas_procesadas: lineasProcesadas,
        ordenes_nuevas: nuevas, ordenes_actualizadas: actualizadas,
        errores, mensaje,
      };
    } catch (err) {
      await logSyncFinish({
        id: log.id, inicio: log.inicio,
        ordenesProcesadas: 0, ordenesNuevas: 0, ordenesActualizadas: 0, errores: 1,
        mensaje: `ERROR: ${err.message}`,
        estado: "fallido",
      });
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // Reconciliacion API vs Excel (NO modifica la base).
  // Compara las ordenes que devuelve MeLi en un rango contra las filas que
  // tienes en ventas_ml (origen oficial). Util para validar precision antes
  // de confiar en los datos preliminares de la API.
  // ---------------------------------------------------------------------------
  const reconcileWithExcel = async ({ from, to, maxOrders = 5000 }) => {
    if (!from || !to) {
      throw new Error("from y to son requeridos (formato YYYY-MM-DD)");
    }

    // ---- 1. Traer ordenes desde la API en el rango
    const me = await mlGet("/users/me");
    const sellerId = me?.id;
    if (!sellerId) throw new Error("No se pudo obtener seller_id de MeLi");

    const orders = await fetchOrdersInRange(
      sellerId,
      ymdToColombiaIso(from, false),
      ymdToColombiaIso(to, true),
      maxOrders
    );

    // Agrupar API por numero_venta (sumar lineas, cantidades, montos)
    const apiByOrder = new Map();
    for (const order of orders) {
      const parts = toColombiaDateParts(order.date_closed || order.date_created);
      if (!parts) continue;

      const packId = order.pack_id || null;
      const numeroVenta = packId ? String(packId) : String(order.id);
      const lineas = order.order_items || [];
      let cantidad = 0;
      let monto = 0;
      for (const li of lineas) {
        const q = Number(li.quantity) || 0;
        const up = Number(li.unit_price) || 0;
        cantidad += q;
        monto += Math.round(up * q);
      }

      apiByOrder.set(numeroVenta, {
        numero_venta: numeroVenta,
        fecha: parts.iso,
        lineas: lineas.length,
        cantidad,
        monto,
        estado_meli: order.status,
      });
    }

    // ---- 2. Traer filas oficiales del Excel en el mismo rango
    const [excelRows] = await dbPool.query(
      `
      SELECT numero_venta, fecha, estado,
             COUNT(*) AS lineas,
             COALESCE(SUM(cantidad), 0) AS cantidad,
             COALESCE(SUM(monto_reportado_cop), 0) AS monto
      FROM ventas_ml
      WHERE origen_dato IN ('mercadolibre_oficial', 'manual_historico')
        AND fecha BETWEEN $1 AND $2
        AND numero_venta IS NOT NULL
      GROUP BY numero_venta, fecha, estado
      `,
      [from, to]
    );

    const excelByOrder = new Map();
    for (const r of excelRows) {
      excelByOrder.set(String(r.numero_venta), {
        numero_venta: String(r.numero_venta),
        fecha: r.fecha,
        lineas: Number(r.lineas),
        cantidad: Number(r.cantidad),
        monto: Math.round(Number(r.monto)),
        estado_excel: r.estado,
      });
    }

    // ---- 3. Comparar
    const allIds = new Set([...apiByOrder.keys(), ...excelByOrder.keys()]);

    let perfecto = 0;
    let cantidadOkMontoDiff = 0;
    let cantidadDiff = 0;
    let soloApi = 0;
    let soloExcel = 0;

    let totalApiCantidad = 0;
    let totalApiMonto = 0;
    let totalExcelCantidad = 0;
    let totalExcelMonto = 0;

    const discrepanciasMonto = []; // top N con mayor diferencia
    const huerfanasApi = [];
    const huerfanasExcel = [];

    for (const id of allIds) {
      const a = apiByOrder.get(id);
      const e = excelByOrder.get(id);

      if (a) { totalApiCantidad += a.cantidad; totalApiMonto += a.monto; }
      if (e) { totalExcelCantidad += e.cantidad; totalExcelMonto += e.monto; }

      if (a && !e) {
        soloApi += 1;
        huerfanasApi.push(a);
        continue;
      }
      if (e && !a) {
        soloExcel += 1;
        huerfanasExcel.push(e);
        continue;
      }
      // Ambos
      const diffCantidad = a.cantidad - e.cantidad;
      const diffMonto = a.monto - e.monto;

      if (diffCantidad === 0 && diffMonto === 0) {
        perfecto += 1;
      } else if (diffCantidad === 0) {
        cantidadOkMontoDiff += 1;
        discrepanciasMonto.push({
          numero_venta: id, fecha: a.fecha,
          api_monto: a.monto, excel_monto: e.monto,
          diff: diffMonto, diff_pct: e.monto > 0 ? (diffMonto / e.monto) * 100 : null,
        });
      } else {
        cantidadDiff += 1;
        discrepanciasMonto.push({
          numero_venta: id, fecha: a.fecha,
          api_cantidad: a.cantidad, excel_cantidad: e.cantidad, diff_cantidad: diffCantidad,
          api_monto: a.monto, excel_monto: e.monto, diff_monto: diffMonto,
        });
      }
    }

    discrepanciasMonto.sort((x, y) =>
      Math.abs(Number(y.diff || y.diff_monto || 0)) -
      Math.abs(Number(x.diff || x.diff_monto || 0))
    );

    const totalAmbos = perfecto + cantidadOkMontoDiff + cantidadDiff;
    const matchRatePerf = totalAmbos > 0 ? (perfecto / totalAmbos) * 100 : 0;
    const matchRateCantidad = totalAmbos > 0
      ? ((perfecto + cantidadOkMontoDiff) / totalAmbos) * 100
      : 0;

    return {
      rango: { from, to },
      conteos: {
        api: apiByOrder.size,
        excel: excelByOrder.size,
        ambos: totalAmbos,
        solo_api: soloApi,
        solo_excel: soloExcel,
        match_perfecto: perfecto,
        match_cantidad_ok_monto_diff: cantidadOkMontoDiff,
        match_cantidad_diff: cantidadDiff,
      },
      tasas: {
        match_perfecto_pct: Math.round(matchRatePerf * 100) / 100,
        match_cantidad_pct: Math.round(matchRateCantidad * 100) / 100,
      },
      totales: {
        api_cantidad: totalApiCantidad, api_monto_cop: totalApiMonto,
        excel_cantidad: totalExcelCantidad, excel_monto_cop: totalExcelMonto,
        diff_cantidad: totalApiCantidad - totalExcelCantidad,
        diff_monto_cop: totalApiMonto - totalExcelMonto,
        diff_monto_pct: totalExcelMonto > 0
          ? Math.round(((totalApiMonto - totalExcelMonto) / totalExcelMonto) * 10000) / 100
          : null,
      },
      top_discrepancias_monto: discrepanciasMonto.slice(0, 10),
      huerfanas_solo_api: huerfanasApi.slice(0, 10),
      huerfanas_solo_excel: huerfanasExcel.slice(0, 10),
    };
  };

  // ---------------------------------------------------------------------------
  // Lectura del sync_log (para futura ruta admin)
  // ---------------------------------------------------------------------------
  const getLastSyncs = async (limit = 10) => {
    const [rows] = await dbPool.query(
      `SELECT id, inicio, fin, duracion_ms, rango_desde, rango_hasta,
              ordenes_procesadas, ordenes_nuevas, ordenes_actualizadas,
              errores, mensaje, estado
       FROM sync_log
       ORDER BY inicio DESC
       LIMIT $1`,
      [Math.min(Math.max(Number(limit) || 10, 1), 100)]
    );
    return rows;
  };

  return {
    syncRecentOrders,
    getLastSyncs,
    reconcileWithExcel,
  };
};
