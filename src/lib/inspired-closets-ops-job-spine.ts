import { getSupabaseAdmin } from "@/db/client";
import {
  classifyProjectLines,
  isProjectTier,
  suggestedInstallWindow,
  type ClassifiableLine,
  type ProjectTier,
  type SuggestedWindow,
  type TierReason,
} from "@/lib/inspired-closets-ops-tiers";
import { receivingRollupByJobIds } from "@/lib/inspired-closets-ops-receiving";

export const JOB_SPINE_COLUMNS = [
  "install_confidence",
  "project_tier",
  "tier_override",
  "tier_reasons",
  "deposit_received_at",
  "job_check_scheduled_at",
  "job_check_completed_at",
  "rto_at",
  "ordered_at",
  "first_received_at",
  "fully_received_at",
] as const;

const SPINE_ERROR = /install_confidence|project_tier|tier_override|tier_reasons|deposit_received_at|job_check_scheduled_at|job_check_completed_at|rto_at|ordered_at|first_received_at|fully_received_at|ic_notifications|column|schema cache/i;

export type ReceivingHint = {
  ready: boolean;
  received_qty: number;
  total_qty: number;
  open_qty: number;
  message: string | null;
  missing: string[];
};

export function stripSpineColumns(update: Record<string, unknown>): Record<string, unknown> {
  const next = { ...update };
  for (const key of JOB_SPINE_COLUMNS) delete next[key];
  return next;
}

export async function updateJobCompat(jobId: string, update: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const payload = { ...update, updated_at: new Date().toISOString() };
  const first = await supabase.from("ic_jobs").update(payload).eq("id", jobId);
  if (first.error && SPINE_ERROR.test(first.error.message)) {
    return supabase.from("ic_jobs").update(stripSpineColumns(payload)).eq("id", jobId);
  }
  return first;
}

export async function stampJobFirst(jobId: string, field: (typeof JOB_SPINE_COLUMNS)[number], at?: string) {
  const now = at ?? new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("ic_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error && SPINE_ERROR.test(error.message)) return;
  if (error || !data || data[field]) return;
  const write = await supabase
    .from("ic_jobs")
    .update({ [field]: now, updated_at: now })
    .eq("id", jobId)
    .is(field, null);
  if (write.error && SPINE_ERROR.test(write.error.message)) return;
}

export async function receivingReadiness(jobId: string): Promise<ReceivingHint> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipment_items")
    .select("qty, received_qty, status, item_number, job_name, cust_ref")
    .eq("job_id", jobId);
  if (error) {
    return { ready: true, received_qty: 0, total_qty: 0, open_qty: 0, message: null, missing: [] };
  }
  const rows = data ?? [];
  let received = 0;
  let total = 0;
  const missing: string[] = [];
  for (const row of rows) {
    const qty = Math.max(0, Number(row.qty) || 0);
    const got = Math.max(0, Number(row.received_qty) || 0);
    total += qty;
    received += Math.min(got, qty);
    if (got < qty && row.status !== "cancelled") {
      const label = String(row.item_number || row.job_name || row.cust_ref || "Item").trim();
      const short = qty - got;
      missing.push(short > 1 ? `${label} ×${short}` : label);
    }
  }
  const open = Math.max(0, total - received);
  const ready = open === 0;
  const message = ready
    ? total > 0
      ? `Truck is in — ${received}/${total} pieces received.`
      : null
    : `Scheduled tentatively · ${received}/${total} received. Confirm when the truck is in, or push the date.`;
  return { ready, received_qty: received, total_qty: total, open_qty: open, message, missing: missing.slice(0, 8) };
}

