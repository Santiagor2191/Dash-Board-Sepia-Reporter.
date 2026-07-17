import assert from "node:assert/strict";
import test from "node:test";
import { createTtlCache } from "../../src/utils/ttlCache.js";

test("get() en un miss total devuelve undefined", () => {
  const cache = createTtlCache({ ttlMs: 1000 });
  assert.equal(cache.get("nope"), undefined);
});

test("get() dentro del TTL devuelve fresh:true", () => {
  const cache = createTtlCache({ ttlMs: 10_000 });
  cache.set("k", { valor: 42 });
  const hit = cache.get("k");
  assert.equal(hit.fresh, true);
  assert.deepEqual(hit.data, { valor: 42 });
});

test("get() fuera del TTL devuelve fresh:false pero conserva el dato (fallback)", async () => {
  const cache = createTtlCache({ ttlMs: 10 });
  cache.set("k", { valor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const hit = cache.get("k");
  assert.equal(hit.fresh, false);
  assert.deepEqual(hit.data, { valor: 1 });
});

test("set() limpia todo el cache al superar maxEntries", () => {
  const cache = createTtlCache({ ttlMs: 10_000, maxEntries: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // size pasa a 3, todavia no dispara el chequeo (2 > 2 es falso)
  cache.set("d", 4); // size era 3 (> maxEntries=2) -> limpia antes de guardar "d"
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), undefined);
  assert.notEqual(cache.get("d"), undefined);
});
