/**
 * seedgen MCP server. Tools: generate_seed_data.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * Generation is pure local computation: no upstream API, no
 * authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { formatPayload, generateSeedData, VERSION } from "./seedgen.js";

const TOOLS = [
  {
    name: "generate_seed_data",
    description:
      "Generate deterministic seed records from field specs and a numeric seed: the same seed and specs always produce the same records.",
    inputSchema: {
      type: "object" as const,
      properties: {
        seed: {
          type: "integer",
          description: "Seed for the pinned PRNG (unsigned 32-bit integer)",
        },
        count: {
          type: "integer",
          description: "Number of records to generate (1..1000)",
        },
        fields: {
          type: "array",
          description: "Field specs, in output order (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Field name (unique across the field specs)",
              },
              type: { type: "string", description: "Field type" },
              min: {
                type: "number",
                description:
                  "Lower bound for integer/number fields (optional; integer default 0, number default 0)",
              },
              max: {
                type: "number",
                description:
                  "Upper bound for integer/number fields (optional; integer default 100, number default 1)",
              },
              length: {
                type: "integer",
                description: "Length for string fields (optional, default 8, 1..64)",
              },
              values: {
                type: "array",
                description:
                  "Choices for enum fields (required for enum, at least one non-empty string)",
                items: { type: "string" },
              },
              from: {
                type: "string",
                description:
                  'Earliest date for date fields, YYYY-MM-DD (optional, default "2020-01-01")',
              },
              to: {
                type: "string",
                description:
                  'Latest date for date fields, YYYY-MM-DD (optional, default "2020-12-31")',
              },
            },
            required: ["name", "type"],
          },
        },
      },
      required: ["seed", "count", "fields"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "seedgen", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "generate_seed_data") {
      out = generateSeedData(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
