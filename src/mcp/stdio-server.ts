/**
 * Symphony Studio — stdio MCP server (Model Context Protocol).
 *
 * Run: `npm run mcp:stdio`
 *
 * Cursor: add to MCP config (e.g. ~/.cursor/mcp.json) or project `.cursor/mcp.json`:
 *   "symphony-studio": {
 *     "command": "npx",
 *     "args": ["tsx", "src/mcp/stdio-server.ts"],
 *     "cwd": "/absolute/path/to/symphny"
 *   }
 *
 * Per MCP guidance: never write logs to stdout (only JSON-RPC on stdout). Use stderr.
 *
 * Same tool/resource registration as HTTP MCP: `src/app/api/mcp/http` (Streamable HTTP).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  configureSymphonyMcpServer,
  SYMPHONY_MCP_INSTRUCTIONS,
  SYMPHONY_MCP_SERVER_INFO,
} from "@/mcp/symphony-mcp-server";

async function main() {
  const server = new McpServer(SYMPHONY_MCP_SERVER_INFO, {
    instructions: SYMPHONY_MCP_INSTRUCTIONS,
  });

  configureSymphonyMcpServer(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[symphony-studio-mcp] Fatal error:", err);
  process.exit(1);
});
