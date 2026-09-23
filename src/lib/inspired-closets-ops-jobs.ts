/**
 * Jobs spine helpers: stage labels, payroll → job stage inference,
 * and seeding jobs/clients from imported payroll entries.
 */
import { getSupabaseAdmin } from "@/db/client";
import type { IcJobStage } from "@/db/ops-schema";
import {
  clientIdentityKey,
  jobDescriptorFromName,
  resolveClient,
} from "@/lib/inspired-closets-ops-clients";

export type { IcJobStage };

export const JOB_STAGES: { id: IcJobStage; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "consultation", label: "Consultation" },
  { id: "quoted", label: "Quoted" },
  { id: "deposit_pending", label: "Deposit pending" },
  { id: "deposit_received", label: "Deposit received" },
  { id: "job_check", label: "Job check" },
  { id: "ordered", label: "Ordered" },
  { id: "install_scheduled", label: "Install scheduled" },
  { id: "install_in_progress", label: "Install in progress" },
  { id: "install_complete", label: "Install complete" },
  { id: "final_payment", label: "Final payment" },
  { id: "closed", label: "Closed" },
  { id: "cancelled", label: "Cancelled" },
];

export function stageLabel(stage: string): string {
  return JOB_STAGES.find((item) => item.id === stage)?.label ?? stage;
}

/** Extra project-list filters. These are not pipeline stages. */
export const JOB_LIST_VIEWS = [
  { id: "completed_unpaid", label: "Completed but unpaid" },
  { id: "shop_not_ready", label: "In the shop, not ready" },
  { id: "shop_ready", label: "In the shop, ready" },
  { id: "addons", label: "Add-ons" },
  { id: "go_backs", label: "Go-backs" },
] as const;

export type JobListViewId = (typeof JOB_LIST_VIEWS)[number]["id"];

export function isJobListView(value: string): value is JobListViewId {
  return JOB_LIST_VIEWS.some((view) => view.id === value);
}

const COMPLETED_UNPAID_STAGES = new Set(["closed", "install_complete", "final_payment"]);

export function isAddonJob(job: { title?: string | null; notes?: string | null }): boolean {
  const text = `${job.title ?? ""} ${job.notes ?? ""}`;
  return /\bADD[\s-]?ONS?\b|\bA\/O\b/i.test(text);
}

export function isGoBackJob(job: {
  job_kind?: string | null;
  title?: string | null;
  notes?: string | null;
}): boolean {
  if (job.job_kind === "go_back") return true;
  return /\bGO[\s-]?BACKS?\b|\bG\/B\b/i.test(`${job.title ?? ""} ${job.notes ?? ""}`);
}

export function isFiftyPercentPaid(job: {
  deposit_paid?: boolean | null;
  deposit_intake_status?: string | null;
  contract_cents?: number | null;
  collected_cents?: number | null;
}): boolean {
  if (job.deposit_paid) return true;
  if (job.deposit_intake_status === "paid") return true;
  const contract = job.contract_cents ?? 0;
  const collected = job.collected_cents ?? 0;
  return contract > 0 && collected >= Math.round(contract * 0.5);
}

export function isTenPercentPaid(job: {
  completion_paid?: boolean | null;
  contract_cents?: number | null;
  collected_cents?: number | null;
}): boolean {
  if (job.completion_paid) return true;
  const contract = job.contract_cents ?? 0;
  const collected = job.collected_cents ?? 0;
  return contract > 0 && collected >= contract;
}

export function jobMatchesListView(
  job: {
    stage: string;
    contract_cents?: number | null;
    collected_cents?: number | null;
    title?: string | null;
    notes?: string | null;
    job_kind?: string | null;
    receiving_open_qty?: number | null;
    receiving_total_qty?: number | null;
  },
  view: JobListViewId,
): boolean {
  if (view === "completed_unpaid") {
    const contract = job.contract_cents ?? 0;
    const collected = job.collected_cents ?? 0;
    return COMPLETED_UNPAID_STAGES.has(job.stage) && contract > 0 && collected < contract;
  }
  if (view === "shop_not_ready") {
    const total = job.receiving_total_qty ?? 0;
    const open = job.receiving_open_qty ?? 0;
    return total > 0 && open > 0;
  }
  if (view === "shop_ready") {
    const total = job.receiving_total_qty ?? 0;
    const open = job.receiving_open_qty ?? 0;
    return total > 0 && open === 0;
  }
  if (view === "addons") return isAddonJob(job);
  return isGoBackJob(job);
}

