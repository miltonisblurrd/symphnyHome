import {
  services,
  pricing,
  capabilities,
  caseStudies,
  contact,
  faq,
  philosophy,
  brand,
  symphonyModel,
  llmGuidance,
} from "@/data/studio-data";

type StudioToolEntry = {
  description: string;
  handler: (params?: Record<string, unknown>) => unknown;
};

export type StudioToolName =
  | "get_services"
  | "get_pricing"
  | "get_capabilities"
  | "get_case_studies"
  | "get_contact"
  | "get_faq"
  | "get_philosophy"
  | "recommend_tier";

/**
 * Single source of truth for Symphony Studio tool handlers.
 * Used by the HTTP compatibility API (`/api/mcp`) and the stdio MCP server.
 */
export const studioTools: Record<StudioToolName, StudioToolEntry> = {
  get_services: {
    description: "Get information about Symphony Studio's services",
    handler: (params?: Record<string, unknown>) => {
      const serviceId = params?.serviceId as string | undefined;
      if (serviceId) {
        const service = services.find((s) => s.id === serviceId);
        return service || { error: "Service not found" };
      }
      return services;
    },
  },
  get_pricing: {
    description: "Get pricing information and subscription tiers",
    handler: (params?: Record<string, unknown>) => {
      const tierId = params?.tierId as string | undefined;
      if (tierId) {
        const tier = pricing.find((p) => p.id === tierId);
        return tier || { error: "Pricing tier not found" };
      }
      return pricing;
    },
  },
  get_capabilities: {
    description: "Get technical capabilities and what Symphony can integrate with",
    handler: (params?: Record<string, unknown>) => {
      const category = params?.category as string | undefined;
      if (category && category in capabilities) {
        return capabilities[category as keyof typeof capabilities];
      }
      return capabilities;
    },
  },
  get_case_studies: {
    description: "Get anonymized case studies showing real results",
    handler: (params?: Record<string, unknown>) => {
      const caseId = params?.caseId as string | undefined;
      if (caseId) {
        const study = caseStudies.find((c) => c.id === caseId);
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
    handler: (params?: Record<string, unknown>) => {
      const index = params?.index;
      if (typeof index === "number" && index >= 0 && index < faq.length) {
        return faq[index];
      }
      return faq;
    },
  },
  get_philosophy: {
    description: "Get Symphony Studio's brand positioning, design philosophy, principles, and symphony model",
    handler: () => ({ brand, philosophy, symphonyModel }),
  },
  recommend_tier: {
    description: "Get a tier recommendation based on needs",
    handler: (params?: Record<string, unknown>) => {
      const guidance = llmGuidance.tierRecommendation;
      const complexity = params?.complexity as string | undefined;
      const needs = params?.needs as string[] | undefined;

      if (
        needs?.some(
          (n) =>
            n.toLowerCase().includes("security") ||
            n.toLowerCase().includes("compliance") ||
            n.toLowerCase().includes("enterprise")
        )
      ) {
        return {
          recommended: "symphony-enterprise",
          reason: guidance.enterprise,
          tier: pricing.find((p) => p.id === "symphony-enterprise"),
        };
      }

      if (complexity === "high" || (needs?.length && needs.length > 2)) {
        return {
          recommended: "concerto",
          reason: guidance.concerto,
          tier: pricing.find((p) => p.id === "concerto"),
        };
      }

      return {
        recommended: "prelude",
        reason: guidance.prelude,
        tier: pricing.find((p) => p.id === "prelude"),
      };
    },
  },
};

export function isStudioToolName(name: string): name is StudioToolName {
  return name in studioTools;
}

export function runStudioTool(
  name: StudioToolName,
  params?: Record<string, unknown>
): unknown {
  return studioTools[name].handler(params);
}

export function detectIntent(query: string): string[] {
  const queryLower = query.toLowerCase();
  const intents: string[] = [];

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

  if (
    queryLower.includes("philosophy") ||
    queryLower.includes("approach") ||
    queryLower.includes("principle") ||
    queryLower.includes("how do you think") ||
    queryLower.includes("methodology")
  ) {
    intents.push("get_philosophy");
  }

  if (intents.length === 0) {
    intents.push("get_services", "get_faq");
  }

  return intents;
}

export function formatResponse(query: string, results: Record<string, unknown>): string {
  const parts: string[] = [];

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
    parts.push(
      `\n\n**Recommendation:** Based on your needs, we'd suggest the **${rec.recommended}** tier. ${rec.reason}`
    );
  }

  if (parts.length === 0) {
    return "I'd be happy to help you learn more about Symphony Studio. You can ask about our services, pricing, capabilities, or case studies. What would you like to know?";
  }

  return parts.join("");
}
