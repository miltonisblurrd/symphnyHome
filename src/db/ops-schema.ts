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

/** The spine. Every module hangs off a job. */
export const icJobs = pgTable("ic_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => icClients.id),
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
  workbookRef: text("workbook_ref"),
  notes: text("notes"),
  riskFlag: boolean("risk_flag").notNull().default(false),
  createdBy: uuid("created_by").references(() => icStaff.id),
  updatedBy: uuid("updated_by").references(() => icStaff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
  "allocate", // pulled to a job
  "return", // unused parts back from job
  "adjust", // cycle count correction
  "scrap", // damaged / unusable
  "sell_excess", // reclaim capital on dead stock
]);

/** Parts catalog + live qty. Source of truth for Frank's warehouse. */
export const icParts = pgTable("ic_parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
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

export type IcStaff = typeof icStaff.$inferSelect;
export type IcClient = typeof icClients.$inferSelect;
export type IcJob = typeof icJobs.$inferSelect;
export type IcPayrollEntry = typeof icPayrollEntries.$inferSelect;
export type IcActivityLog = typeof icActivityLog.$inferSelect;
export type IcPart = typeof icParts.$inferSelect;
export type IcStockMovement = typeof icStockMovements.$inferSelect;

export type IcRole = (typeof icRoleEnum.enumValues)[number];
export type IcJobStage = (typeof icJobStageEnum.enumValues)[number];
export type IcPayrollStatus = (typeof icPayrollStatusEnum.enumValues)[number];
export type IcStockMovementType = (typeof icStockMovementTypeEnum.enumValues)[number];
