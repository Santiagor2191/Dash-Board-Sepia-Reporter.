import assert from "node:assert/strict";
import test from "node:test";
import { createDbRouter } from "../../src/routes/dbRoutes.js";
import { requestJson, startServer } from "../helpers/http.js";

test("db routes exponen ventas, resumen e inteligencia", async (t) => {
  const router = createDbRouter({
    historicalSalesService: {
      getVentas: async () => ({
        total: 1,
        results: [{ id: "VENTA-1", amount: 50000 }],
      }),
      getResumen: async () => ({
        total: 3,
        porAnio: [{ anio: 2025, filas: 3, revenue: 150000 }],
      }),
      getInteligencia: async () => ({
        topProductos: [{ producto: "Gorro", revenue: 150000 }],
        crossSell: [],
        estacionalidad: [],
        productosEnCaida: [],
        ciudadesRentables: [],
        ticketPorCategoria: [],
        concentracionRevenue: { top_n: 1, porcentaje: 100, productos: [] },
      }),
    },
  });

  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const ventas = await requestJson(server.baseUrl, "/db/ventas");
  assert.equal(ventas.response.status, 200);
  assert.equal(ventas.data.ok, true);
  assert.equal(ventas.data.total, 1);

  const resumen = await requestJson(server.baseUrl, "/db/resumen");
  assert.equal(resumen.response.status, 200);
  assert.equal(resumen.data.total, 3);
  assert.equal(resumen.data.porAnio[0].anio, 2025);

  const inteligencia = await requestJson(server.baseUrl, "/db/inteligencia");
  assert.equal(inteligencia.response.status, 200);
  assert.equal(inteligencia.data.topProductos[0].producto, "Gorro");
});

test("db routes devuelven 500 cuando el servicio falla", async (t) => {
  const router = createDbRouter({
    historicalSalesService: {
      getVentas: async () => {
        throw new Error("DB offline");
      },
      getResumen: async () => ({ total: 0, porAnio: [] }),
      getInteligencia: async () => ({}),
    },
  });

  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const ventas = await requestJson(server.baseUrl, "/db/ventas");
  assert.equal(ventas.response.status, 500);
  assert.equal(ventas.data.ok, false);
  assert.equal(ventas.data.mensaje, "No se pudo consultar la base de datos");
  assert.equal("detalle" in ventas.data, false);
});
