import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  configureSymphonyMcpServer,
  SYMPHONY_MCP_INSTRUCTIONS,
  SYMPHONY_MCP_SERVER_INFO,
} from "@/mcp/symphony-mcp-server";

/**
 * Streamable HTTP MCP (stateless). Same tools/resources as stdio (`npm run mcp:stdio`).
 * Clients must send: `Accept: application/json, text/event-stream` (MCP requirement).
 * Methods: GET, POST, DELETE. CORS enabled for OPTIONS.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, mcp-session-id, MCP-Protocol-Version, Authorization",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = new McpServer(SYMPHONY_MCP_SERVER_INFO, {
    instructions: SYMPHONY_MCP_INSTRUCTIONS,
  });
  configureSymphonyMcpServer(server);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  return withCors(response);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: new Headers(CORS_HEADERS) });
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
