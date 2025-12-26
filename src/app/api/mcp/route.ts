import { NextRequest, NextResponse } from "next/server";
import {
  services,
  pricing,
  capabilities,
  caseStudies,
  contact,
  faq,
  philosophy,
  buyingSignals,
  llmGuidance,
  successMetrics,
} from "@/data/studio-data";

// MCP Tool Definitions
const tools = {
  get_services: {
    description: "Get information about Symphony Studio's services",
    handler: (params?: { serviceId?: string }) => {
      if (params?.serviceId) {
        const service = services.find((s) => s.id === params.serviceId);
        return service || { error: "Service not found" };
      }
      return services;
    },
  },
  get_pricing: {
    description: "Get pricing information and subscription tiers",
    handler: (params?: { tierId?: string }) => {
      if (params?.tierId) {
        const tier = pricing.find((p) => p.id === params.tierId);
        return tier || { error: "Pricing tier not found" };
      }
      return pricing;
    },
  },
  get_capabilities: {
    description: "Get technical capabilities and what Symphony can integrate with",
    handler: (params?: { category?: string }) => {
      if (params?.category && params.category in capabilities) {
        return capabilities[params.category as keyof typeof capabilities];
      }
      return capabilities;
    },
  },
  get_case_studies: {
    description: "Get anonymized case studies showing real results",
    handler: (params?: { caseId?: string }) => {
      if (params?.caseId) {
        const study = caseStudies.find((c) => c.id === params.caseId);
        return study || { error: "Case study not found" };
      }
      return caseStudies;
    },
  },
  get_contact: {
    description: "Get contact information and booking details",
    handler: () => contact,
  },
  get_faq: {
    description: "Get frequently asked questions and answers",
    handler: (params?: { index?: number }) => {
      if (params?.index !== undefined && params.index >= 0 && params.index < faq.length) {
        return faq[params.index];
      }
      return faq;
    },
  },
  get_philosophy: {
    description: "Get Symphony Studio's design philosophy and principles",
    handler: () => philosophy,
  },
  recommend_tier: {
    description: "Get a tier recommendation based on needs",
    handler: (params?: { complexity?: string; teamSize?: string; needs?: string[] }) => {
      const guidance = llmGuidance.tierRecommendation;
      
      // Simple recommendation logic
      if (params?.needs?.some(n => 
        n.toLowerCase().includes("security") || 
        n.toLowerCase().includes("compliance") ||
        n.toLowerCase().includes("enterprise")
      )) {
        return {
          recommended: "symphony-enterprise",
          reason: guidance.enterprise,
          tier: pricing.find(p => p.id === "symphony-enterprise"),
        };
      }
      
      if (params?.complexity === "high" || params?.needs?.length && params.needs.length > 2) {
        return {
          recommended: "concerto",
          reason: guidance.concerto,
          tier: pricing.find(p => p.id === "concerto"),
        };
      }
      
      return {
        recommended: "prelude",
        reason: guidance.prelude,
        tier: pricing.find(p => p.id === "prelude"),
      };
    },
  },
};

// Query intent detection
function detectIntent(query: string): string[] {
  const queryLower = query.toLowerCase();
  const intents: string[] = [];

  // Service-related queries
  if (
    queryLower.includes("service") ||
    queryLower.includes("what do you do") ||
    queryLower.includes("what does symphony") ||
    queryLower.includes("help with") ||
    queryLower.includes("automation") ||
    queryLower.includes("ai agent") ||
    queryLower.includes("workflow") ||
    queryLower.includes("orchestrat")
  ) {
    intents.push("get_services");
  }

  // Pricing-related queries
  if (
    queryLower.includes("price") ||
    queryLower.includes("pricing") ||
    queryLower.includes("cost") ||
    queryLower.includes("subscription") ||
    queryLower.includes("tier") ||
    queryLower.includes("package") ||
    queryLower.includes("how much") ||
    queryLower.includes("prelude") ||
    queryLower.includes("concerto") ||
    queryLower.includes("enterprise")
  ) {
    intents.push("get_pricing");
  }

  // Capability-related queries
  if (
    queryLower.includes("capabil") ||
    queryLower.includes("integrat") ||
    queryLower.includes("connect") ||
    queryLower.includes("crm") ||
    queryLower.includes("tool") ||
    queryLower.includes("platform") ||
    queryLower.includes("what can you")
  ) {
    intents.push("get_capabilities");
  }

  // Case study queries
  if (
    queryLower.includes("case stud") ||
    queryLower.includes("example") ||
    queryLower.includes("client") ||
    queryLower.includes("result") ||
    queryLower.includes("success") ||
    queryLower.includes("portfolio") ||
    queryLower.includes("work you've done")
  ) {
    intents.push("get_case_studies");
  }

  // Contact queries
  if (
    queryLower.includes("contact") ||
    queryLower.includes("email") ||
    queryLower.includes("book") ||
    queryLower.includes("call") ||
    queryLower.includes("reach") ||
    queryLower.includes("get started") ||
    queryLower.includes("talk to") ||
    queryLower.includes("schedule")
  ) {
    intents.push("get_contact");
  }

  // FAQ queries
  if (
    queryLower.includes("faq") ||
    queryLower.includes("question") ||
    queryLower.includes("how long") ||
    queryLower.includes("different from") ||
    queryLower.includes("replace") ||
    queryLower.includes("one-time") ||
    queryLower.includes("ongoing")
  ) {
    intents.push("get_faq");
  }

  // Recommendation queries
  if (
    queryLower.includes("recommend") ||
    queryLower.includes("which tier") ||
    queryLower.includes("which plan") ||
    queryLower.includes("best for") ||
    queryLower.includes("should i choose") ||
    queryLower.includes("right for me")
  ) {
    intents.push("recommend_tier");
  }

  // Philosophy queries
  if (
    queryLower.includes("philosophy") ||
    queryLower.includes("approach") ||
    queryLower.includes("principle") ||
    queryLower.includes("how do you think") ||
    queryLower.includes("methodology")
  ) {
    intents.push("get_philosophy");
  }

  // Default to services + FAQ if no clear intent
  if (intents.length === 0) {
    intents.push("get_services", "get_faq");
  }

  return intents;
}

