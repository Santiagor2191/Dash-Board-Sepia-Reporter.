#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ordersToolDefinitions } from "./tools/ordenes.js";
import { inventoryToolDefinitions } from "./tools/inventario.js";
import { historicoToolDefinitions } from "./tools/historico.js";
import { conversionToolDefinitions } from "./tools/conversion.js";

const ALL_TOOLS = [
  ...ordersToolDefinitions,
  ...inventoryToolDefinitions,
  ...historicoToolDefinitions,
  ...conversionToolDefinitions,
];

const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.name, t]));

const server = new Server(
  {
    name: "sepia-meli-mcp",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = TOOL_MAP.get(name);
  if (!tool) {
    throw new Error(`Tool desconocida: ${name}`);
  }

  try {
    const result = await tool.handler(args || {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const status = error?.response?.status;
    const body = error?.response?.data;
    const detail = body ? `\nMeLi response: ${JSON.stringify(body)}` : "";
    return {
      content: [
        {
          type: "text",
          text: `Error en tool ${name}: ${error.message}${status ? ` (HTTP ${status})` : ""}${detail}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
