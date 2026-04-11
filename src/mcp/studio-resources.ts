import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult, Resource } from "@modelcontextprotocol/sdk/types.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import {
  services,
  pricing,
  capabilities,
  caseStudies,
  contact,
  faq,
  philosophy,
  llmGuidance,
  buyingSignals,
  successMetrics,
} from "@/data/studio-data";

export const STUDIO_JSON_MIME = "application/json";

export function readJsonResource(uriHref: string, data: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri: uriHref,
        mimeType: STUDIO_JSON_MIME,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function firstVariable(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

const STATIC_DEFS = [
  {
    name: "symphony-services",
    uri: "symphony://studio/services",
    description: "Full Symphony Studio service catalog (JSON)",
    getData: () => services,
  },
  {
    name: "symphony-pricing",
    uri: "symphony://studio/pricing",
    description: "All subscription tiers and pricing (JSON)",
    getData: () => pricing,
  },
  {
    name: "symphony-capabilities",
    uri: "symphony://studio/capabilities",
    description: "Technical capabilities by category (JSON)",
    getData: () => capabilities,
  },
  {
    name: "symphony-case-studies",
    uri: "symphony://studio/case-studies",
    description: "Anonymized case studies (JSON)",
    getData: () => caseStudies,
  },
  {
    name: "symphony-contact",
    uri: "symphony://studio/contact",
    description: "Contact, booking link, and CTA (JSON)",
    getData: () => contact,
  },
  {
    name: "symphony-faq",
    uri: "symphony://studio/faq",
    description: "Frequently asked questions (JSON)",
    getData: () => faq,
  },
  {
    name: "symphony-philosophy",
    uri: "symphony://studio/philosophy",
    description: "Design philosophy and principles (JSON)",
    getData: () => philosophy,
  },
  {
    name: "symphony-llm-guidance",
    uri: "symphony://studio/llm-guidance",
    description: "LLM response rules, boundaries, and tier guidance copy (JSON)",
    getData: () => llmGuidance,
  },
  {
    name: "symphony-buying-signals",
    uri: "symphony://studio/buying-signals",
    description: "Strong vs weak fit signals for qualification (JSON)",
    getData: () => buyingSignals,
  },
  {
    name: "symphony-success-metrics",
    uri: "symphony://studio/success-metrics",
    description: "How Symphony defines client success (JSON)",
    getData: () => successMetrics,
  },
] as const;

/** HTTP GET /api/mcp — fixed URIs */
export const httpStaticResourceDiscovery = STATIC_DEFS.map((d) => ({
  uri: d.uri,
  name: d.name,
  description: d.description,
}));

export const httpResourceTemplateDiscovery = [
  {
    name: "symphony-service-by-id",
    uriTemplate: "symphony://studio/service/{serviceId}",
    description: "Single service by id (e.g. workflow-automation, ai-agents, enterprise-orchestration)",
  },
  {
    name: "symphony-pricing-tier-by-id",
    uriTemplate: "symphony://studio/pricing-tier/{tierId}",
    description: "Single pricing tier by id (e.g. prelude, concerto, symphony-enterprise)",
  },
  {
    name: "symphony-case-study-by-id",
    uriTemplate: "symphony://studio/case-study/{caseId}",
    description: "Single case study by id (e.g. hvac-service, agency-growth, enterprise-ops)",
  },
] as const;

export function registerStudioResources(server: McpServer) {
  const meta = {
    mimeType: STUDIO_JSON_MIME,
  };

  for (const def of STATIC_DEFS) {
    server.registerResource(
      def.name,
      def.uri,
      { description: def.description, ...meta },
      async (uri) => readJsonResource(uri.href, def.getData())
    );
  }

  const serviceTemplate = new ResourceTemplate("symphony://studio/service/{serviceId}", {
    list: async (): Promise<{ resources: Resource[] }> => ({
      resources: services.map((s) => ({
        uri: `symphony://studio/service/${encodeURIComponent(s.id)}`,
        name: s.name,
        description: `Symphony service: ${s.name}`,
        mimeType: STUDIO_JSON_MIME,
      })),
    }),
  });

  server.registerResource(
    "symphony-service-by-id",
    serviceTemplate,
    {
      title: "Service by ID",
      description: httpResourceTemplateDiscovery[0].description,
      ...meta,
    },
    async (uri, variables: Variables) => {
      const serviceId = firstVariable(variables.serviceId);
      if (!serviceId) {
        return readJsonResource(uri.href, { error: "Missing serviceId" });
      }
      const service = services.find((s) => s.id === serviceId);
      if (!service) {
        return readJsonResource(uri.href, { error: "Service not found", serviceId });
      }
      return readJsonResource(uri.href, service);
    }
  );

  const pricingTemplate = new ResourceTemplate("symphony://studio/pricing-tier/{tierId}", {
    list: async (): Promise<{ resources: Resource[] }> => ({
      resources: pricing.map((p) => ({
        uri: `symphony://studio/pricing-tier/${encodeURIComponent(p.id)}`,
        name: p.name,
        description: `Pricing tier: ${p.name}`,
        mimeType: STUDIO_JSON_MIME,
      })),
    }),
  });

  server.registerResource(
    "symphony-pricing-tier-by-id",
    pricingTemplate,
    {
      title: "Pricing tier by ID",
      description: httpResourceTemplateDiscovery[1].description,
      ...meta,
    },
    async (uri, variables: Variables) => {
      const tierId = firstVariable(variables.tierId);
      if (!tierId) {
        return readJsonResource(uri.href, { error: "Missing tierId" });
      }
      const tier = pricing.find((p) => p.id === tierId);
      if (!tier) {
        return readJsonResource(uri.href, { error: "Pricing tier not found", tierId });
      }
      return readJsonResource(uri.href, tier);
    }
  );

  const caseTemplate = new ResourceTemplate("symphony://studio/case-study/{caseId}", {
    list: async (): Promise<{ resources: Resource[] }> => ({
      resources: caseStudies.map((c) => ({
        uri: `symphony://studio/case-study/${encodeURIComponent(c.id)}`,
        name: c.title,
        description: `Case study: ${c.title}`,
        mimeType: STUDIO_JSON_MIME,
      })),
    }),
  });

  server.registerResource(
    "symphony-case-study-by-id",
    caseTemplate,
    {
      title: "Case study by ID",
      description: httpResourceTemplateDiscovery[2].description,
      ...meta,
    },
    async (uri, variables: Variables) => {
      const caseId = firstVariable(variables.caseId);
      if (!caseId) {
        return readJsonResource(uri.href, { error: "Missing caseId" });
      }
      const study = caseStudies.find((c) => c.id === caseId);
      if (!study) {
        return readJsonResource(uri.href, { error: "Case study not found", caseId });
      }
      return readJsonResource(uri.href, study);
    }
  );
}
