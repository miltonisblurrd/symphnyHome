import { isStudioToolName, runStudioTool, type StudioToolName } from "@/mcp/studio-tools";

/** Map Anthropic tool args (snake_case) to studio-tools params (camelCase). */
export function claudeToolInputToStudioParams(
  name: StudioToolName,
  input: Record<string, unknown>
): Record<string, unknown> {
  switch (name) {
    case "get_services":
      return typeof input.service_id === "string" ? { serviceId: input.service_id } : {};
    case "get_pricing":
      return typeof input.tier_id === "string" ? { tierId: input.tier_id } : {};
    case "get_capabilities":
      return typeof input.category === "string" ? { category: input.category } : {};
    case "get_case_studies":
      return typeof input.case_id === "string" ? { caseId: input.case_id } : {};
    case "get_contact":
      return {};
    case "get_faq":
      return typeof input.question_index === "number"
        ? { index: input.question_index }
        : {};
    case "get_philosophy":
      return {};
    case "recommend_tier": {
      const out: Record<string, unknown> = {};
      if (Array.isArray(input.needs)) {
        out.needs = input.needs as string[];
      }
      if (typeof input.complexity === "string") {
        out.complexity = input.complexity;
      }
      if (typeof input.team_size === "string") {
        out.teamSize = input.team_size;
      }
      return out;
    }
    default:
      return {};
  }
}

/** Single path for Claude tool_use → same implementation as MCP tools. */
export function executeClaudeToolCall(name: string, input: Record<string, unknown>): string {
  if (!isStudioToolName(name)) {
    return JSON.stringify({ error: "Unknown tool" });
  }
  const params = claudeToolInputToStudioParams(name, input);
  const result = runStudioTool(name, params);
  return JSON.stringify(result);
}
