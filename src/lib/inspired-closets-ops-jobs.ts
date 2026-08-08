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

/**
 * Create clients + jobs from payroll entries that have no job_id yet.
 * Idempotent via workbook_ref = payroll import_key (or entry id).
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
  let clientsCreated = 0;
  let jobsCreated = 0;
  let jobsLinked = 0;
  let skipped = 0;

  // Cache existing clients by normalized name
  const { data: existingClients, error: clientsError } = await supabase
    .from("ic_clients")
    .select("id, name")
    .is("deleted_at", null);
  if (clientsError) throw clientsError;

  const clientIdByName = new Map<string, string>();
  for (const client of existingClients ?? []) {
    clientIdByName.set(normalizeClientName(client.name), client.id);
  }

  // Cache existing jobs by workbook_ref
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

  for (const row of rows) {
    const name = row.client_name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const ref = row.import_key || row.id;
    let jobId = row.job_id ?? jobIdByRef.get(ref) ?? null;

    // Ensure client
    const key = normalizeClientName(name);
    let clientId = clientIdByName.get(key) ?? null;
    if (!clientId) {
      const { data: created, error: createClientError } = await supabase
        .from("ic_clients")
        .insert({ name: name.trim() })
        .select("id")
        .single();
      if (createClientError) throw createClientError;
      const newClientId = created?.id;
      if (!newClientId) throw new Error("Client create returned no id.");
      clientId = newClientId;
      clientIdByName.set(key, newClientId);
      clientsCreated += 1;
    }

    if (!clientId) {
      skipped += 1;
      continue;
    }

    if (!jobId) {
      const stage = inferStageFromPayroll(row);
      const { data: createdJob, error: createJobError } = await supabase
        .from("ic_jobs")
        .insert({
          client_id: clientId,
          designer_id: row.designer_id,
          stage,
          contract_cents: row.contract_cents ?? 0,
          deposit_cents: row.deposit_cents ?? 0,
          collected_cents: row.deposit_cents ?? 0,
          sold_date: row.entry_date,
          completed_date: row.pay_date,
          workbook_ref: ref,
          notes: row.notes,
          risk_flag: false,
        })
        .select("id")
        .single();
      if (createJobError) throw createJobError;
      const newJobId = createdJob?.id;
      if (!newJobId) throw new Error("Job create returned no id.");
      jobId = newJobId;
      jobIdByRef.set(ref, newJobId);
      jobsCreated += 1;
    }

    if (!jobId) {
      skipped += 1;
      continue;
    }

    if (row.job_id !== jobId) {
      const { error: linkError } = await supabase
        .from("ic_payroll_entries")
        .update({ job_id: jobId, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (linkError) throw linkError;
      jobsLinked += 1;
    }
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: "00000000-0000-0000-0000-000000000000",
    action: "synced_from_payroll",
    actor_label: "ops-app",
    changes: { clientsCreated, jobsCreated, jobsLinked, skipped },
  });

  return { clientsCreated, jobsCreated, jobsLinked, skipped };
}
