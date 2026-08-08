import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  PAYMENT_MILESTONES,
  ensurePaymentMilestones,
  overdueDays,
  recordPaymentAmount,
  reminderBucket,
  type PaymentRow,
} from "@/lib/inspired-closets-ops-billing";
import type { IcPaymentMethod } from "@/db/ops-schema";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

const METHODS = new Set(["podium", "check", "card", "other"]);

async function actorId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket"); // deposit | install40 | final10 | overdue | paid | all
  const jobId = searchParams.get("jobId");

  const supabase = getSupabaseAdmin();

  let paymentsQuery = supabase
    .from("ic_payments")
    .select("*")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(3000);
  if (jobId) paymentsQuery = paymentsQuery.eq("job_id", jobId);

  const [paymentsResult, jobsResult, clientsResult] = await Promise.all([
    paymentsQuery,
    supabase
      .from("ic_jobs")
      .select("*")
      .is("deleted_at", null)
      .order("sold_date", { ascending: false, nullsFirst: false })
      .limit(2000),
    supabase.from("ic_clients").select("id, name, phone, email").is("deleted_at", null),
  ]);

  if (paymentsResult.error) {
    return NextResponse.json({ ok: false, error: paymentsResult.error.message }, { status: 500 });
  }
  if (jobsResult.error) {
    return NextResponse.json({ ok: false, error: jobsResult.error.message }, { status: 500 });
  }

  const clientsById = new Map((clientsResult.data ?? []).map((c) => [c.id, c]));
  const paymentsByJob = new Map<string, PaymentRow[]>();
  for (const row of (paymentsResult.data ?? []) as PaymentRow[]) {
    const list = paymentsByJob.get(row.job_id) ?? [];
    list.push(row);
    paymentsByJob.set(row.job_id, list);
  }

  const now = Date.now();
  const jobs = (jobsResult.data ?? [])
    .map((job) => {
      const payments = paymentsByJob.get(job.id) ?? [];
      const owed = payments.reduce(
        (sum, p) => sum + Math.max(0, (p.amount_due_cents ?? 0) - (p.amount_paid_cents ?? 0)),
        0,
      );
      const deposit = payments.find((p) => p.milestone === "deposit_50") ?? null;
      const install40 = payments.find((p) => p.milestone === "install_40") ?? null;
      const completion = payments.find((p) => p.milestone === "completion_10") ?? null;

      const openPayments = payments.filter((p) => p.status !== "paid" && p.status !== "void");
      const overdueOpen = openPayments
        .map((p) => ({ payment: p, days: overdueDays(p.due_at, now) }))
        .filter((x) => x.days != null && x.days >= 2);

      let primaryBucket: string = "none";
      if (payments.length > 0 && openPayments.length === 0) primaryBucket = "paid";
      else if (completion && completion.status !== "paid" && completion.due_at) {
        primaryBucket = "final10";
      } else if (install40 && install40.status !== "paid" && install40.due_at) {
        primaryBucket = "install40";
      } else if (deposit && deposit.status !== "paid") primaryBucket = "deposit";
      else if (openPayments.length > 0) primaryBucket = "open";

      const worstOverdue = overdueOpen.reduce(
        (max, x) => Math.max(max, x.days ?? 0),
        0,
      );

      return {
        ...job,
        client: job.client_id ? clientsById.get(job.client_id) ?? null : null,
        payments,
        owed_cents: owed,
        bucket: primaryBucket,
        overdue_days: worstOverdue || null,
        reminder_bucket: reminderBucket(worstOverdue || null),
      };
    })
    .filter((job) => {
      if (!bucket || bucket === "all") return job.payments.length > 0 || job.contract_cents > 0;
      if (bucket === "overdue") return Boolean(job.overdue_days && job.overdue_days >= 2);
      if (bucket === "paid") return job.bucket === "paid";
      if (bucket === "deposit") return job.bucket === "deposit";
      if (bucket === "install40") return job.bucket === "install40";
      if (bucket === "final10") return job.bucket === "final10";
      return true;
    });

  const summary = {
    awaitingDeposit: jobs.filter((j) => j.bucket === "deposit").length,
    install40Due: jobs.filter((j) => j.bucket === "install40").length,
    final10Due: jobs.filter((j) => j.bucket === "final10").length,
    overdue: jobs.filter((j) => j.overdue_days && j.overdue_days >= 2).length,
    paid: jobs.filter((j) => j.bucket === "paid").length,
  };

  return NextResponse.json({
    ok: true,
    milestones: PAYMENT_MILESTONES,
    summary,
    jobs,
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "ensure";
  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "job_id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: job, error } = await supabase
    .from("ic_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  }

  if (action === "ensure") {
    try {
      const payments = await ensurePaymentMilestones(jobId, job.contract_cents ?? 0);
      return NextResponse.json({ ok: true, payments });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "Failed to ensure milestones." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}

export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const paymentId = typeof body.id === "string" ? body.id : null;
  const action = typeof body.action === "string" ? body.action : "record";
  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const actor = await actorId();
  const nowIso = new Date().toISOString();

  if (action === "link_sent") {
    const { data, error } = await supabase
      .from("ic_payments")
      .update({
        link_sent_at: nowIso,
        updated_at: nowIso,
        updated_by: actor,
      })
      .eq("id", paymentId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, payment: data });
  }

  if (action === "remind") {
    const { data: current } = await supabase
      .from("ic_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }
    const days = overdueDays(current.due_at) ?? 0;
    let level = current.reminder_level ?? 0;
    if (days >= 7) level = Math.max(level, 3);
    else if (days >= 5) level = Math.max(level, 2);
    else if (days >= 2) level = Math.max(level, 1);
    else level = Math.max(level, 1);

    const { data, error } = await supabase
      .from("ic_payments")
      .update({
        last_reminder_at: nowIso,
        reminder_level: level,
        updated_at: nowIso,
        updated_by: actor,
      })
      .eq("id", paymentId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, payment: data });
  }

  // record payment
  const amountPaidCents =
    typeof body.amount_paid_cents === "number"
      ? Math.max(0, Math.round(body.amount_paid_cents))
      : typeof body.amount === "string"
        ? Math.max(0, Math.round(Number(body.amount.replace(/[$,\s]/g, "")) * 100))
        : null;
  if (amountPaidCents == null || Number.isNaN(amountPaidCents)) {
    return NextResponse.json(
      { ok: false, error: "amount_paid_cents or amount is required." },
      { status: 400 },
    );
  }

  const method =
    typeof body.method === "string" && METHODS.has(body.method)
      ? (body.method as IcPaymentMethod)
      : null;

  try {
    const payment = await recordPaymentAmount({
      paymentId,
      amountPaidCents,
      method,
      podiumRef: typeof body.podium_ref === "string" ? body.podium_ref : null,
      checkRef: typeof body.check_ref === "string" ? body.check_ref : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      actorId: actor,
    });
    return NextResponse.json({ ok: true, payment });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to record payment." },
      { status: 500 },
    );
  }
}
