const inferCategoryFromProduct = (producto) => {
  if (!producto) return "General";
  const p = producto.toLowerCase();
  if (/\bni[ñn]a\b/.test(p) && /\bni[ñn]o\b/.test(p)) return "Niños";
  if (/\bni[ñn]a\b/.test(p) || /\bbeb[eé]\s*(ni[ñn]a|mujer)/.test(p)) return "Niña";
  if (/\bni[ñn]o\b/.test(p) || /\bbeb[eé]\b/.test(p)) return "Niño";
  if (/\bmujer\b|\bdama\b|\bnovia\b|\bquincea[ñn]era\b/.test(p)) return "Dama";
  if (/\bhombre\b|\bcaballero\b/.test(p)) return "Caballero";
  if (/\bunisex\b/.test(p)) return "Unisex";
  return "General";
};

const mapEstadoToStatus = (estado, monto) => {
  if (monto === null || monto === undefined) return "pending";
  if (!estado) return Number(monto) === 0 ? "cancelled" : "paid";

  const e = estado.toLowerCase();

  if (e.includes("cancelada") || e.includes("cancelaste") || e.includes("cancelado")) {
    return "cancelled";
  }

  if ((e.includes("devol") || e.includes("devuelt")) && e.includes("reembolso")) {
    return "cancelled";
  }

  if (e.includes("devuelto el") || (e.includes("devoluci") && e.includes("revisar"))) {
    return "cancelled";
  }

  if (e.includes("te devolveremos")) return "cancelled";
  if (e.includes("reembolso") && e.includes("comprador")) return "cancelled";
  if (e.includes("reclamo cerrado") && !e.includes("reembolso")) return "paid";
  if (e.includes("te dimos el dinero")) return "paid";

  if (
    e.includes("entregado") ||
    e.includes("entregada") ||
    e.includes("concretada") ||
    e.includes("paquete de") ||
    e.includes("en camino") ||
    e.includes("etiqueta") ||
    e.includes("cambio entregado") ||
    e.includes("solicitud de cambio")
  ) {
    return "paid";
  }

  if (Number(monto) > 0) return "paid";
  return "cancelled";
};

