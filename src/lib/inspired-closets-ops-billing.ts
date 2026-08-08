/**
 * Billing ledger helpers — 50% deposit / 40% install-day / 10% completion.
 * Podium remains the payment rail; the app owns owed/paid state.
 */
import { getSupabaseAdmin } from "@/db/client";
import type { IcPaymentMilestone, IcPaymentMethod, IcPaymentStatus } from "@/db/ops-schema";

export const PAYMENT_MILESTONES: {
  id: IcPaymentMilestone;
  label: string;
  pct: number;
}[] = [
  { id: "deposit_50", label: "50% deposit", pct: 50 },
  { id: "install_40", label: "40% install day", pct: 40 },
  { id: "completion_10", label: "10% completion", pct: 10 },
];

export type PaymentRow = {
  id: string;
  job_id: string;
  milestone: IcPaymentMilestone;
  amount_due_cents: number;
  amount_paid_cents: number;
  status: IcPaymentStatus;
  method: IcPaymentMethod | null;
  podium_ref: string | null;
  check_ref: string | null;
  due_at: string | null;
  paid_at: string | null;
  link_sent_at: string | null;
  last_reminder_at: string | null;
  reminder_level: number;
  notes: string | null;
};

function splitContract(contractCents: number): Record<IcPaymentMilestone, number> {
  const deposit = Math.round(contractCents * 0.5);
  const install = Math.round(contractCents * 0.4);
  const completion = Math.max(0, contractCents - deposit - install);
  return {
    deposit_50: deposit,
    install_40: install,
    completion_10: completion,
  };
}

export function paymentStatusFromAmounts(
  due: number,
  paid: number,
): IcPaymentStatus {
  if (paid <= 0) return "pending";
  if (paid >= due && due > 0) return "paid";
  if (paid >= due && due === 0 && paid > 0) return "paid";
  return "partial";
}

