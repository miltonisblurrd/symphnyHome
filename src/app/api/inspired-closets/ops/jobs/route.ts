import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { JOB_STAGES, isJobKind, type IcJobStage } from "@/lib/inspired-closets-ops-jobs";
import {
  ensurePaymentMilestones,
  markInstallFortyDue,
} from "@/lib/inspired-closets-ops-billing";
import { installBlockedByReceiving, receivingRollupByJobIds } from "@/lib/inspired-closets-ops-receiving";
import {
  jobDescriptorFromName,
  listPendingMergeCandidates,
  resolveClient,
} from "@/lib/inspired-closets-ops-clients";

export const runtime = "nodejs";

const EDITABLE = new Set([
  "client_id",
  "designer_id",
  "installer_id",
  "stage",
  "contract_cents",
  "deposit_cents",
  "collected_cents",
  "sold_date",
  "install_date",
  "completed_date",
  "community_ref",
  "studio_ref",
  "receive_date",
  "job_check_owner_id",
  "tentative_install_notes",
  "site_ready_notes",
  "deposit_intake_status",
  "crew_size",
  "estimated_install_days",
  "job_kind",
  "visit_window",
  "notes",
  "risk_flag",
  "lead_id",
  "account_id",
]);

const VALID_STAGES = new Set(JOB_STAGES.map((stage) => stage.id));

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage");
  const designerId = searchParams.get("designerId");

  const supabase = getSupabaseAdmin();

  let jobsQuery = supabase
    .from("ic_jobs")
    .select("*")
    .is("deleted_at", null)
    .order("sold_date", { ascending: false, nullsFirst: false })
    .limit(2000);

  if (stage && VALID_STAGES.has(stage as IcJobStage)) {
    jobsQuery = jobsQuery.eq("stage", stage);
  }
  if (designerId) {
    jobsQuery = jobsQuery.eq("designer_id", designerId);
  }

  const [jobsResult, staffResult, clientsWithMerge] = await Promise.all([
    jobsQuery,
    supabase
      .from("ic_staff")
      .select("id, name, role, workbook_tab, active")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("ic_clients")
      .select("id, name, phone, email, address, merged_into_client_id, identity_key")
      .is("deleted_at", null)
      .order("name")
      .limit(3000),
  ]);

  if (jobsResult.error) {
    return NextResponse.json({ ok: false, error: jobsResult.error.message }, { status: 500 });
  }
  if (staffResult.error) {
    return NextResponse.json({ ok: false, error: staffResult.error.message }, { status: 500 });
  }

  type ClientListRow = {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    merged_into_client_id?: string | null;
    identity_key?: string | null;
  };

  let clientRows: ClientListRow[] = (clientsWithMerge.data ?? []) as ClientListRow[];
  if (
    clientsWithMerge.error &&
    /merged_into_client_id|identity_key|schema cache|column/i.test(clientsWithMerge.error.message)
  ) {
    const fallback = await supabase
      .from("ic_clients")
      .select("id, name, phone, email, address")
      .is("deleted_at", null)
      .order("name")
      .limit(3000);
    if (fallback.error) {
      return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    }
    clientRows = (fallback.data ?? []) as ClientListRow[];
  } else if (clientsWithMerge.error) {
    return NextResponse.json({ ok: false, error: clientsWithMerge.error.message }, { status: 500 });
  }

  const staffById = new Map((staffResult.data ?? []).map((member) => [member.id, member]));
  const clientsById = new Map(
    clientRows.map((client) => {
      const mergedInto = client.merged_into_client_id ?? null;
      return [client.id, { ...client, canonical_id: mergedInto || client.id }];
    }),
  );
  // Resolve merged clients to their canonical row for display.
  for (const client of clientRows) {
    const mergedInto = client.merged_into_client_id ?? null;
    if (mergedInto && clientsById.has(mergedInto)) {
      clientsById.set(client.id, {
        ...clientsById.get(mergedInto)!,
        canonical_id: mergedInto,
      });
    }
  }

  const visible = (jobsResult.data ?? []).filter(
    (job) =>
      job.community_ref !== "FIELD-TEST" &&
      !(job as { duplicate_of_job_id?: string | null }).duplicate_of_job_id,
  );
  const paymentFlags = new Map<string, { deposit_paid: boolean; completion_paid: boolean }>();
  const visibleIds = visible.map((job) => job.id as string);
  for (let index = 0; index < visibleIds.length; index += 150) {
    const slice = visibleIds.slice(index, index + 150);
    if (slice.length === 0) continue;
    const { data: payments } = await supabase
      .from("ic_payments")
      .select("job_id, milestone, status")
      .in("job_id", slice);
    for (const row of payments ?? []) {
      const current = paymentFlags.get(row.job_id) ?? { deposit_paid: false, completion_paid: false };
      if (row.milestone === "deposit_50" && row.status === "paid") current.deposit_paid = true;
      if (row.milestone === "completion_10" && row.status === "paid") current.completion_paid = true;
      paymentFlags.set(row.job_id, current);
    }
  }
  const [receivingByJob, mergeCandidates] = await Promise.all([
    receivingRollupByJobIds(visible.map((job) => job.id)),
    listPendingMergeCandidates().catch(() => []),
  ]);
  const mergeByClientId = new Map<
    string,
    { id: string; reason: string; suggested_name: string | null }
  >();
  for (const candidate of mergeCandidates) {
    const live = candidate.clients.filter((client) => client.id);
    for (const client of live) {
      const suggested = live.find((other) => other.id !== client.id);
      mergeByClientId.set(client.id, {
        id: candidate.id,
        reason: candidate.reason,
        suggested_name: suggested?.name ?? null,
      });
    }
  }

  // Count sibling jobs per canonical client for the list marker.
  const siblingCount = new Map<string, number>();
  for (const job of visible) {
    const client = job.client_id ? clientsById.get(job.client_id) : null;
    const key = client?.canonical_id ?? job.client_id ?? job.id;
    siblingCount.set(key, (siblingCount.get(key) ?? 0) + 1);
  }

  const jobs = visible.map((job) => {
    const receiving = receivingByJob.get(job.id);
    const paid = paymentFlags.get(job.id);
    const client = job.client_id ? clientsById.get(job.client_id) ?? null : null;
    const canonicalId = client?.canonical_id ?? job.client_id ?? null;
    const mergeReview = job.client_id
      ? mergeByClientId.get(job.client_id) ?? (canonicalId ? mergeByClientId.get(canonicalId) : null)
      : null;
    return {
      ...job,
      client: client
        ? {
            id: client.id,
            name: client.name,
            phone: client.phone,
            email: client.email,
            address: client.address,
            canonical_id: canonicalId,
          }
        : null,
      client_job_count: canonicalId ? siblingCount.get(canonicalId) ?? 1 : 1,
      merge_review: mergeReview
        ? {
            candidate_id: mergeReview.id,
            reason: mergeReview.reason,
            suggested_name: mergeReview.suggested_name,
          }
        : null,
      designer: job.designer_id ? staffById.get(job.designer_id) ?? null : null,
      installer: job.installer_id ? staffById.get(job.installer_id) ?? null : null,
      receiving_open_qty: receiving?.open_qty ?? 0,
      receiving_received_qty: receiving?.received_qty ?? 0,
      receiving_total_qty: receiving?.total_qty ?? 0,
      deposit_paid: paid?.deposit_paid ?? false,
      completion_paid: paid?.completion_paid ?? false,
    };
  });

  return NextResponse.json({
    ok: true,
    stages: JOB_STAGES,
    jobs,
    staff: staffResult.data ?? [],
    clients: clientRows,
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

  const clientId = typeof body.client_id === "string" ? body.client_id : null;
  const clientName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const designerId = typeof body.designer_id === "string" ? body.designer_id : null;

  const supabase = getSupabaseAdmin();
  let resolvedClientId = clientId;
  let jobTitle: string | null =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;

  if (!resolvedClientId) {
    if (!clientName) {
      return NextResponse.json(
        { ok: false, error: "client_id or client_name is required." },
        { status: 400 },
      );
    }
    try {
      const resolved = await resolveClient({ name: clientName });
      resolvedClientId = resolved.clientId;
      if (!jobTitle) jobTitle = resolved.title;
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Could not resolve client." },
        { status: 500 },
      );
    }
  } else if (clientName && !jobTitle) {
    jobTitle = jobDescriptorFromName(clientName);
  }

  const insert: Record<string, unknown> = {
    client_id: resolvedClientId,
    designer_id: designerId,
    stage: typeof body.stage === "string" && VALID_STAGES.has(body.stage as IcJobStage)
      ? body.stage
      : "quoted",
    contract_cents: typeof body.contract_cents === "number" ? body.contract_cents : 0,
    deposit_cents: typeof body.deposit_cents === "number" ? body.deposit_cents : 0,
    collected_cents: typeof body.collected_cents === "number" ? body.collected_cents : 0,
    sold_date: typeof body.sold_date === "string" ? body.sold_date : null,
    install_date: typeof body.install_date === "string" ? body.install_date : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    title: jobTitle,
  };

  const actorId = typeof body.actor_id === "string" ? body.actor_id : null;
  if (actorId) {
    insert.created_by = actorId;
    insert.updated_by = actorId;
  }

  const { data, error } = await supabase.from("ic_jobs").insert(insert).select("*").single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if ((insert.contract_cents as number) > 0) {
    try {
      await ensurePaymentMilestones(data.id, insert.contract_cents as number);
    } catch {
      // Non-fatal — billing page can ensure later.
    }
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: data.id,
    action: "created",
    actor_id: actorId,
    actor_label: actorId ? null : "ops-app",
    changes: { client_id: resolvedClientId, stage: insert.stage },
  });

  return NextResponse.json({ ok: true, job: data });
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

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  if (typeof body.stage === "string" && !VALID_STAGES.has(body.stage as IcJobStage)) {
    return NextResponse.json({ ok: false, error: "Invalid stage." }, { status: 400 });
  }

  if (body.job_kind != null && !isJobKind(body.job_kind)) {
    return NextResponse.json(
      { ok: false, error: "job_kind must be new_install, go_back, or service." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: findError } = await supabase
    .from("ic_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  }

  if (
    typeof body.stage === "string" &&
    (body.stage === "install_scheduled" || body.stage === "install_in_progress") &&
    current.stage !== body.stage
  ) {
    const receiving = await installBlockedByReceiving(id);
    if (receiving.blocked) {
      return NextResponse.json({ ok: false, error: receiving.message }, { status: 409 });
    }
  }

  const update: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE.has(key)) continue;
    if (current[key] === value) continue;
    update[key] = value;
    changes[key] = { from: current[key], to: value };
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, job: current, unchanged: true });
  }

  const actorId = typeof body.actor_id === "string" ? body.actor_id : null;
  update.updated_at = new Date().toISOString();
  if (actorId) update.updated_by = actorId;

  const { data: updated, error: updateError } = await supabase
    .from("ic_jobs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) {
    if (/column|schema cache/i.test(updateError.message)) {
      const base = { ...update };
      delete base.crew_size;
      delete base.estimated_install_days;
      delete base.job_kind;
      delete base.visit_window;
      const retry = await supabase.from("ic_jobs").update(base).eq("id", id).select("*").single();
      if (retry.error) {
        return NextResponse.json({ ok: false, error: retry.error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        job: retry.data,
        hint: "Run drizzle/0014_ic_job_kind_credit.sql for job kind / visit window.",
      });
    }
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: id,
    action: changes.stage ? "status_changed" : "updated",
    actor_id: actorId,
    actor_label: actorId ? null : "ops-app",
    changes,
  });

  const nextStage = (updated.stage as string) ?? current.stage;
  if (
    nextStage === "install_scheduled" ||
    nextStage === "install_in_progress"
  ) {
    const due =
      updated.install_date != null
        ? `${updated.install_date}T12:00:00.000Z`
        : new Date().toISOString();
    try {
      await ensurePaymentMilestones(id, updated.contract_cents ?? 0);
      await markInstallFortyDue(id, due);
    } catch {
      // Billing ensure is best-effort on stage change.
    }
  }

  if (
    typeof update.contract_cents === "number" &&
    update.contract_cents > 0
  ) {
    try {
      await ensurePaymentMilestones(id, update.contract_cents);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, job: updated });
}