/** Frank's whiteboard colors: green new / blue go-back / red service. */
export const JOB_KINDS = [
  { id: "new_install", label: "New job", tag: null as "SVC" | "G/B" | null },
  { id: "go_back", label: "Go-back", tag: "G/B" as const },
  { id: "service", label: "Service", tag: "SVC" as const },
] as const;

export type IcJobKind = (typeof JOB_KINDS)[number]["id"];

export function isJobKind(value: unknown): value is IcJobKind {
  return value === "new_install" || value === "go_back" || value === "service";
}

export function resolveJobKind(job: {
  job_kind?: unknown;
  notes?: unknown;
  stage?: unknown;
}): IcJobKind {
  if (isJobKind(job.job_kind)) return job.job_kind;
  const notes = String(job.notes ?? "").toLowerCase();
  if (/\b(svc|service)\b/.test(notes) || job.stage === "service") return "service";
  if (/\b(g\/?b|go[\s-]?back)\b/.test(notes)) return "go_back";
  return "new_install";
}

export function jobKindTag(kind: IcJobKind): "SVC" | "G/B" | null {
  if (kind === "service") return "SVC";
  if (kind === "go_back") return "G/B";
  return null;
}

export function jobKindLabel(kind: IcJobKind): string {
  return JOB_KINDS.find((item) => item.id === kind)?.label ?? "New job";
}

type PayrollSeedRow = {
  id: string;
  designer_id: string;
  client_name: string;
  entry_date: string | null;
  contract_cents: number;
  deposit_cents: number;
  check_cents: number;
  pay_date: string | null;
  status: string;
  notes: string | null;
  job_id: string | null;
  import_key: string | null;
};

/** Best-effort stage from a payroll row until the team manages stages in-app. */
export function inferStageFromPayroll(row: {
  contract_cents: number;
  deposit_cents: number;
  check_cents: number;
  pay_date: string | null;
  status: string;
}): IcJobStage {
  if (row.status === "paid" || row.pay_date) return "closed";
  if (row.check_cents > 0) return "final_payment";
  if (row.deposit_cents > 0 && row.contract_cents > 0) return "deposit_received";
  if (row.contract_cents > 0) return "quoted";
  return "lead";
}

export type JobsSyncResult = {
  clientsCreated: number;
  jobsCreated: number;
  jobsLinked: number;
  skipped: number;
};

async function chunked<T>(
  items: T[],
  size: number,
  run: (slice: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await run(items.slice(i, i + size));
  }
}

/**
 * Create clients + jobs from payroll entries that have no job_id yet.
 * Batched for Vercel timeouts. Idempotent via workbook_ref.
 */