export function overdueDays(dueAt: string | null, now = Date.now()): number | null {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return null;
  const diff = now - due;
  if (diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

/** Reminder bucket: 0 ok, 2 friendly, 5 follow-up, 7 internal alert. */
export function reminderBucket(daysOverdue: number | null): "ok" | "d2" | "d5" | "d7" | null {
  if (daysOverdue == null || daysOverdue <= 0) return null;
  if (daysOverdue >= 7) return "d7";
  if (daysOverdue >= 5) return "d5";
  if (daysOverdue >= 2) return "d2";
  return "ok";
}

export async function ensurePaymentMilestones(
  jobId: string,
  contractCents: number,
  options?: { dueDepositNow?: boolean },
): Promise<PaymentRow[]> {
  const supabase = getSupabaseAdmin();
  const amounts = splitContract(contractCents);
  const { data: existing } = await supabase
    .from("ic_payments")
    .select("*")
    .eq("job_id", jobId);

  const byMilestone = new Map(
    ((existing ?? []) as PaymentRow[]).map((row) => [row.milestone, row]),
  );
  const nowIso = new Date().toISOString();

  for (const milestone of PAYMENT_MILESTONES) {
    const current = byMilestone.get(milestone.id);
    if (current) {
      // Refresh due amounts only if still unpaid / zero paid.
      if (current.amount_paid_cents === 0 && current.amount_due_cents !== amounts[milestone.id]) {
        const { data: updated } = await supabase
          .from("ic_payments")
          .update({
            amount_due_cents: amounts[milestone.id],
            updated_at: nowIso,
          })
          .eq("id", current.id)
          .select("*")
          .single();
        if (updated) byMilestone.set(milestone.id, updated as PaymentRow);
      }
      continue;
    }

    const dueAt =
      milestone.id === "deposit_50" && options?.dueDepositNow !== false ? nowIso : null;

    const { data: created, error } = await supabase
      .from("ic_payments")
      .insert({
        job_id: jobId,
        milestone: milestone.id,
        amount_due_cents: amounts[milestone.id],
        amount_paid_cents: 0,
        status: "pending",
        due_at: dueAt,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    byMilestone.set(milestone.id, created as PaymentRow);
  }

  // Keep job deposit_cents aligned with 50% row.
  await supabase
    .from("ic_jobs")
    .update({
      deposit_cents: amounts.deposit_50,
      updated_at: nowIso,
    })
    .eq("id", jobId);

  await syncJobCollected(jobId);
  return PAYMENT_MILESTONES.map((m) => byMilestone.get(m.id)!).filter(Boolean);
}

export async function syncJobCollected(jobId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data: payments } = await supabase
    .from("ic_payments")
    .select("amount_paid_cents, status, milestone")
    .eq("job_id", jobId);

  const rows = (payments ?? []) as Pick<
    PaymentRow,
    "amount_paid_cents" | "status" | "milestone"
  >[];
  const collected = rows.reduce((sum, row) => sum + (row.amount_paid_cents ?? 0), 0);
  const allPaid =
    PAYMENT_MILESTONES.every((m) => {
      const row = rows.find((r) => r.milestone === m.id);
      return row?.status === "paid";
    });

  const depositPaid = rows.some(
    (r) => r.milestone === "deposit_50" && r.status === "paid",
  );

  const { data: job } = await supabase
    .from("ic_jobs")
    .select("stage, contract_cents")
    .eq("id", jobId)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    collected_cents: collected,
    updated_at: new Date().toISOString(),
  };

  if (job) {
    const stage = job.stage as string;
    if (allPaid && stage !== "cancelled") {
      updates.stage = "closed";
    } else if (
      depositPaid &&
      (stage === "quoted" || stage === "deposit_pending" || stage === "lead" || stage === "consultation")
    ) {
      updates.stage = "deposit_received";
    }
  }

  await supabase.from("ic_jobs").update(updates).eq("id", jobId);
  return collected;
}

export async function markInstallFortyDue(
  jobId: string,
  dueAt?: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const due = dueAt ?? new Date().toISOString();
  const { data: row } = await supabase
    .from("ic_payments")
    .select("*")
    .eq("job_id", jobId)
    .eq("milestone", "install_40")
    .maybeSingle();

  if (!row) {
    const { data: job } = await supabase
      .from("ic_jobs")
      .select("contract_cents")
      .eq("id", jobId)
      .maybeSingle();
    if (job) await ensurePaymentMilestones(jobId, job.contract_cents ?? 0);
  }

  await supabase
    .from("ic_payments")
    .update({
      due_at: due,
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .eq("milestone", "install_40")
    .neq("status", "paid");
}

export async function markCompletionTenDue(jobId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: job } = await supabase
    .from("ic_jobs")
    .select("contract_cents, stage")
    .eq("id", jobId)
    .maybeSingle();

  if (job) {
    await ensurePaymentMilestones(jobId, job.contract_cents ?? 0);
  }

  await supabase
    .from("ic_payments")
    .update({
      due_at: nowIso,
      updated_at: nowIso,
    })
    .eq("job_id", jobId)
    .eq("milestone", "completion_10")
    .neq("status", "paid");

  // Advance to final_payment so Des's billing queue lights up.
  if (job && job.stage !== "closed" && job.stage !== "cancelled") {
    await supabase
      .from("ic_jobs")
      .update({ stage: "final_payment", updated_at: nowIso })
      .eq("id", jobId);
  }
}

export async function isDepositPaid(jobId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ic_payments")
    .select("status, amount_paid_cents, amount_due_cents")
    .eq("job_id", jobId)
    .eq("milestone", "deposit_50")
    .maybeSingle();
  if (!data) return false;
  return data.status === "paid" || data.amount_paid_cents >= data.amount_due_cents;
}

export async function recordPaymentAmount(input: {
  paymentId: string;
  amountPaidCents: number;
  method?: IcPaymentMethod | null;
  podiumRef?: string | null;
  checkRef?: string | null;
  notes?: string | null;
  actorId?: string | null;
}): Promise<PaymentRow> {
  const supabase = getSupabaseAdmin();
  const { data: current, error: findError } = await supabase
    .from("ic_payments")
    .select("*")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!current) throw new Error("Payment not found.");

  const paid = Math.max(0, input.amountPaidCents);
  const status = paymentStatusFromAmounts(current.amount_due_cents, paid);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("ic_payments")
    .update({
      amount_paid_cents: paid,
      status,
      method: input.method ?? current.method,
      podium_ref: input.podiumRef ?? current.podium_ref,
      check_ref: input.checkRef ?? current.check_ref,
      notes: input.notes ?? current.notes,
      paid_at: status === "paid" ? nowIso : paid > 0 ? nowIso : null,
      updated_at: nowIso,
      updated_by: input.actorId ?? null,
    })
    .eq("id", input.paymentId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await syncJobCollected(current.job_id);

  await supabase.from("ic_activity_log").insert({
    entity_type: "payment",
    entity_id: input.paymentId,
    action: "payment_recorded",
    actor_id: input.actorId ?? null,
    changes: {
      amount_paid_cents: paid,
      status,
      milestone: current.milestone,
    },
  });

  return data as PaymentRow;
}
