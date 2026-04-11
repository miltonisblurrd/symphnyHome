import { NextRequest, NextResponse } from "next/server";
import { contact } from "@/data/studio-data";
import {
  httpResourceTemplateDiscovery,
  httpStaticResourceDiscovery,
} from "@/mcp/studio-resources";
import {
  studioTools,
  detectIntent,
  formatResponse,
  isStudioToolName,
  runStudioTool,
} from "@/mcp/studio-tools";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      query?: string;
      tool?: string;
      params?: Record<string, unknown>;
    };
    const { query, tool, params } = body;

    if (tool && isStudioToolName(tool)) {
      const result = runStudioTool(tool, params);
      return NextResponse.json({
        success: true,
        tool,
        result,
      });
    }

    if (query) {
      const intents = detectIntent(query);
      const results: Record<string, unknown> = {};

      for (const intent of intents) {
        if (isStudioToolName(intent)) {
          results[intent] = runStudioTool(intent);
        }
      }

      const formattedResponse = formatResponse(query, results);

      return NextResponse.json({
        success: true,
        query,
        intents,
        response: formattedResponse,
        raw: results,
      });
    }

    return NextResponse.json(
      { error: "Please provide a 'query' or 'tool' parameter" },
      { status: 400 }
    );
  } catch (error) {
    console.error("MCP API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** HTTP discovery mirror of tool list; for protocol-native MCP use `npm run mcp:stdio`. */
export async function GET() {
  const toolList = (Object.keys(studioTools) as (keyof typeof studioTools)[]).map(
    (name) => ({
      name,
      description: studioTools[name].description,
    })
  );

  return NextResponse.json({
    name: "Symphony Studio MCP Server",
    version: "1.0.0",
    description:
      "stdio: `npm run mcp:stdio`. Streamable HTTP MCP: `GET|POST|DELETE /api/mcp/http`. This JSON is discovery + legacy query/tool calls.",
    tools: toolList,
    resources: httpStaticResourceDiscovery,
    resourceTemplates: [...httpResourceTemplateDiscovery],
    contact,
  });
}