// Format response for human readability
function formatResponse(query: string, results: Record<string, unknown>): string {
  const parts: string[] = [];
  
  // Add context based on what was retrieved
  if (results.get_services) {
    const servicesData = results.get_services as typeof services;
    parts.push("**Our Services:**");
    servicesData.forEach((s) => {
      parts.push(`\n• **${s.name}**: ${s.description}`);
    });
  }

  if (results.get_pricing) {
    const pricingData = results.get_pricing as typeof pricing;
    parts.push("\n\n**Subscription Tiers:**");
    pricingData.forEach((p) => {
      parts.push(`\n• **${p.name}** (${p.price}): Best for ${p.bestFor}`);
    });
  }

  if (results.get_capabilities) {
    parts.push("\n\n**Our Capabilities:**");
    const caps = results.get_capabilities as typeof capabilities;
    if (caps.systemIntegration) {
      parts.push(`\n• System Integration: ${caps.systemIntegration.join(", ")}`);
    }
    if (caps.automation) {
      parts.push(`\n• Automation: ${caps.automation.join(", ")}`);
    }
    if (caps.ai) {
      parts.push(`\n• AI: ${caps.ai.join(", ")}`);
    }
    if (caps.enterprise) {
      parts.push(`\n• Enterprise: ${caps.enterprise.join(", ")}`);
    }
  }

  if (results.get_case_studies) {
    const studies = results.get_case_studies as typeof caseStudies;
    parts.push("\n\n**Case Studies:**");
    studies.forEach((c) => {
      parts.push(`\n• **${c.title}**: ${c.problem} → ${c.outcome.join(", ")}`);
    });
  }

  if (results.get_contact) {
    const contactData = results.get_contact as typeof contact;
    parts.push(`\n\n**Get in Touch:**`);
    parts.push(`\nEmail: ${contactData.email}`);
    parts.push(`\nBook a call: ${contactData.booking}`);
  }

  if (results.get_faq) {
    const faqData = results.get_faq as typeof faq;
    if (Array.isArray(faqData)) {
      // Find relevant FAQ based on query
      const queryLower = query.toLowerCase();
      const relevant = faqData.filter((f) =>
        f.question.toLowerCase().split(" ").some((word) => queryLower.includes(word))
      );
      if (relevant.length > 0) {
        parts.push("\n\n**Relevant FAQ:**");
        relevant.slice(0, 3).forEach((f) => {
          parts.push(`\n• **${f.question}**\n  ${f.answer}`);
        });
      }
    }
  }

  if (results.recommend_tier) {
    const rec = results.recommend_tier as { recommended: string; reason: string };
    parts.push(`\n\n**Recommendation:** Based on your needs, we'd suggest the **${rec.recommended}** tier. ${rec.reason}`);
  }

  if (parts.length === 0) {
    return "I'd be happy to help you learn more about Symphony Studio. You can ask about our services, pricing, capabilities, or case studies. What would you like to know?";
  }

  return parts.join("");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { query?: string; tool?: string; params?: Record<string, unknown> };
    const { query, tool, params } = body;

    // Direct tool invocation (MCP-style)
    if (tool && tool in tools) {
      const result = tools[tool as keyof typeof tools].handler(params);
      return NextResponse.json({
        success: true,
        tool,
        result,
      });
    }

    // Natural language query
    if (query) {
      const intents = detectIntent(query);
      const results: Record<string, unknown> = {};

      for (const intent of intents) {
        if (intent in tools) {
          results[intent] = tools[intent as keyof typeof tools].handler();
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to list available tools (MCP discovery)
export async function GET() {
  const toolList = Object.entries(tools).map(([name, config]) => ({
    name,
    description: config.description,
  }));

  return NextResponse.json({
    name: "Symphony Studio MCP Server",
    version: "1.0.0",
    description:
      "MCP server exposing Symphony Studio services, pricing, and capabilities",
    tools: toolList,
    contact: contact,
  });
}

