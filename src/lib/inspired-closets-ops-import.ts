/**
 * One-time (re-runnable) import: red 2026 payroll workbook → Inspired Closets OS.
 *
 * Idempotent: each workbook row maps to a stable import_key (tab-row-client),
 * so re-running refreshes values without duplicating entries. Manual edits made
 * in the app after go-live win: rows whose updated_by is set are skipped.
 */
import { getSupabaseAdmin } from "@/db/client";
import type { OperationsSnapshot } from "@/lib/inspired-closets-google-sheets";
import {
  parsePayrollJobsFromSnapshot,
  type PayrollJob,
} from "@/lib/inspired-closets-payroll-workbook";
import { gavinDemoMeta } from "@/data/inspired-closets-gavin-demo";

const MARGIN_GATE_BP = Math.round(gavinDemoMeta.marginGate * 100);

function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

function percentToBp(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100);
}

function toIsoDate(label: string | null): string | null {
  if (!label) return null;
  const match = label.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
}

function entryStatus(job: PayrollJob): "open" | "payable" | "paid" | "held" {
  if (job.payDate) return "paid";
  if (job.belowGate) return "held";
  if (job.commissionOpen) return "payable";
  return "open";
}

export type WorkbookImportResult = {
  designersUpserted: number;
  entriesImported: number;
  entriesSkippedManual: number;
  rowsIgnored: number;
};

export async function importWorkbookIntoOps(
  snapshot: OperationsSnapshot,
): Promise<WorkbookImportResult> {
  const supabase = getSupabaseAdmin();
  const jobs = parsePayrollJobsFromSnapshot(snapshot);

  // 1. Upsert designers from tabs.
  const tabToDesigner = new Map<string, string>();
  for (const job of jobs) {
    if (!tabToDesigner.has(job.tab)) tabToDesigner.set(job.tab, job.designer);
  }

  const staffIdByTab = new Map<string, string>();
  for (const [tab, name] of tabToDesigner) {
    const { data: existing, error: findError } = await supabase
      .from("ic_staff")
      .select("id")
      .eq("workbook_tab", tab)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      staffIdByTab.set(tab, existing.id);
      continue;
    }
    const { data: created, error: insertError } = await supabase
      .from("ic_staff")
      .insert({ name, role: "designer", workbook_tab: tab })
      .select("id")
      .single();
    if (insertError) throw insertError;
    staffIdByTab.set(tab, created.id);
  }

  // 2. Find entries manually edited in the app; imports must not clobber them.
  const { data: manualRows, error: manualError } = await supabase
    .from("ic_payroll_entries")
    .select("import_key")
    .not("updated_by", "is", null)
    .not("import_key", "is", null);
  if (manualError) throw manualError;
  const manualKeys = new Set((manualRows ?? []).map((row) => row.import_key as string));

  // 3. Upsert payroll entries by import_key.
  let imported = 0;
  let skippedManual = 0;
  let ignored = 0;
  const batch: Record<string, unknown>[] = [];

  for (const job of jobs) {
    if (job.rowType !== "job" && job.rowType !== "adjustment") {
      ignored += 1;
      continue;
    }
    if (manualKeys.has(job.id)) {
      skippedManual += 1;
      continue;
    }
    const designerId = staffIdByTab.get(job.tab);
    if (!designerId) {
      ignored += 1;
      continue;
    }

    batch.push({
      import_key: job.id,
      designer_id: designerId,
      client_name: job.client,
      entry_date: toIsoDate(job.date),
      contract_cents: dollarsToCents(job.contract),
      deposit_cents: dollarsToCents(job.deposit),
      margin_starting_bp: percentToBp(job.marginStarting),
      margin_after_spiff_bp: percentToBp(job.marginAfterSpiff),
      margin_final_bp: percentToBp(job.marginFinal),
      commission_pct_bp: percentToBp(job.commPct),
      check_cents: dollarsToCents(job.checkAmount),
      pay_date: toIsoDate(job.payDate),
      status: entryStatus(job),
      notes: job.notes || null,
    });
    imported += 1;
  }

  const chunkSize = 200;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const { error } = await supabase
      .from("ic_payroll_entries")
      .upsert(batch.slice(i, i + chunkSize), { onConflict: "import_key" });
    if (error) throw error;
  }

  // 4. Log the import run.
  const { error: logError } = await supabase.from("ic_activity_log").insert({
    entity_type: "payroll_entry",
    entity_id: "00000000-0000-0000-0000-000000000000",
    action: "imported",
    actor_label: "workbook-import",
    changes: {
      designers: staffIdByTab.size,
      entries: imported,
      skippedManual,
      ignored,
      syncedAt: snapshot.syncedAt,
      marginGateBp: MARGIN_GATE_BP,
    },
  });
  if (logError) throw logError;

  return {
    designersUpserted: staffIdByTab.size,
    entriesImported: imported,
    entriesSkippedManual: skippedManual,
    rowsIgnored: ignored,
  };
}