export const createHistoricalSalesService = ({ dbPool }) => {
  const getVentas = async () => {
    const [rows] = await dbPool.query(`
      SELECT id, anio, mes, num_mes, dia, fecha, numero_venta, estado,
             producto, categoria, variante_talla, cantidad,
             monto_reportado_cop, ingresos_productos_cop,
             cargo_venta_impuestos_cop, ingresos_envio_cop,
             costos_envio_cop, anulaciones_reembolsos_cop,
             sku, publicacion_id, precio_unitario_publicacion_cop,
             comprador, ciudad, forma_entrega, origen_dato
      FROM ventas_ml
      ORDER BY fecha ASC
    `);

    const results = rows.map((row) => {
      const amount = Number(row.monto_reportado_cop) || 0;
      const price = Number(row.precio_unitario_publicacion_cop) || amount;
      const qty = Number(row.cantidad) || 1;
      const date = row.fecha
        ? new Date(row.fecha).toISOString()
        : new Date(row.anio, (row.num_mes || 1) - 1, row.dia || 1).toISOString();

      return {
        id: row.numero_venta || row.id,
        date,
        status: mapEstadoToStatus(row.estado, row.monto_reportado_cop),
        amount,
        paidAmount: Number(row.ingresos_productos_cop) || amount,
        item: {
          id: row.publicacion_id || `HIST-${row.id}`,
          sku: row.sku || "-",
          title: row.producto || "Producto sin nombre",
          price,
          cost: Math.round(price * 0.4),
          category: row.categoria || inferCategoryFromProduct(row.producto),
          stock: 0,
        },
        qty,
        buyer: row.comprador || `buyer-${row.id}`,
        ciudad: row.ciudad || null,
        formaEntrega: row.forma_entrega || null,
        origenDato: row.origen_dato || null,
      };
    });

    return {
      total: results.length,
      results,
    };
  };

  const getResumen = async () => {
    const [porAnio] = await dbPool.query(`
      SELECT anio, COUNT(*) AS filas,
             SUM(monto_reportado_cop) AS revenue,
             SUM(ingresos_productos_cop) AS ingresos
      FROM ventas_ml
      GROUP BY anio ORDER BY anio
    `);
    const [total] = await dbPool.query("SELECT COUNT(*) AS total FROM ventas_ml");

    const porAnioFormatted = porAnio.map((item) => ({
      anio: Number(item.anio),
      filas: Number(item.filas),
      revenue: Number(item.revenue),
      ingresos: Number(item.ingresos),
    }));

    return {
      total: Number(total[0].total),
      porAnio: porAnioFormatted,
    };
  };

  const getInteligencia = async () => {
    const [topProductos] = await dbPool.query(`
      SELECT producto,
             SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '3 months' THEN monto_reportado_cop ELSE 0 END) AS revenue_actual,
             SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '6 months'
                       AND fecha < CURRENT_DATE - INTERVAL '3 months' THEN monto_reportado_cop ELSE 0 END) AS revenue_anterior,
             SUM(monto_reportado_cop) AS revenue,
             COUNT(*) AS ordenes
      FROM ventas_ml
      WHERE producto IS NOT NULL
      GROUP BY producto
      HAVING revenue > 0
      ORDER BY revenue DESC
      LIMIT 10
    `);
    const topConCrecimiento = topProductos.map((producto) => ({
      producto: producto.producto,
      revenue: Number(producto.revenue),
      ordenes: Number(producto.ordenes),
      crecimiento:
        Number(producto.revenue_anterior) > 0
          ? ((Number(producto.revenue_actual) - Number(producto.revenue_anterior)) /
              Number(producto.revenue_anterior)) *
            100
          : Number(producto.revenue_actual) > 0
            ? 100
            : 0,
    }));

    const [crossSell] = await dbPool.query(`
      SELECT a.producto AS producto_a, b.producto AS producto_b,
             COUNT(DISTINCT a.comprador) AS veces,
             SUM(a.monto_reportado_cop) + SUM(b.monto_reportado_cop) AS revenue_combinado
      FROM ventas_ml a
      JOIN ventas_ml b ON a.comprador = b.comprador
                       AND a.producto < b.producto
                       AND a.comprador IS NOT NULL
                       AND a.comprador != ''
      GROUP BY a.producto, b.producto
      HAVING veces >= 2
      ORDER BY veces DESC
      LIMIT 6
    `);
    const crossSellFormatted = crossSell.map((item) => ({
      producto_a: item.producto_a,
      producto_b: item.producto_b,
      veces: Number(item.veces),
      revenue_combinado: Number(item.revenue_combinado),
    }));

    const [estacionalidad] = await dbPool.query(`
      SELECT num_mes,
             CASE num_mes
               WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
               WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
               WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
               WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
             END AS mes,
             ROUND(AVG(revenue_mensual)) AS revenue
      FROM (
        SELECT anio, num_mes, SUM(monto_reportado_cop) AS revenue_mensual
        FROM ventas_ml
        WHERE monto_reportado_cop IS NOT NULL
        GROUP BY anio, num_mes
      ) sub
      GROUP BY num_mes
      ORDER BY num_mes
    `);
    const estacionalidadFormatted = estacionalidad.map((item) => ({
      num_mes: Number(item.num_mes),
      mes: item.mes,
      revenue: Number(item.revenue),
    }));

    const [productosEnCaida] = await dbPool.query(`
      SELECT producto,
             SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '6 months'
                       AND fecha < CURRENT_DATE - INTERVAL '3 months' THEN monto_reportado_cop ELSE 0 END) AS revenue_anterior,
             SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '3 months' THEN monto_reportado_cop ELSE 0 END) AS revenue_actual
      FROM ventas_ml
      WHERE producto IS NOT NULL
      GROUP BY producto
      HAVING revenue_anterior > 0 AND revenue_actual < revenue_anterior * 0.8
      ORDER BY (revenue_actual - revenue_anterior) ASC
      LIMIT 10
    `);
    const productosEnCaidaFormatted = productosEnCaida.map((producto) => ({
      producto: producto.producto,
      revenue_anterior: Number(producto.revenue_anterior),
      revenue_actual: Number(producto.revenue_actual),
      cambio:
        ((Number(producto.revenue_actual) - Number(producto.revenue_anterior)) /
          Number(producto.revenue_anterior)) *
        100,
    }));

    const [ciudades] = await dbPool.query(`
      SELECT ciudad, SUM(monto_reportado_cop) AS revenue, COUNT(*) AS ordenes
      FROM ventas_ml
      WHERE ciudad IS NOT NULL AND ciudad != ''
      GROUP BY ciudad
      ORDER BY revenue DESC
      LIMIT 10
    `);
    const totalRevenueCiudades = ciudades.reduce(
      (sum, ciudad) => sum + Number(ciudad.revenue),
      0,
    );
    const ciudadesFormatted = ciudades.map((ciudad) => ({
      ciudad: ciudad.ciudad,
      revenue: Number(ciudad.revenue),
      ordenes: Number(ciudad.ordenes),
      porcentaje:
        totalRevenueCiudades > 0
          ? (Number(ciudad.revenue) / totalRevenueCiudades) * 100
          : 0,
    }));

    const [ticketCat] = await dbPool.query(`
      SELECT COALESCE(categoria, 'General') AS categoria,
             ROUND(AVG(monto_reportado_cop)) AS ticket_promedio,
             COUNT(*) AS ordenes,
             SUM(monto_reportado_cop) AS revenue
      FROM ventas_ml
      WHERE monto_reportado_cop IS NOT NULL AND monto_reportado_cop > 0
      GROUP BY categoria
      ORDER BY ticket_promedio DESC
    `);
    const ticketFormatted = ticketCat.map((ticket) => ({
      categoria: ticket.categoria,
      ticket_promedio: Number(ticket.ticket_promedio),
      ordenes: Number(ticket.ordenes),
      revenue: Number(ticket.revenue),
    }));

    const [allProducts] = await dbPool.query(`
      SELECT producto, SUM(monto_reportado_cop) AS revenue
      FROM ventas_ml
      WHERE producto IS NOT NULL AND monto_reportado_cop IS NOT NULL
      GROUP BY producto
      ORDER BY revenue DESC
    `);
    const totalRevenueAll = allProducts.reduce(
      (sum, producto) => sum + Number(producto.revenue),
      0,
    );
    let acumulado = 0;
    const topConcentracion = [];
    for (const producto of allProducts) {
      acumulado += Number(producto.revenue);
      topConcentracion.push({
        producto: producto.producto,
        revenue: Number(producto.revenue),
        porcentaje: (Number(producto.revenue) / totalRevenueAll) * 100,
      });
      if (acumulado / totalRevenueAll >= 0.6) break;
    }

    return {
      topProductos: topConCrecimiento,
      crossSell: crossSellFormatted,
      estacionalidad: estacionalidadFormatted,
      productosEnCaida: productosEnCaidaFormatted,
      ciudadesRentables: ciudadesFormatted,
      ticketPorCategoria: ticketFormatted,
      concentracionRevenue: {
        top_n: topConcentracion.length,
        porcentaje: totalRevenueAll > 0 ? (acumulado / totalRevenueAll) * 100 : 0,
        productos: topConcentracion,
      },
    };
  };

  return {
    getVentas,
    getResumen,
    getInteligencia,
  };
};
