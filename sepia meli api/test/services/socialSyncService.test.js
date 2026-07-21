import assert from "node:assert/strict";
import test from "node:test";
import { createSocialSyncService } from "../../src/services/socialSyncService.js";

// dbPool fake: registra cada query ejecutada y devuelve datos canned.
const makeFakeDbPool = ({ competidores = [] } = {}) => {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id, plataforma, handle FROM competidores_social")) {
        return [competidores];
      }
      return [[]];
    },
  };
};

test("syncPosts: fetch exitoso hace un upsert por post", async () => {
  const dbPool = makeFakeDbPool();
  const metaSocialService = {
    fetchPostsForSync: async () => ({
      configured: true,
      posts: [
        { plataforma: "instagram", account_id: "ig1", post_id: "p1", likes: 5, comentarios: 1, reach: 100, saves: 2, shares: 0 },
        { plataforma: "facebook", account_id: "fb1", post_id: "p2", likes: 3, comentarios: 0, reach: null, saves: null, shares: null },
      ],
    }),
    fetchCompetitorBenchmark: async () => { throw new Error("no debería llamarse sin competidores"); },
  };

  const service = createSocialSyncService({ metaSocialService, dbPool });
  const resultado = await service.correrSync();

  assert.equal(resultado.posts.ok, true);
  assert.equal(resultado.posts.posts_sincronizados, 2);
  const upserts = dbPool.calls.filter((c) => c.sql.includes("INSERT INTO social_posts"));
  assert.equal(upserts.length, 2);
});

test("syncPosts: fetch no configurado no crashea, devuelve motivo", async () => {
  const dbPool = makeFakeDbPool();
  const metaSocialService = {
    fetchPostsForSync: async () => ({ configured: false, mensaje: "Falta META_ACCESS_TOKEN" }),
    fetchCompetitorBenchmark: async () => { throw new Error("no debería llamarse"); },
  };

  const service = createSocialSyncService({ metaSocialService, dbPool });
  const resultado = await service.correrSync();

  assert.equal(resultado.posts.ok, false);
  assert.equal(resultado.posts.motivo, "Falta META_ACCESS_TOKEN");
  assert.equal(resultado.posts.posts_sincronizados, 0);
});

test("syncCompetidores: un competidor con error no bloquea a los demás", async () => {
  const competidores = [
    { id: 1, plataforma: "instagram", handle: "compA" },
    { id: 2, plataforma: "instagram", handle: "compB_roto" },
    { id: 3, plataforma: "facebook", handle: "compC" },
  ];
  const dbPool = makeFakeDbPool({ competidores });
  const metaSocialService = {
    fetchPostsForSync: async () => ({ configured: true, posts: [] }),
    fetchCompetitorBenchmark: async ({ handle }) => {
      if (handle === "compB_roto") throw new Error("cuenta no encontrada");
      return { seguidores: 1000, posts_count: 10, engagement_aprox: 0.02, cadencia_semanal: 3 };
    },
  };

  const service = createSocialSyncService({ metaSocialService, dbPool });
  const resultado = await service.correrSync();

  assert.equal(resultado.competidores.ok, 2);
  assert.equal(resultado.competidores.con_error, 1);
  assert.equal(resultado.competidores.total, 3);

  // El competidor roto debe haber quedado con last_error, sin fila de benchmark.
  const updateRoto = dbPool.calls.find(
    (c) => c.sql.includes("UPDATE competidores_social SET last_error") && c.params[0] === 2,
  );
  assert.notEqual(updateRoto, undefined);
  assert.notEqual(updateRoto.params[1], null);

  const benchmarkInserts = dbPool.calls.filter((c) => c.sql.includes("INSERT INTO social_benchmark"));
  assert.equal(benchmarkInserts.length, 2); // solo los 2 que funcionaron
});

test("syncCompetidores: guarda cada post individual del competidor en competidor_posts", async () => {
  const competidores = [{ id: 5, plataforma: "instagram", handle: "compA" }];
  const dbPool = makeFakeDbPool({ competidores });
  const metaSocialService = {
    fetchPostsForSync: async () => ({ configured: true, posts: [] }),
    fetchCompetitorBenchmark: async () => ({
      seguidores: 1000,
      posts_count: 10,
      engagement_aprox: 0.02,
      cadencia_semanal: 3,
      likes_promedio: 50,
      comentarios_promedio: 4,
      pct_reels: 40,
      pct_carousel: 30,
      pct_imagen: 30,
      posts_detalle: [
        { post_id: "p1", fecha_publicacion: "2026-07-18", permalink: "x", miniatura_url: "y", media_type: "IMAGE", media_product_type: "FEED", caption: "hola", likes: 10, comentarios: 1 },
        { post_id: "p2", fecha_publicacion: "2026-07-19", permalink: "x2", miniatura_url: "y2", media_type: "VIDEO", media_product_type: "REELS", caption: "chau", likes: 20, comentarios: 2 },
      ],
    }),
  };

  const service = createSocialSyncService({ metaSocialService, dbPool });
  const resultado = await service.correrSync();

  assert.equal(resultado.competidores.ok, 1);
  const postInserts = dbPool.calls.filter((c) => c.sql.includes("INSERT INTO competidor_posts"));
  assert.equal(postInserts.length, 2);
  assert.equal(postInserts[0].params[1], "p1");
  assert.equal(postInserts[1].params[1], "p2");
});

test("syncMarca: guarda un snapshot por plataforma con datos", async () => {
  const dbPool = makeFakeDbPool();
  const metaSocialService = {
    fetchPostsForSync: async () => ({ configured: true, posts: [] }),
    fetchCompetitorBenchmark: async () => { throw new Error("no debería llamarse"); },
    fetchOwnFollowers: async () => ({ instagram: 500, facebook: 200 }),
  };

  const service = createSocialSyncService({ metaSocialService, dbPool });
  const resultado = await service.correrSync();

  assert.equal(resultado.marca.ok, true);
  assert.equal(resultado.marca.plataformas_guardadas, 2);
  const inserts = dbPool.calls.filter((c) => c.sql.includes("INSERT INTO marca_historial"));
  assert.equal(inserts.length, 2);
});

test("syncMarca: un fallo de Meta no bloquea posts ni competidores", async () => {
  const dbPool = makeFakeDbPool();
  const metaSocialService = {
    fetchPostsForSync: async () => ({ configured: true, posts: [] }),
    fetchCompetitorBenchmark: async () => { throw new Error("no debería llamarse"); },
    fetchOwnFollowers: async () => { throw new Error("token vencido"); },
  };

  const service = createSocialSyncService({ metaSocialService, dbPool });
  const resultado = await service.correrSync();

  assert.equal(resultado.marca.ok, false);
  assert.equal(resultado.marca.motivo, "token vencido");
  assert.equal(resultado.posts.ok, true); // el resto del sync sigue funcionando normal
});

test("syncCompetidores: sin competidores activos, no falla", async () => {
  const dbPool = makeFakeDbPool({ competidores: [] });
  const metaSocialService = {
    fetchPostsForSync: async () => ({ configured: true, posts: [] }),
    fetchCompetitorBenchmark: async () => { throw new Error("no debería llamarse"); },
  };

  const service = createSocialSyncService({ metaSocialService, dbPool });
  const resultado = await service.correrSync();

  assert.equal(resultado.competidores.total, 0);
  assert.equal(resultado.competidores.ok, 0);
  assert.equal(resultado.competidores.con_error, 0);
});
