import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  APPOINTMENT_KINDS,
  APPOINTMENT_LOCATIONS,
  APPOINTMENT_STATUSES,
  type IcAppointmentKind,
  type IcAppointmentLocation,
  type IcAppointmentStatus,
} from "@/lib/inspired-closets-ops-appointments";
import { isDepositPaid } from "@/lib/inspired-closets-ops-billing";
import {
  getGoogleCalendarStatus,
  pushAppointmentById,
} from "@/lib/inspired-closets-google-calendar";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

const VALID_KINDS = new Set(APPOINTMENT_KINDS.map((k) => k.id));
const VALID_LOCATIONS = new Set(APPOINTMENT_LOCATIONS.map((l) => l.id));
const VALID_STATUSES = new Set(APPOINTMENT_STATUSES.map((s) => s.id));

async function actorId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const designerId = searchParams.get("designerId");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_appointments")
    .select("*")
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(1000);

  if (from) query = query.gte("scheduled_at", from);
  if (to) query = query.lte("scheduled_at", to);
  if (designerId) query = query.eq("designer_id", designerId);

  const JOB_SELECT_FULL =
    "id, client_id, designer_id, installer_id, install_date, sold_date, stage, lead_id, contract_cents, notes, studio_ref, community_ref, receive_date, job_check_owner_id, tentative_install_notes, site_ready_notes, deposit_intake_status";
  const JOB_SELECT_BASE =
    "id, client_id, designer_id, installer_id, install_date, sold_date, stage, lead_id, contract_cents, notes, community_ref";

  async function loadJobs(select: string) {
    const [scheduled, ready, awaiting] = await Promise.all([
      supabase
        .from("ic_jobs")
        .select(select)
        .is("deleted_at", null)
        .not("install_date", "is", null)
        .limit(1000),
      supabase
        .from("ic_jobs")
        .select(select)
        .is("deleted_at", null)
        .is("install_date", null)
        .in("stage", ["deposit_received", "job_check", "ordered"])
        .order("sold_date", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("ic_jobs")
        .select(select)
        .is("deleted_at", null)
        .is("install_date", null)
        .eq("stage", "deposit_pending")
        .order("sold_date", { ascending: false, nullsFirst: false })
        .limit(100),
    ]);
    return { scheduled, ready, awaiting };
  }

  const [apptResult, staffResult, clientsResult, leadsResult] = await Promise.all([
    query,
    supabase
      .from("ic_staff")
      .select("id, name, role, active")
      .is("deleted_at", null)
      .eq("active", true)
      .order("name"),
    supabase.from("ic_clients").select("id, name, phone, address").is("deleted_at", null),
    supabase
      .from("ic_leads")
      .select("id, designer_id, stage, converted_job_id, source")
      .is("deleted_at", null)
      .limit(3000),
  ]);

  // Prefer full sold-intake columns; fall back if migration 0010 not applied yet
  // so the Install Calendar still loads.
  let jobsBundle = await loadJobs(JOB_SELECT_FULL);
  if (
    jobsBundle.scheduled.error ||
    jobsBundle.ready.error ||
    jobsBundle.awaiting.error
  ) {
    jobsBundle = await loadJobs(JOB_SELECT_BASE);
  }
  const jobsResult = jobsBundle.scheduled;
  const readyResult = jobsBundle.ready;
  const awaitingResult = jobsBundle.awaiting;

  if (apptResult.error) {
    return NextResponse.json({ ok: false, error: apptResult.error.message }, { status: 500 });
  }

  if (jobsResult.error) {
    return NextResponse.json({ ok: false, error: jobsResult.error.message }, { status: 500 });
  }

  const staffById = new Map((staffResult.data ?? []).map((s) => [s.id, s]));
  const clientsById = new Map((clientsResult.data ?? []).map((c) => [c.id, c]));

  const appointments = (apptResult.data ?? []).map((row) => ({
    ...row,
    client: row.client_id ? clientsById.get(row.client_id) ?? null : null,
    designer: row.designer_id ? staffById.get(row.designer_id) ?? null : null,
  }));

  // Closing ratio strip: assigned leads vs converted for designers.
  const designers = (staffResult.data ?? []).filter((s) => s.role === "designer");
  const closing = designers.map((designer) => {
    const assigned = (leadsResult.data ?? []).filter((l) => l.designer_id === designer.id);
    const converted = assigned.filter((l) => Boolean(l.converted_job_id));
    return {
      id: designer.id,
      name: designer.name,
      assigned: assigned.length,
      converted: converted.length,
      closingRatioPct:
        assigned.length === 0
          ? null
          : Math.round((converted.length / assigned.length) * 1000) / 10,
    };
  });

  function mapJob(job: Record<string, unknown>) {
    const notes = String(job.notes ?? "").toLowerCase();
    const serviceTag =
      /\b(svc|service)\b/.test(notes) || job.stage === "service"
        ? "SVC"
        : /\b(g\/?b|go[\s-]?back)\b/.test(notes)
          ? "G/B"
          : null;
    const clientId = job.client_id as string | null;
    const designerIdVal = job.designer_id as string | null;
    const installerIdVal = job.installer_id as string | null;
    const ownerId = job.job_check_owner_id as string | null;
    return {
      ...job,
      client: clientId ? clientsById.get(clientId) ?? null : null,
      designer: designerIdVal ? staffById.get(designerIdVal) ?? null : null,
      installer: installerIdVal ? staffById.get(installerIdVal) ?? null : null,
      jobCheckOwner: ownerId ? staffById.get(ownerId) ?? null : null,
      serviceTag,
    };
  }

  const installJobs = (jobsResult.data ?? [])
    .filter((job) => {
      if (designerId && job.designer_id !== designerId) return false;
      // Date-only bounds: from inclusive, to exclusive (weekStart + 7 days).
      if (from && job.install_date && job.install_date < from.slice(0, 10)) return false;
      if (to && job.install_date && job.install_date >= to.slice(0, 10)) return false;
      return true;
    })
    .map((job) => mapJob(job));

  const readyToSchedule = (readyResult.data ?? [])
    .filter((job) => !designerId || job.designer_id === designerId)
    .map((job) => mapJob(job));

  const awaitingDeposit = (awaitingResult.data ?? [])
    .filter((job) => !designerId || job.designer_id === designerId)
    .map((job) => mapJob(job));

  return NextResponse.json({
    ok: true,
    kinds: APPOINTMENT_KINDS,
    locations: APPOINTMENT_LOCATIONS,
    statuses: APPOINTMENT_STATUSES,
    appointments,
    installJobs,
    readyToSchedule,
    awaitingDeposit,
    closing,
    staff: staffResult.data ?? [],
    clients: clientsResult.data ?? [],
    googleCalendar: getGoogleCalendarStatus(),
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

  const scheduledAt = typeof body.scheduled_at === "string" ? body.scheduled_at : null;
  if (!scheduledAt) {
    return NextResponse.json({ ok: false, error: "scheduled_at is required." }, { status: 400 });
  }

  const kind =
    typeof body.kind === "string" && VALID_KINDS.has(body.kind as IcAppointmentKind)
      ? (body.kind as IcAppointmentKind)
      : "consultation";
  const locationType =
    typeof body.location_type === "string" &&
    VALID_LOCATIONS.has(body.location_type as IcAppointmentLocation)
      ? (body.location_type as IcAppointmentLocation)
      : "on_site";
  const leadId = typeof body.lead_id === "string" ? body.lead_id : null;
  const clientId = typeof body.client_id === "string" ? body.client_id : null;
  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  const designerId = typeof body.designer_id === "string" ? body.designer_id : null;
  const installerId = typeof body.installer_id === "string" ? body.installer_id : null;
  const notes = typeof body.notes === "string" ? body.notes : null;
  const communityRef = typeof body.community_ref === "string" ? body.community_ref : null;

  if (kind === "install") {
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "Install scheduling requires a sold job id." },
        { status: 400 },
      );
    }
    const paid = await isDepositPaid(jobId);
    if (!paid) {
      return NextResponse.json(
        {
          ok: false,
          error: "50% deposit must be received before scheduling install.",
        },
        { status: 409 },
      );
    }
  }

  const supabase = getSupabaseAdmin();
  const actor = await actorId();

  let resolvedClientId = clientId;
  if (!resolvedClientId && leadId) {
    const { data: lead } = await supabase
      .from("ic_leads")
      .select("client_id")
      .eq("id", leadId)
      .maybeSingle();
    resolvedClientId = lead?.client_id ?? null;
  }

  const { data, error } = await supabase
    .from("ic_appointments")
    .insert({
      lead_id: leadId,
      client_id: resolvedClientId,
      job_id: jobId,
      designer_id: designerId,
      kind,
      scheduled_at: scheduledAt,
      location_type: locationType,
      status: "scheduled",
      notes,
      community_ref: communityRef,
      created_by: actor,
      updated_by: actor,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (leadId && kind === "consultation") {
    await supabase
      .from("ic_leads")
      .update({
        stage: "appointment_set",
        designer_id: designerId,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      })
      .eq("id", leadId);
  }

  if (jobId && kind === "install") {
    const installDate = scheduledAt.slice(0, 10);
    await supabase
      .from("ic_jobs")
      .update({
        stage: "install_scheduled",
        install_date: installDate,
        installer_id: installerId,
        ...(designerId ? { designer_id: designerId } : {}),
        updated_at: new Date().toISOString(),
        updated_by: actor,
      })
      .eq("id", jobId);
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "appointment",
    entity_id: data.id,
    action: "created",
    actor_id: actor,
    changes: { kind, scheduled_at: scheduledAt },
  });

  const calendar = await pushAppointmentById(data.id);
  const { data: refreshed } = await supabase
    .from("ic_appointments")
    .select("*")
    .eq("id", data.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    appointment: refreshed ?? data,
    googleCalendar: calendar,
  });
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

  const supabase = getSupabaseAdmin();
  const actor = await actorId();
  const nowIso = new Date().toISOString();

  const { data: current, error: findError } = await supabase
    .from("ic_appointments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ ok: false, error: "Appointment not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: nowIso,
    updated_by: actor,
  };

  const action = typeof body.action === "string" ? body.action : "update";

  if (action === "confirm_podium") {
    updates.confirmation_sent_at = nowIso;
    updates.confirmation_note =
      typeof body.confirmation_note === "string"
        ? body.confirmation_note
        : "Logged Podium confirmation (manual)";
    updates.status = "confirmed";
  } else if (action === "reschedule") {
    const scheduledAt = typeof body.scheduled_at === "string" ? body.scheduled_at : null;
    const delayReason =
      typeof body.delay_reason === "string" ? body.delay_reason.trim() : "";
    if (!scheduledAt) {
      return NextResponse.json({ ok: false, error: "scheduled_at is required." }, { status: 400 });
    }
    if (!delayReason) {
      return NextResponse.json(
        { ok: false, error: "delay_reason is required when rescheduling." },
        { status: 400 },
      );
    }
    updates.scheduled_at = scheduledAt;
    updates.delay_reason = delayReason;
    updates.status = "rescheduled";
  } else {
    if (typeof body.scheduled_at === "string") updates.scheduled_at = body.scheduled_at;
    if (typeof body.kind === "string" && VALID_KINDS.has(body.kind as IcAppointmentKind)) {
      updates.kind = body.kind;
    }
    if (
      typeof body.location_type === "string" &&
      VALID_LOCATIONS.has(body.location_type as IcAppointmentLocation)
    ) {
      updates.location_type = body.location_type;
    }
    if (
      typeof body.status === "string" &&
      VALID_STATUSES.has(body.status as IcAppointmentStatus)
    ) {
      if (body.status === "rescheduled") {
        const delayReason =
          typeof body.delay_reason === "string" ? body.delay_reason.trim() : "";
        if (!delayReason && !current.delay_reason) {
          return NextResponse.json(
            { ok: false, error: "delay_reason is required when rescheduling." },
            { status: 400 },
          );
        }
      }
      updates.status = body.status;
    }
    if (typeof body.designer_id === "string" || body.designer_id === null) {
      updates.designer_id = body.designer_id;
    }
    if (typeof body.delay_reason === "string") updates.delay_reason = body.delay_reason;
    if (typeof body.notes === "string" || body.notes === null) updates.notes = body.notes;
    if (typeof body.community_ref === "string" || body.community_ref === null) {
      updates.community_ref = body.community_ref;
    }
    if (body.confirmation_sent === true) {
      updates.confirmation_sent_at = nowIso;
      updates.confirmation_note =
        typeof body.confirmation_note === "string"
          ? body.confirmation_note
          : "Logged Podium confirmation (manual)";
    }
  }

  const { data, error } = await supabase
    .from("ic_appointments")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "appointment",
    entity_id: id,
    action: action === "update" ? "updated" : action,
    actor_id: actor,
    changes: updates,
  });

  const calendar = await pushAppointmentById(id);
  const { data: refreshed } = await supabase
    .from("ic_appointments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    appointment: refreshed ?? data,
    googleCalendar: calendar,
  });
}
