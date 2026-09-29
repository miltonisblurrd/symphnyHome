/**
 * Inspired Closets OS — Meta Ads copilot.
 *
 * Read-only from Meta's side. Tokens stay in access_token_ciphertext and
 * must never be selected into a client response.
 *
 * Metric columns are nullable on purpose: null is missing, 0 is a real zero.
 * Money and rates use numeric so we do not inherit binary float error.
 * Apply drizzle/0032_ic_meta_ads.sql in Supabase. Runtime queries use the
 * Supabase client, matching the rest of the OS.
 */
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { icStaff } from "@/db/ops-schema";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const icMetaWorkspaces = pgTable("ic_meta_workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Staff who can open a workspace. V1 does not add a second permission system. */
export const icMetaWorkspaceMembers = pgTable("ic_meta_workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => icStaff.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icMetaConnections = pgTable("ic_meta_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  metaUserId: text("meta_user_id"),
  status: text("status").notNull().default("disconnected"),
  scopes: text("scopes"),
  /** Server-only. Encrypt before write once META_TOKEN_ENCRYPTION_KEY is set. */
  accessTokenCiphertext: text("access_token_ciphertext"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...timestamps,
});

export const icMetaAdAccounts = pgTable("ic_meta_ad_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => icMetaConnections.id, {
    onDelete: "set null",
  }),
  metaAccountId: text("meta_account_id").notNull(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone"),
  status: text("status"),
  isDemo: boolean("is_demo").notNull().default(false),
  selected: boolean("selected").notNull().default(false),
  ...timestamps,
});

export const icMetaCampaigns = pgTable("ic_meta_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  metaId: text("meta_id").notNull(),
  name: text("name").notNull(),
  objective: text("objective"),
  status: text("status"),
  effectiveStatus: text("effective_status"),
  dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }),
  lifetimeBudget: numeric("lifetime_budget", { precision: 14, scale: 2 }),
  ...timestamps,
});

export const icMetaAdSets = pgTable("ic_meta_ad_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => icMetaCampaigns.id, { onDelete: "cascade" }),
  metaId: text("meta_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  effectiveStatus: text("effective_status"),
  dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }),
  lifetimeBudget: numeric("lifetime_budget", { precision: 14, scale: 2 }),
  ...timestamps,
});

export const icMetaAds = pgTable("ic_meta_ads", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => icMetaCampaigns.id, { onDelete: "cascade" }),
  adSetId: uuid("ad_set_id")
    .notNull()
    .references(() => icMetaAdSets.id, { onDelete: "cascade" }),
  metaId: text("meta_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  effectiveStatus: text("effective_status"),
  ...timestamps,
});

export const icMetaPerformanceSnapshots = pgTable("ic_meta_performance_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  /** Meta id string for the account, campaign, ad set, or ad. */
  entityId: text("entity_id").notNull(),
  date: date("date").notNull(),
  spend: numeric("spend", { precision: 14, scale: 2 }),
  impressions: integer("impressions"),
  reach: integer("reach"),
  frequency: numeric("frequency", { precision: 10, scale: 4 }),
  clicks: integer("clicks"),
  linkClicks: integer("link_clicks"),
  ctr: numeric("ctr", { precision: 12, scale: 6 }),
  cpc: numeric("cpc", { precision: 14, scale: 4 }),
  cpm: numeric("cpm", { precision: 14, scale: 4 }),
  conversions: numeric("conversions", { precision: 14, scale: 4 }),
  conversionValue: numeric("conversion_value", { precision: 14, scale: 2 }),
  cpl: numeric("cpl", { precision: 14, scale: 4 }),
  cpa: numeric("cpa", { precision: 14, scale: 4 }),
  roas: numeric("roas", { precision: 14, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icMetaClientGoals = pgTable("ic_meta_client_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  primaryObjective: text("primary_objective").notNull(),
  targetCpl: numeric("target_cpl", { precision: 14, scale: 2 }),
  targetCpa: numeric("target_cpa", { precision: 14, scale: 2 }),
  targetRoas: numeric("target_roas", { precision: 14, scale: 4 }),
  idealCpl: numeric("ideal_cpl", { precision: 14, scale: 2 }),
  idealCpa: numeric("ideal_cpa", { precision: 14, scale: 2 }),
  idealRoas: numeric("ideal_roas", { precision: 14, scale: 4 }),
  monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 2 }),
  primaryConversionEvent: text("primary_conversion_event"),
  minimumAnalysisDays: integer("minimum_analysis_days").notNull().default(7),
  minimumConversionCount: integer("minimum_conversion_count").notNull().default(5),
  notes: text("notes"),
  ...timestamps,
});

