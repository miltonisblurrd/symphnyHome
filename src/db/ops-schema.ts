/**
 * Inspired Closets OS — operational schema (Phase 1: jobs spine + payroll).
 *
 * Design rules (apply to every table):
 * - `ic_` prefix keeps ops tables separate from the Symphony SaaS tables.
 * - created_by/updated_by + timestamps on everything so performance metrics
 *   are computable retroactively.
 * - Soft delete via deleted_at; rows are never hard-deleted from the app.
 * - Money stored in cents (integer) to avoid float drift; margins stored as
 *   basis points of a percent x100 (e.g. 45.25% -> 4525) for exactness.
 */
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const icRoleEnum = pgEnum("ic_role", [
  "owner", // Gavin
  "admin", // Milton / Symphony
  "operations", // Craig
  "front_office", // Des
  "finance", // Lulu
  "inventory", // Frank
  "designer",
  "installer", // drivers
]);

export const icJobStageEnum = pgEnum("ic_job_stage", [
  "lead",
  "consultation",
  "quoted",
  "deposit_pending",
  "deposit_received",
  "job_check",
  "ordered",
  "install_scheduled",
  "install_in_progress",
  "install_complete",
  "final_payment",
  "closed",
  "cancelled",
]);

export const icPayrollStatusEnum = pgEnum("ic_payroll_status", [
  "open", // commission accruing, not yet payable
  "payable", // ready to pay (margin gate checked)
  "paid",
  "held", // blocked (e.g. below 45% gate, awaiting Gavin override)
]);

