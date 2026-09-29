/** Internal types for the copilot. Meta response shapes stay in lib/meta later. */

export const META_ENTITY_TYPES = ["ACCOUNT", "CAMPAIGN", "AD_SET", "AD"] as const;
export type MetaEntityType = (typeof META_ENTITY_TYPES)[number];

export const PRIMARY_OBJECTIVES = [
  "LEADS",
  "PURCHASES",
  "REVENUE",
  "APP_INSTALLS",
  "AWARENESS",
  "OTHER",
] as const;
export type PrimaryObjective = (typeof PRIMARY_OBJECTIVES)[number];

export const ANALYSIS_STYLES = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as const;
export type AnalysisStyle = (typeof ANALYSIS_STYLES)[number];

export const SIGNAL_CODES = [
  "CPL_BELOW_TARGET",
  "CPL_ABOVE_TARGET",
  "CPA_BELOW_TARGET",
  "CPA_ABOVE_TARGET",
  "ROAS_ABOVE_TARGET",
  "ROAS_BELOW_TARGET",
  "CTR_IMPROVING",
  "CTR_DECLINING",
  "CPC_INCREASING",
  "CPM_INCREASING",
  "FREQUENCY_INCREASING",
  "POSSIBLE_CREATIVE_FATIGUE",
  "POTENTIAL_SCALE_OPPORTUNITY",
  "UNDERPERFORMING",
  "SPEND_ANOMALY",
  "CONVERSION_DROP",
  "ZERO_CONVERSION_SPEND",
  "CAMPAIGN_NOT_SPENDING",
  "POSSIBLE_TRACKING_ISSUE",
  "INSUFFICIENT_DATA",
  "NO_ACTION_NEEDED",
] as const;
export type SignalCode = (typeof SIGNAL_CODES)[number];

export const RECOMMENDATION_SEVERITIES = ["INFO", "OPPORTUNITY", "WARNING", "CRITICAL"] as const;
export type RecommendationSeverity = (typeof RECOMMENDATION_SEVERITIES)[number];

export const RECOMMENDATION_STATUSES = [
  "ACTIVE",
  "ACCEPTED",
  "REJECTED",
  "IGNORED",
  "EXPIRED",
  "RESOLVED",
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Null means the metric was not available. Zero means the metric was measured as zero. */
export type MetricValue = number | null;
