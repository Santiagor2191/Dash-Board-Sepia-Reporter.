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

    return { total: results.length, results };
  };

  const getResumen = async () => {
    const [[porAnio], [total]] = await Promise.all([
      dbPool.query(`
        SELECT anio, COUNT(*) AS filas,
               SUM(monto_reportado_cop) AS revenue,
               SUM(ingresos_productos_cop) AS ingresos
        FROM ventas_ml
        GROUP BY anio ORDER BY anio
      `),
      dbPool.query("SELECT COUNT(*) AS total FROM ventas_ml"),
    ]);

    return {
      total: Number(total[0].total),
      porAnio: porAnio.map((item) => ({
        anio: Number(item.anio),
        filas: Number(item.filas),
        revenue: Number(item.revenue),
        ingresos: Number(item.ingresos),
      })),
    };
  };

  const getInteligencia = async () => {
    // Todas las queries corren en paralelo — de ~600ms secuencial a ~100ms.
    const [
      [topProductos],
      [crossSell],
      [estacionalidad],
      [productosEnCaida],
      [ciudades],
      [ticketCat],
      [concentracion],
    ] = await Promise.all([
      // 1. Top productos con crecimiento
      dbPool.query(`
        SELECT producto,
               SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '3 months'
                        THEN monto_reportado_cop ELSE 0 END)              AS revenue_actual,
               SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '6 months'
                         AND fecha <  CURRENT_DATE - INTERVAL '3 months'
                        THEN monto_reportado_cop ELSE 0 END)              AS revenue_anterior,
               SUM(monto_reportado_cop)                                   AS revenue,
               COUNT(*)                                                   AS ordenes
        FROM ventas_ml
        WHERE producto IS NOT NULL
        GROUP BY producto
        HAVING SUM(monto_reportado_cop) > 0
        ORDER BY revenue DESC
        LIMIT 10
      `),

      // 2. Cross-sell
      dbPool.query(`
        SELECT a.producto AS producto_a, b.producto AS producto_b,
               COUNT(DISTINCT a.comprador)                              AS veces,
               SUM(a.monto_reportado_cop) + SUM(b.monto_reportado_cop) AS revenue_combinado
        FROM ventas_ml a
        JOIN ventas_ml b ON a.comprador = b.comprador
                        AND a.producto < b.producto
                        AND a.comprador IS NOT NULL
                        AND a.comprador != ''
        GROUP BY a.producto, b.producto
        HAVING COUNT(DISTINCT a.comprador) >= 2
        ORDER BY veces DESC
        LIMIT 6
      `),

      // 3. Estacionalidad
      dbPool.query(`
        SELECT num_mes,
               TO_CHAR(TO_DATE(num_mes::text, 'MM'), 'Mon') AS mes,
               ROUND(AVG(revenue_mensual))                  AS revenue
        FROM (
          SELECT anio, num_mes, SUM(monto_reportado_cop) AS revenue_mensual
          FROM ventas_ml
          WHERE monto_reportado_cop IS NOT NULL
          GROUP BY anio, num_mes
        ) sub
        GROUP BY num_mes
        ORDER BY num_mes
      `),

      // 4. Productos en caida
      dbPool.query(`
        SELECT producto,
               SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '6 months'
                         AND fecha <  CURRENT_DATE - INTERVAL '3 months'
                        THEN monto_reportado_cop ELSE 0 END) AS revenue_anterior,
               SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '3 months'
                        THEN monto_reportado_cop ELSE 0 END) AS revenue_actual
        FROM ventas_ml
        WHERE producto IS NOT NULL
        GROUP BY producto
        HAVING SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '6 months'
                         AND fecha <  CURRENT_DATE - INTERVAL '3 months'
                        THEN monto_reportado_cop ELSE 0 END) > 0
           AND SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '3 months'
                        THEN monto_reportado_cop ELSE 0 END)
             < SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '6 months'
                         AND fecha <  CURRENT_DATE - INTERVAL '3 months'
                        THEN monto_reportado_cop ELSE 0 END) * 0.8
        ORDER BY (SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '3 months'
                           THEN monto_reportado_cop ELSE 0 END)
                - SUM(CASE WHEN fecha >= CURRENT_DATE - INTERVAL '6 months'
                            AND fecha < CURRENT_DATE - INTERVAL '3 months'
                           THEN monto_reportado_cop ELSE 0 END)) ASC
        LIMIT 10
      `),

      // 5. Ciudades rentables — porcentaje calculado en SQL con window function
      dbPool.query(`
        SELECT ciudad,
               SUM(monto_reportado_cop)                                       AS revenue,
               COUNT(*)                                                       AS ordenes,
               ROUND(SUM(monto_reportado_cop) * 100.0
                     / NULLIF(SUM(SUM(monto_reportado_cop)) OVER (), 0), 2)  AS porcentaje
        FROM ventas_ml
        WHERE ciudad IS NOT NULL AND ciudad != ''
        GROUP BY ciudad
        ORDER BY revenue DESC
        LIMIT 10
      `),

      // 6. Ticket por categoria
      dbPool.query(`
        SELECT COALESCE(categoria, 'General') AS categoria,
               ROUND(AVG(monto_reportado_cop)) AS ticket_promedio,
               COUNT(*)                        AS ordenes,
               SUM(monto_reportado_cop)        AS revenue
        FROM ventas_ml
        WHERE monto_reportado_cop IS NOT NULL AND monto_reportado_cop > 0
        GROUP BY categoria
        ORDER BY ticket_promedio DESC
      `),

      // 7. Concentracion de revenue — window function, sin traer todos los productos a Node
      dbPool.query(`
        WITH producto_revenue AS (
          SELECT producto,
                 SUM(monto_reportado_cop) AS revenue
          FROM ventas_ml
          WHERE producto IS NOT NULL AND monto_reportado_cop IS NOT NULL
          GROUP BY producto
        ),
        acumulados AS (
          SELECT producto, revenue,
                 SUM(revenue) OVER ()                                           AS total,
                 SUM(revenue) OVER (ORDER BY revenue DESC
                                    ROWS UNBOUNDED PRECEDING)                  AS acumulado_running
          FROM producto_revenue
        )
        SELECT producto,
               revenue,
               ROUND(revenue * 100.0 / NULLIF(total, 0), 2)             AS porcentaje,
               ROUND(acumulado_running * 100.0 / NULLIF(total, 0), 2)   AS porcentaje_acumulado
        FROM acumulados
        WHERE acumulado_running - revenue < total * 0.6
        ORDER BY revenue DESC
      `),
    ]);

    return {
      topProductos: topProductos.map((p) => ({
        producto: p.producto,
        revenue: Number(p.revenue),
        ordenes: Number(p.ordenes),
        crecimiento:
          Number(p.revenue_anterior) > 0
            ? ((Number(p.revenue_actual) - Number(p.revenue_anterior)) /
                Number(p.revenue_anterior)) * 100
            : Number(p.revenue_actual) > 0 ? 100 : 0,
      })),

      crossSell: crossSell.map((item) => ({
        producto_a: item.producto_a,
        producto_b: item.producto_b,
        veces: Number(item.veces),
        revenue_combinado: Number(item.revenue_combinado),
      })),

      estacionalidad: estacionalidad.map((item) => ({
        num_mes: Number(item.num_mes),
        mes: item.mes,
        revenue: Number(item.revenue),
      })),

      productosEnCaida: productosEnCaida.map((p) => ({
        producto: p.producto,
        revenue_anterior: Number(p.revenue_anterior),
        revenue_actual: Number(p.revenue_actual),
        cambio:
          ((Number(p.revenue_actual) - Number(p.revenue_anterior)) /
            Number(p.revenue_anterior)) * 100,
      })),

      ciudadesRentables: ciudades.map((c) => ({
        ciudad: c.ciudad,
        revenue: Number(c.revenue),
        ordenes: Number(c.ordenes),
        porcentaje: Number(c.porcentaje),
      })),

      ticketPorCategoria: ticketCat.map((t) => ({
        categoria: t.categoria,
        ticket_promedio: Number(t.ticket_promedio),
        ordenes: Number(t.ordenes),
        revenue: Number(t.revenue),
      })),

      concentracionRevenue: {
        top_n: concentracion.length,
        porcentaje: concentracion.length > 0
          ? Number(concentracion.at(-1).porcentaje_acumulado)
          : 0,
        productos: concentracion.map((p) => ({
          producto: p.producto,
          revenue: Number(p.revenue),
          porcentaje: Number(p.porcentaje),
        })),
      },
    };
  };

  return { getVentas, getResumen, getInteligencia };
};