/** Staff = employees using the app. Linked to auth later; role drives access. */
export const icStaff = pgTable("ic_staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: icRoleEnum("role").notNull(),
  email: text("email"),
  phone: text("phone"),
  /** Optional public avatar URL (Supabase storage or external). */
  avatarUrl: text("avatar_url"),
  /** When they started — used for Field tenure (“with us X years”). */
  hiredAt: date("hired_at"),
  /** Display title, e.g. Lead Installer. */
  title: text("title"),
  active: boolean("active").notNull().default(true),
  /** Legacy identifier, e.g. payroll workbook tab name ("REB 26"). */
  workbookTab: text("workbook_tab"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Clients persist across jobs (repeat customers, add-ons, referrals). */
export const icClients = pgTable("ic_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const icLeadSourceEnum = pgEnum("ic_lead_source", [
  "call",
  "website",
  "google",
  "meta",
  "instagram",
  "yelp",
  "billboard",
  "vehicle",
  "referral",
  "referral_company",
  "referral_personal",
  "chatgpt",
  "organic_search",
  "paid_search",
  "facebook",
  "email",
  "other",
]);

export const icLeadStageEnum = pgEnum("ic_lead_stage", [
  "new",
  "schedule",
  "follow_up",
  "attempt_1",
  "attempt_2",
  "attempt_3",
  "attempt_4",
  "attempt_5",
  "nurturing",
  "not_interested",
  "junk",
  "appointment_set",
  "moved_to_studio",
  "canceled_appointment",
  "new_construction",
  "duplicate",
  "prospect",
  "rescheduled",
]);

export const icAppointmentKindEnum = pgEnum("ic_appointment_kind", [
  "consultation",
  "job_check",
  "install",
]);

export const icAppointmentLocationEnum = pgEnum("ic_appointment_location", [
  "on_site",
  "showroom",
  "virtual",
]);

export const icAppointmentStatusEnum = pgEnum("ic_appointment_status", [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "rescheduled",
]);

export const icPaymentMilestoneEnum = pgEnum("ic_payment_milestone", [
  "deposit_50",
  "install_40",
  "completion_10",
]);

export const icPaymentStatusEnum = pgEnum("ic_payment_status", [
  "pending",
  "partial",
  "paid",
  "void",
]);

export const icPaymentMethodEnum = pgEnum("ic_payment_method", [
  "podium",
  "check",
  "card",
  "other",
]);

/** Front-office CRM lead (Des). Converts into ic_jobs when sold. */
export const icLeads = pgTable("ic_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => icClients.id),
  source: icLeadSourceEnum("source").notNull().default("instagram"),
  stage: icLeadStageEnum("stage").notNull().default("new"),
  ownerId: uuid("owner_id").references(() => icStaff.id),
  designerId: uuid("designer_id").references(() => icStaff.id),
  contactAttempts: integer("contact_attempts").notNull().default(0),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),
  nextActionNote: text("next_action_note"),
  disqualificationReason: text("disqualification_reason"),
  projectArea: text("project_area"),
  motivation: text("motivation"),
  desiredTimeline: text("desired_timeline"),
  communityRef: text("community_ref"),
  leadType: text("lead_type").default("consumer"),
  influencerType: text("influencer_type"),
  formType: text("form_type"),
  street: text("street"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  country: text("country").default("United States"),
  communityName: text("community_name"),
  showroomVisit: boolean("showroom_visit").notNull().default(false),
  showRoom: text("show_room").default("Las Vegas Showroom"),
  areasOfHome: jsonb("areas_of_home").$type<string[]>().default([]),
  nurturingReason: text("nurturing_reason"),
  junkReason: text("junk_reason"),
  needsFollowUpDate: date("needs_follow_up_date"),
  contactPreference: text("contact_preference"),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  pipelineStatus: text("pipeline_status"),
  pipelineSigned: boolean("pipeline_signed").notNull().default(false),
  pipelineRto: boolean("pipeline_rto").notNull().default(false),
  pipelineSoldCents: integer("pipeline_sold_cents").notNull().default(0),
  pipelineDepositCents: integer("pipeline_deposit_cents").notNull().default(0),
  pipelineMarginBps: integer("pipeline_margin_bps"),
  pipelineSourceLabel: text("pipeline_source_label"),
  convertedJobId: uuid("converted_job_id"),
  riskFlag: boolean("risk_flag").notNull().default(false),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Chatter posts / notes on a lead (Community Chatter equivalent). */
export const icLeadChatter = pgTable("ic_lead_chatter", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => icLeads.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => icStaff.id),
  authorName: text("author_name"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** The spine. Every module hangs off a job. */
export const icJobs = pgTable("ic_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => icClients.id),
  leadId: uuid("lead_id").references(() => icLeads.id),
  designerId: uuid("designer_id").references(() => icStaff.id),
  installerId: uuid("installer_id").references(() => icStaff.id),
  stage: icJobStageEnum("stage").notNull().default("lead"),
  /** Money in cents. */
  contractCents: integer("contract_cents").notNull().default(0),
  depositCents: integer("deposit_cents").notNull().default(0),
  collectedCents: integer("collected_cents").notNull().default(0),
  soldDate: date("sold_date"),
  installDate: date("install_date"),
  completedDate: date("completed_date"),
  /** Legacy linkage while double-entry with Community continues. */
  communityRef: text("community_ref"),
  studioRef: text("studio_ref"),
  workbookRef: text("workbook_ref"),
  receiveDate: date("receive_date"),
  jobCheckOwnerId: uuid("job_check_owner_id").references(() => icStaff.id),
  tentativeInstallNotes: text("tentative_install_notes"),
  siteReadyNotes: text("site_ready_notes"),
  /** Des intake hint: pending | link_sent | check_pending | paid */
  depositIntakeStatus: text("deposit_intake_status"),
  /** Guys needed on site — feeds the schedule suggester. */
  crewSize: integer("crew_size").default(2),
  /** Whole days on the calendar. */
  estimatedInstallDays: integer("estimated_install_days").default(1),
  notes: text("notes"),
  riskFlag: boolean("risk_flag").notNull().default(false),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Consultations / job checks / installs — Des calendar (manual double-entry). */
export const icAppointments = pgTable("ic_appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => icLeads.id),
  clientId: uuid("client_id").references(() => icClients.id),
  jobId: uuid("job_id").references(() => icJobs.id),
  designerId: uuid("designer_id").references(() => icStaff.id),
  kind: icAppointmentKindEnum("kind").notNull().default("consultation"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  locationType: icAppointmentLocationEnum("location_type").notNull().default("on_site"),
  status: icAppointmentStatusEnum("status").notNull().default("scheduled"),
  delayReason: text("delay_reason"),
  confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
  confirmationNote: text("confirmation_note"),
  communityRef: text("community_ref"),
  /** Google Calendar event id once push sync is connected. */
  googleEventId: text("google_event_id"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** 50 / 40 / 10 customer payment ledger. Podium stays the rail; app owns owed/paid. */
export const icPayments = pgTable("ic_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => icJobs.id),
  milestone: icPaymentMilestoneEnum("milestone").notNull(),
  amountDueCents: integer("amount_due_cents").notNull().default(0),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  status: icPaymentStatusEnum("status").notNull().default("pending"),
  method: icPaymentMethodEnum("method"),
  podiumRef: text("podium_ref"),
  checkRef: text("check_ref"),
  quickbooksRef: text("quickbooks_ref"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  linkSentAt: timestamp("link_sent_at", { withTimezone: true }),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  reminderLevel: integer("reminder_level").notNull().default(0),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icReconExceptionTypeEnum = pgEnum("ic_recon_exception_type", [
  "needs_qb_entry",
  "missing_podium_ref",
  "final_unpaid",
  "below_margin_gate",
  "unverified_costs",
  "spiff_approval",
  "duplicate_risk",
  "other",
]);

export const icReconExceptionStatusEnum = pgEnum("ic_recon_exception_status", [
  "open",
  "investigating",
  "resolved",
  "wont_fix",
]);

/** Lulu job-costing overrides + spiff control (July 15 finance workflow). */
export const icJobFinancials = pgTable("ic_job_financials", {
  jobId: uuid("job_id")
    .primaryKey()
    .references(() => icJobs.id),
  materialCents: integer("material_cents"),
  laborCents: integer("labor_cents"),
  otherFeesCents: integer("other_fees_cents").notNull().default(0),
  spiffCents: integer("spiff_cents").notNull().default(0),
  spiffRecipient: text("spiff_recipient"),
  spiffStatus: text("spiff_status").notNull().default("none"),
  costsVerified: boolean("costs_verified").notNull().default(false),
  stowInvoiceRef: text("stow_invoice_ref"),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Manual Stow / pallet / freight lines (parallel OS — no Stow API). */
export const icJobCostLines = pgTable("ic_job_cost_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => icJobs.id),
  costType: text("cost_type").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  vendorRef: text("vendor_ref"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Payroll entries mirror the red 2026 workbook rows one-to-one so Craig's
 * muscle memory transfers: contract, deposit, margins (starting / after spiff
 * / final), comm %, check, pay date, notes.
 */
export const icPayrollEntries = pgTable("ic_payroll_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => icJobs.id),
  designerId: uuid("designer_id")
    .notNull()
    .references(() => icStaff.id),
  clientName: text("client_name").notNull(),
  entryDate: date("entry_date"),
  contractCents: integer("contract_cents").notNull().default(0),
  depositCents: integer("deposit_cents").notNull().default(0),
  /** Margins in hundredths of a percent (4525 = 45.25%). Null = not yet filled. */
  marginStartingBp: integer("margin_starting_bp"),
  contractAfterSpiffCents: integer("contract_after_spiff_cents"),
  marginAfterSpiffBp: integer("margin_after_spiff_bp"),
  depositAfterSpiffCents: integer("deposit_after_spiff_cents"),
  marginFinalBp: integer("margin_final_bp"),
  commissionPctBp: integer("commission_pct_bp"),
  checkCents: integer("check_cents").notNull().default(0),
  payDate: date("pay_date"),
  status: icPayrollStatusEnum("status").notNull().default("open"),
  /** Below the 45% gate requires an owner override to become payable. */
  gateOverrideBy: uuid("gate_override_by").references(() => icStaff.id),
  gateOverrideReason: text("gate_override_reason"),
  notes: text("notes"),
  /** Provenance for imported rows: tab + row so imports are idempotent. */
  importKey: text("import_key").unique(),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Finance exceptions queue — replaces Lulu’s “watch this in Excel” list. */
export const icReconciliationExceptions = pgTable("ic_reconciliation_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  exceptionType: icReconExceptionTypeEnum("exception_type").notNull().default("other"),
  status: icReconExceptionStatusEnum("status").notNull().default("open"),
  jobId: uuid("job_id").references(() => icJobs.id),
  paymentId: uuid("payment_id").references(() => icPayments.id),
  payrollEntryId: uuid("payroll_entry_id").references(() => icPayrollEntries.id),
  amountCents: integer("amount_cents").notNull().default(0),
  title: text("title").notNull(),
  detail: text("detail"),
  ownerId: uuid("owner_id").references(() => icStaff.id),
  podiumRef: text("podium_ref"),
  quickbooksRef: text("quickbooks_ref"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Append-only audit trail. Every module writes here; Cubby reads it. */
export const icActivityLog = pgTable("ic_activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(), // "job" | "payroll_entry" | "client" | ...
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(), // "created" | "updated" | "status_changed" | "imported" | "override"
  actorId: uuid("actor_id").references(() => icStaff.id),
  actorLabel: text("actor_label"), // fallback name when no staff record (e.g. "workbook-import")
  changes: jsonb("changes"), // { field: { from, to } }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icStockMovementTypeEnum = pgEnum("ic_stock_movement_type", [
  "receive", // stock in (Stow / order / purchase)
  "allocate", // pulled to a job (leaves the shelf)
  "return", // unused parts back from job
  "adjust", // cycle count correction
  "scrap", // damaged / unusable
  "sell_excess", // reclaim capital on dead stock
  "reserve", // promised to a job, still on the shelf
  "unreserve", // release a promise
]);

/** Parts catalog + live qty. Source of truth for Frank's warehouse. */
export const icParts = pgTable("ic_parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  /** Size / variant so "undermount slide" is never the wrong length. */
  size: text("size"),
  category: text("category").notNull().default("hardware"),
  /** Bin / aisle / shelf label in the warehouse. */
  location: text("location"),
  barcode: text("barcode"),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  qtyOnHand: integer("qty_on_hand").notNull().default(0),
  /** Soft reserve for open job allocations (optional tracking). */
  qtyReserved: integer("qty_reserved").notNull().default(0),
  reorderPoint: integer("reorder_point").notNull().default(0),
  /** Flag for dead/excess stock Gavin wants sold or used down. */
  isExcess: boolean("is_excess").notNull().default(false),
  vendor: text("vendor"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * Append-only stock ledger. qty_on_hand on ic_parts is updated with every row.
 * allocate/return rows should include job_id so material cost can attach to jobs.
 */
export const icStockMovements = pgTable("ic_stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  partId: uuid("part_id")
    .notNull()
    .references(() => icParts.id),
  jobId: uuid("job_id").references(() => icJobs.id),
  movementType: icStockMovementTypeEnum("movement_type").notNull(),
  /** Signed quantity: receive/return positive; allocate/scrap/sell_excess negative in effect. */
  qty: integer("qty").notNull(),
  unitCostCents: integer("unit_cost_cents"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Parts promised / staged / pulled for a specific job. */
export const icJobMaterials = pgTable("ic_job_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => icJobs.id),
  partId: uuid("part_id")
    .notNull()
    .references(() => icParts.id),
  qty: integer("qty").notNull().default(1),
  status: text("status").notNull().default("reserved"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  stagedBy: uuid("staged_by").references(() => icStaff.id),
  stagedAt: timestamp("staged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icMediaKindEnum = pgEnum("ic_media_kind", [
  "before",
  "during",
  "after",
  "issue",
  "staging",
  "other",
]);

export const icFieldIssueTypeEnum = pgEnum("ic_field_issue_type", [
  "site_not_ready",
  "missing_part",
  "damage",
  "access_problem",
  "customer_issue",
  "other",
]);

export const icFieldIssueStatusEnum = pgEnum("ic_field_issue_status", [
  "open",
  "acknowledged",
  "resolved",
]);

/** Driver/installer clock sessions on a job site. */
export const icTimeEntries = pgTable("ic_time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => icJobs.id),
  installerId: uuid("installer_id")
    .notNull()
    .references(() => icStaff.id),
  clockInAt: timestamp("clock_in_at", { withTimezone: true }).notNull(),
  clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
  clockInLat: text("clock_in_lat"),
  clockInLng: text("clock_in_lng"),
  clockOutLat: text("clock_out_lat"),
  clockOutLng: text("clock_out_lng"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Photos/videos captured in the field, tagged to a job. */
export const icJobMedia = pgTable("ic_job_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => icJobs.id),
  installerId: uuid("installer_id").references(() => icStaff.id),
  kind: icMediaKindEnum("kind").notNull().default("other"),
  storagePath: text("storage_path").notNull(),
  publicUrl: text("public_url"),
  caption: text("caption"),
  mimeType: text("mime_type"),
  bytes: integer("bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Field issues → feeds service wall later. */
export const icFieldIssues = pgTable("ic_field_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => icJobs.id),
  installerId: uuid("installer_id").references(() => icStaff.id),
  issueType: icFieldIssueTypeEnum("issue_type").notNull().default("other"),
  description: text("description").notNull(),
  mediaId: uuid("media_id").references(() => icJobMedia.id),
  status: icFieldIssueStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type IcStaff = typeof icStaff.$inferSelect;
export type IcClient = typeof icClients.$inferSelect;
export type IcLead = typeof icLeads.$inferSelect;
export type IcJob = typeof icJobs.$inferSelect;
export type IcAppointment = typeof icAppointments.$inferSelect;
export type IcPayment = typeof icPayments.$inferSelect;
export type IcJobFinancials = typeof icJobFinancials.$inferSelect;
export type IcJobCostLine = typeof icJobCostLines.$inferSelect;
export type IcReconciliationException = typeof icReconciliationExceptions.$inferSelect;
export type IcPayrollEntry = typeof icPayrollEntries.$inferSelect;
export type IcActivityLog = typeof icActivityLog.$inferSelect;
export type IcPart = typeof icParts.$inferSelect;
export type IcStockMovement = typeof icStockMovements.$inferSelect;
export type IcJobMaterial = typeof icJobMaterials.$inferSelect;
export type IcTimeEntry = typeof icTimeEntries.$inferSelect;
export type IcJobMedia = typeof icJobMedia.$inferSelect;
export const icShipmentStatusEnum = pgEnum("ic_shipment_status", [
  "parsing",
  "ready",
  "in_progress",
  "complete",
]);

export const icShipmentItemStatusEnum = pgEnum("ic_shipment_item_status", [
  "expected",
  "received",
  "damaged",
  "missing",
]);

export const icShipmentScanResultEnum = pgEnum("ic_shipment_scan_result", [
  "matched",
  "already_received",
  "unknown",
  "pallet_mismatch",
]);

/** Packing-slip receive session — ModulusScan clone, owned by the OS. */
export const icShipments = pgTable("ic_shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  notice: text("notice"),
  shipDate: date("ship_date"),
  vendor: text("vendor").notNull().default("stow"),
  status: icShipmentStatusEnum("status").notNull().default("parsing"),
  sourceFilename: text("source_filename"),
  storagePath: text("storage_path"),
  publicUrl: text("public_url"),
  totalPages: integer("total_pages").notNull().default(0),
  parseError: text("parse_error"),
  parseQuality: jsonb("parse_quality"),
  createdBy: uuid("created_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const icShipmentItems = pgTable("ic_shipment_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => icShipments.id),
  itemNumber: text("item_number").notNull(),
  soNumber: text("so_number"),
  custRef: text("cust_ref"),
  jobName: text("job_name"),
  projectNumber: text("project_number"),
  description: text("description"),
  qty: integer("qty").notNull().default(1),
  receivedQty: integer("received_qty").notNull().default(0),
  damagedQty: integer("damaged_qty").notNull().default(0),
  containerId: text("container_id"),
  sourcePage: integer("source_page"),
  status: icShipmentItemStatusEnum("status").notNull().default("expected"),
  vendorSku: text("vendor_sku"),
  jobId: uuid("job_id").references(() => icJobs.id),
  partId: uuid("part_id").references(() => icParts.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icShipmentScans = pgTable("ic_shipment_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => icShipments.id),
  itemId: uuid("item_id").references(() => icShipmentItems.id),
  scannedValue: text("scanned_value").notNull(),
  result: icShipmentScanResultEnum("result").notNull().default("matched"),
  qty: integer("qty").notNull().default(1),
  actorId: uuid("actor_id").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const icShipmentClaims = pgTable("ic_shipment_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => icShipments.id),
  itemId: uuid("item_id").references(() => icShipmentItems.id),
  claimType: text("claim_type").notNull().default("DAMAGED"),
  description: text("description").notNull(),
  damagedQty: integer("damaged_qty").notNull().default(1),
  photoUrl: text("photo_url"),
  status: text("status").notNull().default("draft"),
  reorder: boolean("reorder").notNull().default(false),
  createdBy: uuid("created_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IcFieldIssue = typeof icFieldIssues.$inferSelect;
export type IcShipment = typeof icShipments.$inferSelect;
export type IcShipmentItem = typeof icShipmentItems.$inferSelect;
export type IcShipmentScan = typeof icShipmentScans.$inferSelect;
export type IcShipmentClaim = typeof icShipmentClaims.$inferSelect;

export type IcRole = (typeof icRoleEnum.enumValues)[number];
export type IcJobStage = (typeof icJobStageEnum.enumValues)[number];
export type IcLeadSource = (typeof icLeadSourceEnum.enumValues)[number];
export type IcLeadStage = (typeof icLeadStageEnum.enumValues)[number];
export type IcAppointmentKind = (typeof icAppointmentKindEnum.enumValues)[number];
export type IcAppointmentLocation = (typeof icAppointmentLocationEnum.enumValues)[number];
export type IcAppointmentStatus = (typeof icAppointmentStatusEnum.enumValues)[number];
export type IcPaymentMilestone = (typeof icPaymentMilestoneEnum.enumValues)[number];
export type IcPaymentStatus = (typeof icPaymentStatusEnum.enumValues)[number];
export type IcPaymentMethod = (typeof icPaymentMethodEnum.enumValues)[number];
export type IcReconExceptionType = (typeof icReconExceptionTypeEnum.enumValues)[number];
export type IcReconExceptionStatus = (typeof icReconExceptionStatusEnum.enumValues)[number];
export type IcPayrollStatus = (typeof icPayrollStatusEnum.enumValues)[number];
export type IcStockMovementType = (typeof icStockMovementTypeEnum.enumValues)[number];
export type IcMediaKind = (typeof icMediaKindEnum.enumValues)[number];
export type IcFieldIssueType = (typeof icFieldIssueTypeEnum.enumValues)[number];
export type IcFieldIssueStatus = (typeof icFieldIssueStatusEnum.enumValues)[number];
export type IcShipmentStatus = (typeof icShipmentStatusEnum.enumValues)[number];
export type IcShipmentItemStatus = (typeof icShipmentItemStatusEnum.enumValues)[number];
export type IcShipmentScanResult = (typeof icShipmentScanResultEnum.enumValues)[number];
