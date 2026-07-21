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

// Fake mínimo de dbPool para las rutas de Social Media (solo lectura +
// CRUD de competidores). Simula tablas en memoria.
const makeFakeDbPool = () => {
  const posts = [
    { plataforma: "instagram", account_id: "ig1", post_id: "p1", fecha_publicacion: "2026-07-15", permalink: "x", miniatura_url: "y", media_type: "IMAGE", media_product_type: "FEED", caption: "hola", likes: 10, comentarios: 2, reach: 500, saves: 3, shares: 1, synced_at: "2026-07-17" },
  ];
  let competidores = [
    { id: 1, plataforma: "instagram", handle: "compa", nombre_visible: "Comp A", activo: true, last_error: null, last_synced_at: null },
  ];
  let nextId = 2;

  const historial = [
    { seguidores: 900, fecha_snapshot: "2026-07-16" },
    { seguidores: 950, fecha_snapshot: "2026-07-17" },
  ];
  const marcaHistorial = [
    { plataforma: "instagram", seguidores: 590, fecha_snapshot: "2026-07-16" },
    { plataforma: "instagram", seguidores: 594, fecha_snapshot: "2026-07-17" },
  ];
  const competidorPosts = [
    { post_id: "cp1", fecha_publicacion: "2026-07-18", permalink: "x", miniatura_url: "y", media_type: "IMAGE", media_product_type: "FEED", caption: "hola", likes: 5, comentarios: 1 },
  ];

  return {
    query: async (sql, params = []) => {
      if (sql.includes("FROM marca_historial")) return [marcaHistorial];
      if (sql.includes("FROM competidor_posts")) {
        return params[0] === 1 ? [competidorPosts] : [[]];
      }
      if (sql.includes("FROM social_benchmark")) {
        return params[0] === 1 ? [historial] : [[]];
      }
      if (sql.includes("FROM social_posts")) return [posts];
      if (sql.includes("FROM competidores_social c")) return [competidores.map((c) => ({ ...c, competidor_id: c.id, seguidores: null, posts_count: null, engagement_aprox: null, cadencia_semanal: null, fecha_snapshot: null }))];
      if (sql.startsWith("SELECT id, plataforma, handle, nombre_visible, activo")) return [competidores];
      if (sql.startsWith("INSERT INTO competidores_social")) {
        const [plataforma, handle, nombreVisible] = params;
        const existente = competidores.find((c) => c.plataforma === plataforma && c.handle === handle);
        if (existente) {
          existente.activo = true;
          existente.nombre_visible = nombreVisible;
          return [[existente]];
        }
        const nuevo = { id: nextId++, plataforma, handle, nombre_visible: nombreVisible, activo: true, last_error: null, last_synced_at: null };
        competidores.push(nuevo);
        return [[nuevo]];
      }
      if (sql.startsWith("UPDATE competidores_social SET")) {
        const id = params[params.length - 1];
        const comp = competidores.find((c) => c.id === id);
        if (!comp) return [[]];
        // Solo mirar la cláusula SET, no el RETURNING (que siempre menciona
        // todas las columnas independientemente de cuáles se estén actualizando).
        const setClause = sql.split("WHERE")[0];
        const setsNombre = setClause.includes("nombre_visible");
        const setsHandle = setClause.includes("handle");
        const setsActivo = setClause.includes("activo");
        let idx = 0;
        if (setsNombre) comp.nombre_visible = params[idx++];
        if (setsHandle) {
          const nuevoHandle = params[idx++];
          const choque = competidores.find((c) => c.id !== id && c.plataforma === comp.plataforma && c.handle === nuevoHandle);
          if (choque) { const err = new Error("duplicate key"); err.code = "23505"; throw err; }
          comp.handle = nuevoHandle;
        }
        if (setsActivo) comp.activo = params[idx++];
        return [[comp]];
      }
      return [[]];
    },
  };
};

test("GET /db/social-posts devuelve los posts sincronizados", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const { response, data } = await requestJson(server.baseUrl, "/db/social-posts");
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.posts.length, 1);
  assert.equal(data.posts[0].post_id, "p1");
});

test("GET /db/social-benchmark devuelve competidores activos", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const { response, data } = await requestJson(server.baseUrl, "/db/social-benchmark");
  assert.equal(response.status, 200);
  assert.equal(data.competidores.length, 1);
  assert.equal(data.competidores[0].handle, "compa");
});

test("GET /db/social-benchmark-historial/:id devuelve la serie de seguidores", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const { response, data } = await requestJson(server.baseUrl, "/db/social-benchmark-historial/1");
  assert.equal(response.status, 200);
  assert.equal(data.historial.length, 2);
  assert.equal(data.historial[1].seguidores, 950);

  const malo = await requestJson(server.baseUrl, "/db/social-benchmark-historial/abc");
  assert.equal(malo.response.status, 400);
});

test("GET /db/competidor-posts/:id devuelve las publicaciones del competidor", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const { response, data } = await requestJson(server.baseUrl, "/db/competidor-posts/1");
  assert.equal(response.status, 200);
  assert.equal(data.posts.length, 1);
  assert.equal(data.posts[0].post_id, "cp1");

  const malo = await requestJson(server.baseUrl, "/db/competidor-posts/abc");
  assert.equal(malo.response.status, 400);
});

test("GET /db/marca-historial devuelve el snapshot propio", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const { response, data } = await requestJson(server.baseUrl, "/db/marca-historial");
  assert.equal(response.status, 200);
  assert.equal(data.historial.length, 2);
  assert.equal(data.historial[1].seguidores, 594);
});

test("POST /db/competidores-social normaliza el handle y valida plataforma", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const malo = await requestJson(server.baseUrl, "/db/competidores-social", {
    method: "POST",
    body: { plataforma: "tiktok", handle: "x" },
  });
  assert.equal(malo.response.status, 400);

  const bueno = await requestJson(server.baseUrl, "/db/competidores-social", {
    method: "POST",
    body: { plataforma: "instagram", handle: "@Compedor_Nuevo ", nombre_visible: "Competidor Nuevo" },
  });
  assert.equal(bueno.response.status, 201);
  assert.equal(bueno.data.competidor.handle, "compedor_nuevo"); // sin @, minusculas, sin espacios
});

test("PUT /db/competidores-social/:id permite editar el handle y detecta choques", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const editado = await requestJson(server.baseUrl, "/db/competidores-social/1", {
    method: "PUT",
    body: { handle: "@Nuevo_Handle " },
  });
  assert.equal(editado.response.status, 200);
  assert.equal(editado.data.competidor.handle, "nuevo_handle"); // normalizado igual que en POST

  await requestJson(server.baseUrl, "/db/competidores-social", {
    method: "POST",
    body: { plataforma: "instagram", handle: "otro" },
  });
  const choque = await requestJson(server.baseUrl, "/db/competidores-social/1", {
    method: "PUT",
    body: { handle: "otro" },
  });
  assert.equal(choque.response.status, 409);
});

test("PUT /db/competidores-social/:id desactiva sin borrar histórico", async (t) => {
  const router = createDbRouter({ dbPool: makeFakeDbPool() });
  const server = await startServer({ mountPath: "/db", router });
  t.after(async () => server.close());

  const { response, data } = await requestJson(server.baseUrl, "/db/competidores-social/1", {
    method: "PUT",
    body: { activo: false },
  });
  assert.equal(response.status, 200);
  assert.equal(data.competidor.activo, false);
});
