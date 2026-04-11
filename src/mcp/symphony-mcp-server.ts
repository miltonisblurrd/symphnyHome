import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerStudioResources } from "@/mcp/studio-resources";
import { runStudioTool, type StudioToolName, studioTools } from "@/mcp/studio-tools";

export const SYMPHONY_MCP_SERVER_INFO = {
  name: "symphony-studio",
  version: "1.0.0",
} as const;

export const SYMPHONY_MCP_INSTRUCTIONS =
  "Provides authoritative, read-only Symphony Studio data via tools and resources (symphony://studio/...). " +
  "Use tools for parameterized calls (e.g. recommend_tier); use resources for full JSON snapshots or per-id URIs from templates. " +
  "Never invent prices, tiers, or service names.";

function jsonTextResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Registers MCP tools backed by runStudioTool (same logic as /api/chat). */
export function registerSymphonyToolsOnServer(server: McpServer) {
  const t = <K extends StudioToolName>(name: K) => studioTools[name].description;

  server.registerTool(
    "get_services",
    {
      description: t("get_services"),
      inputSchema: {
        serviceId: z
          .string()
          .optional()
          .describe("When set, return only the service with this id"),
      },
    },
    async (args) => jsonTextResult(runStudioTool("get_services", args))
  );

  server.registerTool(
    "get_pricing",
    {
      description: t("get_pricing"),
      inputSchema: {
        tierId: z
          .string()
          .optional()
          .describe("When set, return only the pricing tier with this id"),
      },
    },
    async (args) => jsonTextResult(runStudioTool("get_pricing", args))
  );

  server.registerTool(
    "get_capabilities",
    {
      description: t("get_capabilities"),
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe(
            "Optional category key: systemIntegration | automation | ai | enterprise"
          ),
      },
    },
    async (args) => jsonTextResult(runStudioTool("get_capabilities", args))
  );

  server.registerTool(
    "get_case_studies",
    {
      description: t("get_case_studies"),
      inputSchema: {
        caseId: z.string().optional().describe("When set, return only this case study id"),
      },
    },
    async (args) => jsonTextResult(runStudioTool("get_case_studies", args))
  );

  server.registerTool(
    "get_contact",
    { description: t("get_contact") },
    async () => jsonTextResult(runStudioTool("get_contact"))
  );

  server.registerTool(
    "get_faq",
    {
      description: t("get_faq"),
      inputSchema: {
        index: z
          .number()
          .int()
          .optional()
          .describe("When set, return only the FAQ entry at this zero-based index"),
      },
    },
    async (args) => jsonTextResult(runStudioTool("get_faq", args))
  );

  server.registerTool(
    "get_philosophy",
    { description: t("get_philosophy") },
    async () => jsonTextResult(runStudioTool("get_philosophy"))
  );

  server.registerTool(
    "recommend_tier",
    {
      description: t("recommend_tier"),
      inputSchema: {
        complexity: z
          .string()
          .optional()
          .describe('e.g. "high" suggests a higher tier when combined with other signals'),
        teamSize: z.string().optional().describe("Optional team size hint"),
        needs: z
          .array(z.string())
          .optional()
          .describe("List of needs; keywords like security/compliance/enterprise affect the recommendation"),
      },
    },
    async (args) => jsonTextResult(runStudioTool("recommend_tier", args))
  );
}

/** Tools + resources; reuse for stdio and Streamable HTTP MCP. */
export function configureSymphonyMcpServer(server: McpServer) {
  registerSymphonyToolsOnServer(server);
  registerStudioResources(server);
}
