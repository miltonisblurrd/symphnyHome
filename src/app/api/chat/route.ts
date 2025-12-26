import Anthropic from "@anthropic-ai/sdk";
import { 
  services, 
  pricing, 
  capabilities, 
  caseStudies, 
  contact, 
  faq,
  philosophy,
  llmGuidance,
} from "@/data/studio-data";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Define tools for Claude to call
const tools: Anthropic.Tool[] = [
  {
    name: "get_services",
    description: "Get information about Symphony Studio's services including workflow automation, AI agents, and enterprise orchestration",
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
    description: "Get technical capabilities including system integrations, automation features, AI capabilities, and enterprise features",
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
      },
      required: [],
    },
  },
];

// Execute tool calls
function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "get_services":
      if (input.service_id) {
        const service = services.find((s) => s.id === input.service_id);
        return JSON.stringify(service || { error: "Service not found" });
      }
      return JSON.stringify(services);

    case "get_pricing":
      if (input.tier_id) {
        const tier = pricing.find((p) => p.id === input.tier_id);
        return JSON.stringify(tier || { error: "Tier not found" });
      }
      return JSON.stringify(pricing);

    case "get_capabilities":
      const category = input.category as string | undefined;
      if (category && category in capabilities) {
        return JSON.stringify(capabilities[category as keyof typeof capabilities]);
      }
      return JSON.stringify(capabilities);

    case "get_case_studies":
      if (input.case_id) {
        const study = caseStudies.find((c) => c.id === input.case_id);
        return JSON.stringify(study || { error: "Case study not found" });
      }
      return JSON.stringify(caseStudies);

    case "get_contact":
      return JSON.stringify(contact);

    case "get_faq":
      if (typeof input.question_index === "number") {
        return JSON.stringify(faq[input.question_index] || { error: "FAQ not found" });
      }
      return JSON.stringify(faq);

    case "recommend_tier":
      const needs = (input.needs as string[]) || [];
      const complexity = input.complexity as string;
      
      // Simple recommendation logic
      if (needs.some(n => 
        n.toLowerCase().includes("security") || 
        n.toLowerCase().includes("compliance") ||
        n.toLowerCase().includes("enterprise")
      ) || complexity === "high") {
        return JSON.stringify({
          recommended: "symphony-enterprise",
          reason: "Enterprise environments with security/compliance needs require custom discovery",
          tier: pricing.find(p => p.id === "symphony-enterprise"),
        });
      }
      
      if (complexity === "medium" || needs.length > 2) {
        return JSON.stringify({
          recommended: "concerto",
          reason: "Multiple workflows and growing complexity fits Concerto",
          tier: pricing.find(p => p.id === "concerto"),
        });
      }
      
      return JSON.stringify({
        recommended: "prelude",
        reason: "Simple workflows and small teams fit Prelude",
        tier: pricing.find(p => p.id === "prelude"),
      });

    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

// Compact system prompt (tools provide the data now)
const systemPrompt = `You are the AI assistant for Symphony Studio, an automation and AI orchestration studio.

## Your Role
Help visitors understand Symphony Studio by querying the available tools for accurate information. Don't make up information - use the tools to get real data.

## Response Style
- Professional but warm
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
    const { messages } = await request.json();

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
          // Initial request to Claude with tools
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

          // Collect tool calls and results
          const toolCalls: { name: string; result: string }[] = [];

          // Handle tool use loop
          while (response.stop_reason === "tool_use") {
            const toolUseBlocks = response.content.filter(
              (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
            );

            // Send tool call indicators
            for (const toolUse of toolUseBlocks) {
              const toolName = toolUse.name.replace(/_/g, " ").replace("get ", "");
              controller.enqueue(encoder.encode(`[TOOL:${toolName}]`));
              
              const result = executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
              toolCalls.push({ name: toolUse.name, result });
            }

            // Build tool results
            const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((toolUse) => ({
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: executeTool(toolUse.name, toolUse.input as Record<string, unknown>),
            }));

            // Continue conversation with tool results
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

          // Send end of tool calls marker
          if (toolCalls.length > 0) {
            controller.enqueue(encoder.encode("[TOOL:done]"));
          }

          // Extract and send the final text response
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
