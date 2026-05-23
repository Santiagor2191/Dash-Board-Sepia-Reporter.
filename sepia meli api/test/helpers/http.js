import { once } from "node:events";
import express from "express";

export const startServer = async ({ mountPath = "/", router }) => {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
};

export const requestJson = async (baseUrl, path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body !== undefined && typeof body !== "string") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body,
    redirect: options.redirect || "follow",
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { response, data };
};
