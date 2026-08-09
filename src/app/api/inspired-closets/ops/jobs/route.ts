import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { JOB_STAGES, type IcJobStage } from "@/lib/inspired-closets-ops-jobs";
import {
  ensurePaymentMilestones,
  markInstallFortyDue,
} from "@/lib/inspired-closets-ops-billing";

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
  "notes",
  "risk_flag",
  "lead_id",
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

  const [jobsResult, staffResult, clientsResult] = await Promise.all([
    jobsQuery,
    supabase
      .from("ic_staff")
      .select("id, name, role, workbook_tab, active")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("ic_clients")
      .select("id, name, phone, email, address")
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
  if (clientsResult.error) {
    return NextResponse.json({ ok: false, error: clientsResult.error.message }, { status: 500 });
  }

  const staffById = new Map((staffResult.data ?? []).map((member) => [member.id, member]));
  const clientsById = new Map((clientsResult.data ?? []).map((client) => [client.id, client]));
  const jobs = (jobsResult.data ?? []).map((job) => ({
    ...job,
    client: job.client_id ? clientsById.get(job.client_id) ?? null : null,
    designer: job.designer_id ? staffById.get(job.designer_id) ?? null : null,
  }));

  return NextResponse.json({
    ok: true,
    stages: JOB_STAGES,
    jobs,
    staff: staffResult.data ?? [],
    clients: clientsResult.data ?? [],
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

  if (!resolvedClientId) {
    if (!clientName) {
      return NextResponse.json(
        { ok: false, error: "client_id or client_name is required." },
        { status: 400 },
      );
    }
    const { data: createdClient, error: clientError } = await supabase
      .from("ic_clients")
      .insert({ name: clientName })
      .select("id")
      .single();
    if (clientError) {
      return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
    }
    resolvedClientId = createdClient.id;
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
