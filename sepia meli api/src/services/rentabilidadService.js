export const createRentabilidadService = ({ rentabilidadPool, dbPool }) => {
  const getResumen = async () => {
    const [rows] = await rentabilidadPool.query(`
      SELECT
        COUNT(*) AS publicaciones_activas,
        SUM(CASE WHEN utilidad_sepia > 0 THEN 1 ELSE 0 END) AS rentables,
        SUM(CASE WHEN utilidad_sepia <= 0 THEN 1 ELSE 0 END) AS con_perdida,
        ROUND(AVG(utilidad_sepia), 0) AS utilidad_promedio,
        ROUND(SUM(utilidad_sepia), 0) AS utilidad_total_potencial
      FROM publicaciones_rentabilidad
      WHERE utilidad_sepia IS NOT NULL AND precio_venta_real > 0
    `);
    const r = rows[0];
    return {
      publicaciones_activas: Number(r.publicaciones_activas),
      rentables: Number(r.rentables),
      con_perdida: Number(r.con_perdida),
      utilidad_promedio: Number(r.utilidad_promedio),
      utilidad_total_potencial: Number(r.utilidad_total_potencial),
    };
  };

  const getEstructuraCostos = async () => {
    const [rows] = await rentabilidadPool.query(`
      SELECT
        ROUND(SUM(costo_inicial)::numeric / SUM(precio_venta_real) * 100, 1) AS pct_costo_producto,
        ROUND(SUM(cargo_por_venta_ml)::numeric / SUM(precio_venta_real) * 100, 1) AS pct_comision_ml,
        ROUND(SUM(costo_envio)::numeric / SUM(precio_venta_real) * 100, 1) AS pct_envio,
        ROUND(SUM(costo_publicidad)::numeric / SUM(precio_venta_real) * 100, 1) AS pct_publicidad,
        ROUND(SUM(costos_financieros)::numeric / SUM(precio_venta_real) * 100, 1) AS pct_financieros,
        ROUND(SUM(rete_fuente + ica)::numeric / SUM(precio_venta_real) * 100, 1) AS pct_impuestos,
        ROUND(SUM(utilidad_sepia)::numeric / SUM(precio_venta_real) * 100, 1) AS pct_margen_neto
      FROM publicaciones_rentabilidad
      WHERE utilidad_sepia IS NOT NULL AND precio_venta_real > 0
    `);
    const r = rows[0];
    return {
      pct_costo_producto: Number(r.pct_costo_producto),
      pct_comision_ml: Number(r.pct_comision_ml),
      pct_envio: Number(r.pct_envio),
      pct_publicidad: Number(r.pct_publicidad),
      pct_financieros: Number(r.pct_financieros),
      pct_impuestos: Number(r.pct_impuestos),
      pct_margen_neto: Number(r.pct_margen_neto),
    };
  };

  const getTopRentables = async () => {
    const [rows] = await rentabilidadPool.query(`
      SELECT
        id_publicaciones, titulo, precio_venta_real, utilidad_sepia,
        ROUND((utilidad_sepia / precio_venta_real) * 100, 1) AS margen_pct
      FROM publicaciones_rentabilidad
      WHERE utilidad_sepia IS NOT NULL AND precio_venta_real > 0
      ORDER BY utilidad_sepia DESC
      LIMIT 10
    `);
    return rows.map((r) => ({
      id_publicaciones: r.id_publicaciones,
      titulo: r.titulo,
      precio_venta_real: Number(r.precio_venta_real),
      utilidad_sepia: Number(r.utilidad_sepia),
      margen_pct: Number(r.margen_pct),
    }));
  };

  const getConPerdida = async () => {
    const [rows] = await rentabilidadPool.query(`
      SELECT
        id_publicaciones, titulo, precio_venta_real, costo_total, utilidad_sepia
      FROM publicaciones_rentabilidad
      WHERE utilidad_sepia IS NOT NULL AND utilidad_sepia < 0
      ORDER BY utilidad_sepia ASC
    `);
    return rows.map((r) => ({
      id_publicaciones: r.id_publicaciones,
      titulo: r.titulo,
      precio_venta_real: Number(r.precio_venta_real),
      costo_total: Number(r.costo_total),
      utilidad_sepia: Number(r.utilidad_sepia),
    }));
  };

  const getPremiumVsClasica = async () => {
    const [rows] = await rentabilidadPool.query(`
      SELECT
        tipo_de_publicacion,
        COUNT(*) AS cantidad,
        ROUND(AVG(utilidad_sepia), 0) AS utilidad_promedio,
        ROUND(SUM(utilidad_sepia), 0) AS utilidad_total
      FROM publicaciones_rentabilidad
      WHERE utilidad_sepia IS NOT NULL AND precio_venta_real > 0
      GROUP BY tipo_de_publicacion
    `);
    return rows.map((r) => ({
      tipo_de_publicacion: r.tipo_de_publicacion,
      cantidad: Number(r.cantidad),
      utilidad_promedio: Number(r.utilidad_promedio),
      utilidad_total: Number(r.utilidad_total),
    }));
  };

  const getCostoPorVentas = async () => {
    // Cross-database: ventas_ml lives in mercado_libre_oficial (dbPool),
    // publicaciones_rentabilidad lives in publicaciones_ml_contabilidad (rentabilidadPool).
    // PostgreSQL can't join across databases directly, so we join in application code.

    const [ventas] = await dbPool.query(`
      SELECT publicacion_id, cantidad, monto_reportado_cop
      FROM ventas_ml
      WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
        AND publicacion_id IS NOT NULL
    `);

    if (!ventas.length) {
      return {
        costo_total_productos_vendidos: 0,
        ingreso_total: 0,
        utilidad_real_total: 0,
        margen_real: 0,
      };
    }

    const pubIds = [...new Set(ventas.map((v) => v.publicacion_id))];

    const [costos] = await rentabilidadPool.query(`
      SELECT id_publicaciones, costo_inicial, utilidad_sepia
      FROM publicaciones_rentabilidad
      WHERE id_publicaciones = ANY($1)
    `, [pubIds]);

    const costoMap = new Map();
    for (const c of costos) {
      costoMap.set(c.id_publicaciones, {
        costo_inicial: Number(c.costo_inicial) || 0,
        utilidad_sepia: Number(c.utilidad_sepia) || 0,
      });
    }

    let costoTotal = 0;
    let ingresoTotal = 0;
    let utilidadTotal = 0;

    for (const v of ventas) {
      const qty = Number(v.cantidad) || 1;
      const ingreso = Number(v.monto_reportado_cop) || 0;
      const info = costoMap.get(v.publicacion_id);

      ingresoTotal += ingreso;
      if (info) {
        costoTotal += info.costo_inicial * qty;
        utilidadTotal += info.utilidad_sepia * qty;
      }
    }

    return {
      costo_total_productos_vendidos: Math.round(costoTotal),
      ingreso_total: Math.round(ingresoTotal),
      utilidad_real_total: Math.round(utilidadTotal),
      margen_real: ingresoTotal > 0 ? Math.round((utilidadTotal / ingresoTotal) * 1000) / 10 : 0,
    };
  };

  const getCostosMap = async () => {
    const [rows] = await rentabilidadPool.query(`
      SELECT id_publicaciones, costo_total
      FROM publicaciones_rentabilidad
      WHERE costo_total IS NOT NULL AND costo_total > 0
    `);
    const map = {};
    for (const r of rows) {
      const id = r.id_publicaciones;
      const costo = Number(r.costo_total);
      map[id] = costo;
      // MeLi usa MCO y MCOU para el mismo producto segun si es publicacion
      // historica o actual. Registramos ambas versiones para que el lookup
      // funcione independientemente del formato que tenga ventas_ml.
      if (id.startsWith("MCOU")) {
        map[id.replace("MCOU", "MCO")] = costo;
      } else if (id.startsWith("MCO")) {
        map[id.replace("MCO", "MCOU")] = costo;
      }
    }
    return map;
  };

  return {
    getResumen,
    getEstructuraCostos,
    getTopRentables,
    getConPerdida,
    getPremiumVsClasica,
    getCostoPorVentas,
    getCostosMap,
  };
};
