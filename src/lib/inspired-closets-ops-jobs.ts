/**
 * Jobs spine helpers: stage labels, payroll → job stage inference,
 * and seeding jobs/clients from imported payroll entries.
 */
import { getSupabaseAdmin } from "@/db/client";
import type { IcJobStage } from "@/db/ops-schema";

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

function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

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

  const { data: existingClients, error: clientsError } = await supabase
    .from("ic_clients")
    .select("id, name")
    .is("deleted_at", null);
  if (clientsError) throw clientsError;

  const clientIdByName = new Map<string, string>();
  for (const client of existingClients ?? []) {
    clientIdByName.set(normalizeClientName(client.name), client.id);
  }

  // Collect unique new clients
  const newClientNames: string[] = [];
  const seenNew = new Set<string>();
  for (const row of rows) {
    const name = row.client_name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const key = normalizeClientName(name);
    if (clientIdByName.has(key) || seenNew.has(key)) continue;
    seenNew.add(key);
    newClientNames.push(name.trim());
  }

  let clientsCreated = 0;
  await chunked(newClientNames, 100, async (slice) => {
    const { data, error: insertError } = await supabase
      .from("ic_clients")
      .insert(slice.map((name) => ({ name })))
      .select("id, name");
    if (insertError) throw insertError;
    for (const client of data ?? []) {
      clientIdByName.set(normalizeClientName(client.name), client.id);
      clientsCreated += 1;
    }
  });

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
    notes: string | null;
    risk_flag: boolean;
  };

  const jobsToInsert: JobInsert[] = [];
  const linkPlan: Array<{ entryId: string; ref: string }> = [];

  for (const row of rows) {
    const name = row.client_name?.trim();
    if (!name) continue;

    const ref = row.import_key || row.id;
    const clientId = clientIdByName.get(normalizeClientName(name));
    if (!clientId) {
      skipped += 1;
      continue;
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
      notes: row.notes,
      risk_flag: false,
    });
    linkPlan.push({ entryId: row.id, ref });
  }

  let jobsCreated = 0;
  await chunked(jobsToInsert, 100, async (slice) => {
    const { data, error: insertError } = await supabase
      .from("ic_jobs")
      .insert(slice)
      .select("id, workbook_ref");
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