export async function syncJobsFromPayroll(): Promise<JobsSyncResult> {
  const supabase = getSupabaseAdmin();

  const { data: entries, error } = await supabase
    .from("ic_payroll_entries")
    .select(
      "id, designer_id, client_name, entry_date, contract_cents, deposit_cents, check_cents, pay_date, status, notes, job_id, import_key",
    )
    .is("deleted_at", null)
    .limit(5000);
  if (error) throw error;

  const rows = (entries ?? []) as PayrollSeedRow[];
  let skipped = 0;
  let clientsCreated = 0;

  const clientIdByKey = new Map<string, string>();
  const { data: existingClients, error: clientsError } = await supabase
    .from("ic_clients")
    .select("id, name, identity_key, merged_into_client_id")
    .is("deleted_at", null)
    .is("merged_into_client_id", null);
  if (clientsError) throw clientsError;

  for (const client of existingClients ?? []) {
    const key = client.identity_key || clientIdentityKey(client.name);
    if (!clientIdByKey.has(key)) clientIdByKey.set(key, client.id);
  }

  const { data: existingJobs, error: jobsError } = await supabase
    .from("ic_jobs")
    .select("id, workbook_ref")
    .is("deleted_at", null)
    .not("workbook_ref", "is", null);
  if (jobsError) throw jobsError;

  const jobIdByRef = new Map<string, string>();
  for (const job of existingJobs ?? []) {
    if (job.workbook_ref) jobIdByRef.set(job.workbook_ref, job.id);
  }

  type JobInsert = {
    client_id: string;
    designer_id: string;
    stage: IcJobStage;
    contract_cents: number;
    deposit_cents: number;
    collected_cents: number;
    sold_date: string | null;
    completed_date: string | null;
    workbook_ref: string;
    title: string | null;
    notes: string | null;
    risk_flag: boolean;
  };

  const jobsToInsert: JobInsert[] = [];
  const linkPlan: Array<{ entryId: string; ref: string }> = [];

  for (const row of rows) {
    const name = row.client_name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const ref = row.import_key || row.id;
    const key = clientIdentityKey(name);
    let clientId = clientIdByKey.get(key) ?? null;

    if (!clientId) {
      const resolved = await resolveClient({ name });
      clientId = resolved.clientId;
      clientIdByKey.set(key, clientId);
      if (resolved.created) clientsCreated += 1;
    }

    if (row.job_id) {
      jobIdByRef.set(ref, row.job_id);
      continue;
    }

    if (jobIdByRef.has(ref)) {
      linkPlan.push({ entryId: row.id, ref });
      continue;
    }

    jobsToInsert.push({
      client_id: clientId,
      designer_id: row.designer_id,
      stage: inferStageFromPayroll(row),
      contract_cents: row.contract_cents ?? 0,
      deposit_cents: row.deposit_cents ?? 0,
      collected_cents: row.deposit_cents ?? 0,
      sold_date: row.entry_date,
      completed_date: row.pay_date,
      workbook_ref: ref,
      title: jobDescriptorFromName(name),
      notes: row.notes,
      risk_flag: false,
    });
    linkPlan.push({ entryId: row.id, ref });
  }

  let jobsCreated = 0;
  await chunked(jobsToInsert, 100, async (slice) => {
    let { data, error: insertError } = await supabase.from("ic_jobs").insert(slice).select("id, workbook_ref");
    if (insertError && /title|column|schema cache/i.test(insertError.message)) {
      const withoutTitle = slice.map((row) => {
        const { title, ...rest } = row;
        void title;
        return rest;
      });
      ({ data, error: insertError } = await supabase
        .from("ic_jobs")
        .insert(withoutTitle)
        .select("id, workbook_ref"));
    }
    if (insertError) throw insertError;
    for (const job of data ?? []) {
      if (job.workbook_ref) jobIdByRef.set(job.workbook_ref, job.id);
      jobsCreated += 1;
    }
  });

  // Batch-link payroll rows in chunks via Promise.all of small updates
  // (Supabase JS doesn't support multi-row different values easily).
  let jobsLinked = 0;
  const links = linkPlan
    .map(({ entryId, ref }) => {
      const jobId = jobIdByRef.get(ref);
      return jobId ? { entryId, jobId } : null;
    })
    .filter((item): item is { entryId: string; jobId: string } => Boolean(item));

  await chunked(links, 40, async (slice) => {
    const results = await Promise.all(
      slice.map(({ entryId, jobId }) =>
        supabase
          .from("ic_payroll_entries")
          .update({ job_id: jobId, updated_at: new Date().toISOString() })
          .eq("id", entryId)
          .is("job_id", null),
      ),
    );
    for (const result of results) {
      if (result.error) throw result.error;
      jobsLinked += 1;
    }
  });

  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: "00000000-0000-0000-0000-000000000000",
    action: "synced_from_payroll",
    actor_label: "ops-app",
    changes: { clientsCreated, jobsCreated, jobsLinked, skipped },
  });

  return { clientsCreated, jobsCreated, jobsLinked, skipped };
}
