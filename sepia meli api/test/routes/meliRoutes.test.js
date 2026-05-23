import assert from "node:assert/strict";
import test from "node:test";
import { createMeliRouter } from "../../src/routes/meliRoutes.js";
import { requestJson, startServer } from "../helpers/http.js";

test("meli routes exponen /me y /orders/history", async (t) => {
  const router = createMeliRouter({
    mlGet: async (endpoint, params = {}) => {
      if (endpoint === "/users/me") {
        return { id: 321, nickname: "Sepia" };
      }
      if (endpoint === "/orders/search") {
        assert.equal(params.seller, 321);
        return {
          paging: { total: 1 },
          results: [{ id: "ORDER-1", order_items: [] }],
        };
      }
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
    meliOrdersService: {
      enrichOrdersWithCategoryNames: async (orders) =>
        orders.map((order) => ({ ...order, enriched: true })),
      getSellerOrdersHistory: async () => ({
        paging: { total: 2 },
        results: [{ id: "ORDER-2" }, { id: "ORDER-3" }],
      }),
      getCategoryName: async () => "Categoria",
    },
  });

  const server = await startServer({ mountPath: "/meli", router });
  t.after(async () => server.close());

  const me = await requestJson(server.baseUrl, "/meli/me");
  assert.equal(me.response.status, 200);
  assert.equal(me.data.data.id, 321);

  const history = await requestJson(server.baseUrl, "/meli/orders/history?max=2");
  assert.equal(history.response.status, 200);
  assert.equal(history.data.seller_id, 321);
  assert.equal(history.data.fetched, 2);
  assert.equal(history.data.cached, true);
});

test("meli routes calculan inventario y usan cache en memoria", async (t) => {
  let searchCalls = 0;

  const router = createMeliRouter({
    mlGet: async (endpoint) => {
      if (endpoint === "/users/me") {
        return { id: 555, nickname: "Sepia" };
      }
      if (endpoint === "/users/555/items/search") {
        searchCalls += 1;
        return {
          paging: { total: 1 },
          results: ["MLA-1"],
        };
      }
      if (endpoint === "/items") {
        return [
          {
            code: 200,
            body: {
              id: "MLA-1",
              title: "Gorro impermeable",
              price: 80000,
              currency_id: "COP",
              available_quantity: 1,
              sold_quantity: 10,
              status: "active",
              permalink: "https://meli/item",
              thumbnail: "https://img.test/1.jpg",
              category_id: "C1",
              seller_sku: "SKU-1",
              date_created: "2025-01-01T00:00:00.000Z",
              last_updated: "2025-01-02T00:00:00.000Z",
              listing_type_id: "gold_special",
              condition: "new",
              shipping: { free_shipping: true },
            },
          },
        ];
      }
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
    meliOrdersService: {
      enrichOrdersWithCategoryNames: async (orders) => orders,
      getSellerOrdersHistory: async () => ({
        paging: { total: 1 },
        results: [
          {
            status: "paid",
            date_created: new Date().toISOString(),
            order_items: [{ item: { id: "MLA-1" }, quantity: 3 }],
          },
        ],
      }),
      getCategoryName: async () => "Gorras",
    },
  });

  const server = await startServer({ mountPath: "/meli", router });
  t.after(async () => server.close());

  const first = await requestJson(server.baseUrl, "/meli/inventory");
  assert.equal(first.response.status, 200);
  assert.equal(first.data.cached, false);
  assert.equal(first.data.items[0].category_name, "Gorras");
  assert.equal(first.data.items[0].sold_30d, 3);
  assert.equal(first.data.items[0].stock_alert, "bajo");

  const second = await requestJson(server.baseUrl, "/meli/inventory");
  assert.equal(second.response.status, 200);
  assert.equal(second.data.cached, true);
  assert.equal(searchCalls, 1);
});

test("meli routes calculan conversion y cachean el resultado", async (t) => {
  let searchCalls = 0;
  let historyCalls = 0;
  let visitsCalls = 0;

  const router = createMeliRouter({
    mlGet: async (endpoint) => {
      if (endpoint === "/users/me") {
        return { id: 555, nickname: "Sepia" };
      }
      if (endpoint === "/users/555/items/search") {
        searchCalls += 1;
        return {
          paging: { total: 1 },
          results: ["MLA-1"],
        };
      }
      if (endpoint === "/items") {
        return [
          {
            code: 200,
            body: {
              id: "MLA-1",
              title: "Sombrero premium",
              price: 12000,
              currency_id: "COP",
              available_quantity: 8,
              sold_quantity: 10,
              status: "active",
              permalink: "https://meli/item",
              thumbnail: "https://img.test/1.jpg",
              category_id: "C1",
              seller_sku: "SKU-1",
              date_created: "2025-01-01T00:00:00.000Z",
              last_updated: "2025-01-02T00:00:00.000Z",
              listing_type_id: "gold_special",
              condition: "new",
              shipping: { free_shipping: true },
            },
          },
        ];
      }
      if (endpoint === "/items/MLA-1/visits/time_window") {
        visitsCalls += 1;
        return [{ total: 100 }];
      }
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
    meliOrdersService: {
      enrichOrdersWithCategoryNames: async (orders) => orders,
      getSellerOrdersHistory: async () => {
        historyCalls += 1;
        return {
          paging: { total: 1 },
          results: [
            {
              status: "paid",
              date_created: new Date().toISOString(),
              order_items: [{ item: { id: "MLA-1" }, quantity: 3, unit_price: 12000 }],
            },
          ],
        };
      },
      getCategoryName: async () => "Sombreros",
    },
  });

  const server = await startServer({ mountPath: "/meli", router });
  t.after(async () => server.close());

  const first = await requestJson(server.baseUrl, "/meli/conversion");
  assert.equal(first.response.status, 200);
  assert.equal(first.data.cached, false);
  assert.equal(first.data.total, 1);
  assert.equal(first.data.items[0].sold_30d, 3);
  assert.equal(first.data.items[0].revenue_30d, 36000);
  assert.equal(first.data.items[0].conversion_rate, 3);
  assert.equal(first.data.items[0].diagnosis, "estrella");

  const second = await requestJson(server.baseUrl, "/meli/conversion");
  assert.equal(second.response.status, 200);
  assert.equal(second.data.cached, true);
  assert.equal(searchCalls, 1);
  assert.equal(historyCalls, 1);
  assert.equal(visitsCalls, 1);
});

test("meli routes sanitizan errores internos", async (t) => {
  const router = createMeliRouter({
    mlGet: async () => {
      const error = new Error("access token leaked");
      error.response = {
        status: 401,
        data: { error: "invalid_token" },
      };
      throw error;
    },
    meliOrdersService: {
      enrichOrdersWithCategoryNames: async (orders) => orders,
      getSellerOrdersHistory: async () => ({ paging: { total: 0 }, results: [] }),
      getCategoryName: async () => "Categoria",
    },
  });

  const server = await startServer({ mountPath: "/meli", router });
  t.after(async () => server.close());

  const response = await requestJson(server.baseUrl, "/meli/me");
  assert.equal(response.response.status, 500);
  assert.equal(response.data.ok, false);
  assert.equal(response.data.mensaje, "No se pudo consultar /users/me");
  assert.equal("detalle" in response.data, false);
});
