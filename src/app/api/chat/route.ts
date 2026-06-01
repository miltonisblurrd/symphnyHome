import Anthropic from "@anthropic-ai/sdk";
import { executeClaudeToolCall } from "@/mcp/claude-tool-bridge";
import { llmGuidance, philosophy, brand } from "@/data/studio-data";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Anthropic tools (snake_case args) — execution goes through runStudioTool via claude-tool-bridge
const tools: Anthropic.Tool[] = [
  {
    name: "get_services",
    description:
      "Get information about Symphony Studio's orchestration services: workflow coordination, AI performers, and enterprise orchestration layers",
    input_schema: {
      type: "object" as const,
      properties: {
        service_id: {
          type: "string",
          description: "Optional specific service ID (workflow-automation, ai-agents, enterprise-orchestration)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_pricing",
    description: "Get pricing information and subscription tiers (Prelude, Concerto, Symphony Enterprise)",
    input_schema: {
      type: "object" as const,
      properties: {
        tier_id: {
          type: "string",
          description: "Optional specific tier ID (prelude, concerto, symphony-enterprise)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_capabilities",
    description:
      "Get technical capabilities including system integrations, automation features, AI capabilities, and enterprise features",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Optional category (systemIntegration, automation, ai, enterprise)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_case_studies",
    description: "Get anonymized case studies showing real client results",
    input_schema: {
      type: "object" as const,
      properties: {
        case_id: {
          type: "string",
          description: "Optional specific case ID (hvac-service, agency-growth, enterprise-ops)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_contact",
    description: "Get contact information including email, booking link, and location",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_faq",
    description: "Get frequently asked questions and answers about Symphony Studio",
    input_schema: {
      type: "object" as const,
      properties: {
        question_index: {
          type: "number",
          description: "Optional specific FAQ index (0-9)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_philosophy",
    description: "Get Symphony Studio's brand positioning, philosophy, principles, and symphony orchestration model",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "recommend_tier",
    description: "Get a tier recommendation based on the client's needs and complexity",
    input_schema: {
      type: "object" as const,
      properties: {
        needs: {
          type: "array",
          items: { type: "string" },
          description: "List of client needs or requirements",
        },
        complexity: {
          type: "string",
          description: "Complexity level (low, medium, high)",
        },
        team_size: {
          type: "string",
          description: "Optional team size hint",
        },
      },
      required: [],
    },
  },
];

const systemPrompt = `You are the AI assistant for Symphony Studio—the conductor that helps businesses perform at their best through orchestration, not by selling software, AI, or automation.

## Brand (always align with this)
Tagline: ${brand.tagline}
Pillars: ${brand.pillars.join(", ")}

## Your Role
Help visitors understand Symphony Studio by querying tools for accurate information. Symphony solves coordination problems—talented teams and capable tools that still feel chaotic because nothing plays together. Don't make up information—use the tools.

## Response Style
- Professional but warm
- Lead with coordination and clarity, not AI hype
- Concise (2-3 sentence paragraphs max)
- Use bullet points for lists
- Don't repeat questions back
- Get straight to value

## Key Principles
${JSON.stringify(philosophy.coreBeliefs)}

## Response Rules
${JSON.stringify(llmGuidance.responseRules)}

## Boundaries
${JSON.stringify(llmGuidance.boundaries)}

When discussing pricing or services, ALWAYS use the tools to get current information. For getting started, direct people to book a discovery call.`;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { messages?: { role: string; content: string }[] };
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Messages array required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let response = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            system: systemPrompt,
            tools: tools,
            messages: messages.map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          });

          let toolRoundCount = 0;

          while (response.stop_reason === "tool_use") {
            const toolUseBlocks = response.content.filter(
              (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
            );

            const resultsByToolUseId: Record<string, string> = {};

            for (const toolUse of toolUseBlocks) {
              const toolName = toolUse.name.replace(/_/g, " ").replace("get ", "");
              controller.enqueue(encoder.encode(`[TOOL:${toolName}]`));

              const result = executeClaudeToolCall(
                toolUse.name,
                toolUse.input as Record<string, unknown>
              );
              resultsByToolUseId[toolUse.id] = result;
            }

            toolRoundCount += toolUseBlocks.length;

            const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((toolUse) => ({
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: resultsByToolUseId[toolUse.id],
            }));

            response = await client.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1024,
              system: systemPrompt,
              tools: tools,
              messages: [
                ...messages.map((m: { role: string; content: string }) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content,
                })),
                { role: "assistant" as const, content: response.content },
                { role: "user" as const, content: toolResults },
              ],
            });
          }

          if (toolRoundCount > 0) {
            controller.enqueue(encoder.encode("[TOOL:done]"));
          }

          const textBlocks = response.content.filter(
            (block): block is Anthropic.TextBlock => block.type === "text"
          );

          for (const block of textBlocks) {
            controller.enqueue(encoder.encode(block.text));
          }

          controller.close();
        } catch (error) {
          console.error("Chat error:", error);
          controller.enqueue(encoder.encode("I'm having trouble connecting right now. Please try again."));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
