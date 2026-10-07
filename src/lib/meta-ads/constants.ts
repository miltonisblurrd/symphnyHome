/**
 * Meta Ads copilot — product boundary.
 *
 * This module analyzes an ad account. It never creates, pauses, budgets,
 * targets, or deletes anything in Meta. Humans make those changes in Ads Manager.
 */

export const META_ADS_ACCESS = "read-only" as const;

export const META_ADS_ROUTE = "/ops/ads";

/**
 * Current cheap OpenAI model for this analyst (checked Sep 29, 2026).
 * GPT-6 Astra is the flagship and is intentionally not used.
 * Luna's default reasoning stays on so it can explain the evidence.
 */
export const META_ADS_OPENAI_MODEL = "gpt-5.6-luna";

/** Writes the analyst is not allowed to perform against Meta. */
export const META_ADS_FORBIDDEN_ACTIONS = [
  "purchase_ads",
  "create_campaign",
  "create_ad_set",
  "create_ad",
  "pause_campaign",
  "pause_ad_set",
  "pause_ad",
  "modify_budget",
  "modify_targeting",
  "delete_entity",
] as const;