export async function applyJobTierFromLines(input: {
  jobId: string;
  lines: ClassifiableLine[];
  force?: boolean;
}): Promise<{ tier: ProjectTier; reasons: TierReason[] } | null> {
  const classified = classifyProjectLines(input.lines);
  const supabase = getSupabaseAdmin();
  const { data: job, error } = await supabase
    .from("ic_jobs")
    .select("tier_override")
    .eq("id", input.jobId)
    .maybeSingle();
  if (error && SPINE_ERROR.test(error.message)) return classified;
  if (!input.force && job?.tier_override) return classified;
  const now = new Date().toISOString();
  const write = await supabase
    .from("ic_jobs")
    .update({
      project_tier: classified.tier,
      tier_reasons: classified.reasons,
      updated_at: now,
    })
    .eq("id", input.jobId);
  if (write.error && SPINE_ERROR.test(write.error.message)) return classified;
  return classified;
}

export async function refreshReceivingStamps(jobId: string) {
  const hint = await receivingReadiness(jobId);
  if (hint.received_qty > 0) await stampJobFirst(jobId, "first_received_at");
  if (hint.ready && hint.total_qty > 0) {
    await stampJobFirst(jobId, "fully_received_at");
    const supabase = getSupabaseAdmin();
    const { data: job } = await supabase
      .from("ic_jobs")
      .select("install_date, install_confidence")
      .eq("id", jobId)
      .maybeSingle();
    if (job?.install_date && job.install_confidence !== "confirmed") {
      await updateJobCompat(jobId, { install_confidence: "confirmed" });
    }
    await dismissNotifications(jobId, (kind) => kind.startsWith("readiness_"));
  }
  return hint;
}

export function receivingWarningPayload(hint: ReceivingHint) {
  if (hint.ready) return null;
  return {
    ready: false,
    received_qty: hint.received_qty,
    total_qty: hint.total_qty,
    open_qty: hint.open_qty,
    message: hint.message,
    missing: hint.missing,
  };
}

export type DecoratedSchedule = {
  suggested_window: SuggestedWindow | null;
  install_confidence: "tentative" | "confirmed";
  project_tier: ProjectTier;
  window_early: boolean;
};

export function decorateScheduleFields(job: Record<string, unknown>): DecoratedSchedule {
  const tier = isProjectTier(job.project_tier) ? job.project_tier : "unknown";
  const window = suggestedInstallWindow({
    project_tier: tier,
    sold_date: typeof job.sold_date === "string" ? job.sold_date : null,
    ordered_at: typeof job.ordered_at === "string" ? job.ordered_at : null,
  });
  const installDate = typeof job.install_date === "string" ? job.install_date : null;
  const confidence = job.install_confidence === "confirmed" ? "confirmed" : "tentative";
  return {
    suggested_window: window,
    install_confidence: installDate ? confidence : "tentative",
    project_tier: tier,
    window_early: Boolean(window && installDate && installDate < window.earliest),
  };
}

export async function attachReceivingToJobs<T extends { id: string }>(jobs: T[]) {
  const rollup = await receivingRollupByJobIds(jobs.map((job) => job.id));
  return jobs.map((job) => {
    const receiving = rollup.get(job.id);
    const schedule = decorateScheduleFields(job as unknown as Record<string, unknown>);
    return {
      ...job,
      ...schedule,
      receiving_open_qty: receiving?.open_qty ?? 0,
      receiving_received_qty: receiving?.received_qty ?? 0,
      receiving_total_qty: receiving?.total_qty ?? 0,
    };
  });
}

export async function insertNotification(input: {
  jobId: string;
  kind: string;
  title: string;
  body?: string | null;
  severity?: string;
  thresholdDays?: number | null;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("ic_notifications").insert({
    job_id: input.jobId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    severity: input.severity ?? "info",
    threshold_days: input.thresholdDays ?? null,
  });
  if (error && (SPINE_ERROR.test(error.message) || /duplicate|unique/i.test(error.message))) return;
}

export async function dismissNotifications(jobId: string, match: (kind: string) => boolean) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_notifications")
    .select("id, kind")
    .eq("job_id", jobId)
    .is("dismissed_at", null);
  if (error) return;
  const ids = (data ?? []).filter((row) => match(String(row.kind))).map((row) => row.id);
  if (ids.length === 0) return;
  await supabase
    .from("ic_notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .in("id", ids);
}
