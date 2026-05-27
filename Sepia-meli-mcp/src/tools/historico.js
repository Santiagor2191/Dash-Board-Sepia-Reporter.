import { dbQuery } from "../dbPool.js";

const buildVentasQuery = ({ from, to, categoria, producto, limit }) => {
  const where = [];
  const params = [];
  let i = 1;

  if (from) {
    where.push(`fecha >= $${i++}`);
    params.push(from);
  }
  if (to) {
    where.push(`fecha <= $${i++}`);
    params.push(to);
  }
  if (categoria) {
    where.push(`LOWER(categoria) = LOWER($${i++})`);
    params.push(categoria);
  }
  if (producto) {
    where.push(`LOWER(producto) LIKE LOWER($${i++})`);
    params.push(`%${producto}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limitClause = limit ? `LIMIT ${Number(limit)}` : "";

  return {
    text: `
      SELECT id, fecha, anio, num_mes, dia, estado, producto, categoria,
             variante_talla, cantidad, monto_reportado_cop,
             ingresos_productos_cop, sku, publicacion_id,
             precio_unitario_publicacion_cop, ciudad, comprador
      FROM ventas_ml
      ${whereClause}
      ORDER BY fecha DESC
      ${limitClause}
    `,
    params,
  };
};

export const historicoToolDefinitions = [
  {
    name: "historico_ventas",
    description:
      "Consulta el historico de ventas desde la base de datos PostgreSQL (tabla ventas_ml). Permite filtrar por rango de fechas, categoria y producto.",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Fecha inicial en formato YYYY-MM-DD",
        },
        to: {
          type: "string",
          description: "Fecha final en formato YYYY-MM-DD",
        },
        categoria: {
          type: "string",
          description: "Filtrar por categoria exacta (ej: Dama, Niña, Caballero)",
        },
        producto: {
          type: "string",
          description: "Filtrar por nombre de producto (busqueda parcial)",
        },
        limit: {
          type: "number",
          description: "Maximo de filas a devolver (default 500)",
        },
      },
    },
    handler: async ({ from, to, categoria, producto, limit = 500 } = {}) => {
      const { text, params } = buildVentasQuery({
        from,
        to,
        categoria,
        producto,
        limit,
      });
      const rows = await dbQuery(text, params);

      const totalRevenue = rows.reduce(
        (sum, r) => sum + (Number(r.monto_reportado_cop) || 0),
        0,
      );
      const totalQty = rows.reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);

      return {
        filters: { from, to, categoria, producto },
        total_rows: rows.length,
        total_revenue_cop: Math.round(totalRevenue),
        total_quantity: totalQty,
        rows,
      };
    },
  },
  {
    name: "top_productos",
    description:
      "Devuelve el top de productos historicos por ingresos o por cantidad vendida en un periodo. Util para 'cual fue mi producto mas vendido este mes/año'.",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Fecha inicial YYYY-MM-DD",
        },
        to: {
          type: "string",
          description: "Fecha final YYYY-MM-DD",
        },
        order_by: {
          type: "string",
          enum: ["ingresos", "cantidad"],
          description: "Criterio de ordenamiento (default: ingresos)",
        },
        limit: {
          type: "number",
          description: "Cantidad de productos en el top (default 10)",
        },
      },
    },
    handler: async ({ from, to, order_by = "ingresos", limit = 10 } = {}) => {
      const where = ["estado IS NOT NULL"];
      const params = [];
      let i = 1;
      if (from) {
        where.push(`fecha >= $${i++}`);
        params.push(from);
      }
      if (to) {
        where.push(`fecha <= $${i++}`);
        params.push(to);
      }

      const orderColumn =
        order_by === "cantidad" ? "total_cantidad" : "total_ingresos";

      const text = `
        SELECT
          producto,
          categoria,
          COUNT(*) AS num_ventas,
          SUM(cantidad) AS total_cantidad,
          SUM(monto_reportado_cop) AS total_ingresos
        FROM ventas_ml
        WHERE ${where.join(" AND ")}
        GROUP BY producto, categoria
        ORDER BY ${orderColumn} DESC NULLS LAST
        LIMIT ${Number(limit)}
      `;

      const rows = await dbQuery(text, params);
      return {
        filters: { from, to, order_by },
        top: rows.map((r) => ({
          producto: r.producto,
          categoria: r.categoria,
          num_ventas: Number(r.num_ventas),
          total_cantidad: Number(r.total_cantidad),
          total_ingresos: Math.round(Number(r.total_ingresos) || 0),
        })),
      };
    },
  },
];