export const icMetaOptimizationSettings = pgTable("ic_meta_optimization_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  /** CONSERVATIVE | BALANCED | AGGRESSIVE. Changes thresholds, not risk appetite copy. */
  analysisAggressiveness: text("analysis_aggressiveness").notNull().default("BALANCED"),
  minimumSpendThreshold: numeric("minimum_spend_threshold", { precision: 14, scale: 2 })
    .notNull()
    .default("100"),
  minimumConversionThreshold: integer("minimum_conversion_threshold").notNull().default(5),
  minimumAnalysisPeriodDays: integer("minimum_analysis_period_days").notNull().default(7),
  scalingIncrementMin: numeric("scaling_increment_min", { precision: 6, scale: 2 })
    .notNull()
    .default("10"),
  scalingIncrementMax: numeric("scaling_increment_max", { precision: 6, scale: 2 })
    .notNull()
    .default("20"),
  /** Null means frequency alone never fires a warning. */
  frequencyWarningThreshold: numeric("frequency_warning_threshold", { precision: 8, scale: 2 }),
  ctrDeclineThreshold: numeric("ctr_decline_threshold", { precision: 8, scale: 4 }),
  cplWarningThreshold: numeric("cpl_warning_threshold", { precision: 8, scale: 4 }),
  cpaWarningThreshold: numeric("cpa_warning_threshold", { precision: 8, scale: 4 }),
  roasWarningThreshold: numeric("roas_warning_threshold", { precision: 8, scale: 4 }),
  anomalySensitivity: text("anomaly_sensitivity").notNull().default("BALANCED"),
  ...timestamps,
});

export const icMetaRecommendations = pgTable("ic_meta_recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  observation: text("observation").notNull(),
  recommendation: text("recommendation").notNull(),
  reasoning: text("reasoning").notNull(),
  confidence: text("confidence").notNull(),
  suggestedBudgetChangePercent: numeric("suggested_budget_change_percent", {
    precision: 6,
    scale: 2,
  }),
  metricsSupporting: jsonb("metrics_supporting").notNull().default([]),
  detectedSignals: jsonb("detected_signals").notNull().default([]),
  analysisPeriod: jsonb("analysis_period").notNull(),
  comparisonPeriod: jsonb("comparison_period"),
  clientGoalsSnapshot: jsonb("client_goals_snapshot"),
  ruleId: text("rule_id"),
  aiOutput: jsonb("ai_output"),
  aiModel: text("ai_model"),
  /** Same entity + signal + period updates the active row instead of duplicating it. */
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  ...timestamps,
});

export const icMetaRecommendationFeedback = pgTable("ic_meta_recommendation_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  recommendationId: uuid("recommendation_id")
    .notNull()
    .references(() => icMetaRecommendations.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => icStaff.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  userNotes: text("user_notes"),
  performanceBefore: jsonb("performance_before"),
  performanceAfter: jsonb("performance_after"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icMetaSignals = pgTable("ic_meta_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id")
    .notNull()
    .references(() => icMetaAdAccounts.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  code: text("code").notNull(),
  analysisPeriod: jsonb("analysis_period").notNull(),
  evidence: jsonb("evidence").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icMetaSyncJobs = pgTable("ic_meta_sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id").references(() => icMetaAdAccounts.id, {
    onDelete: "set null",
  }),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("queued"),
  recordsImported: integer("records_imported").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icMetaAiConversations = pgTable("ic_meta_ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => icMetaWorkspaces.id, { onDelete: "cascade" }),
  adAccountId: uuid("ad_account_id").references(() => icMetaAdAccounts.id, {
    onDelete: "set null",
  }),
  staffId: uuid("staff_id").references(() => icStaff.id, { onDelete: "set null" }),
  title: text("title"),
  ...timestamps,
});

export const icMetaAiMessages = pgTable("ic_meta_ai_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => icMetaAiConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolTrace: jsonb("tool_trace"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
