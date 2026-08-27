import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  APPOINTMENT_KINDS,
  APPOINTMENT_LOCATIONS,
  APPOINTMENT_STATUSES,
  CONSULT_OUTCOMES,
  type IcAppointmentKind,
  type IcAppointmentLocation,
  type IcAppointmentStatus,
  type IcConsultOutcome,
} from "@/lib/inspired-closets-ops-appointments";
import { isDepositPaid } from "@/lib/inspired-closets-ops-billing";
import { installBlockedByReceiving } from "@/lib/inspired-closets-ops-receiving";
import {
  getGoogleCalendarStatus,
  pushAppointmentById,
} from "@/lib/inspired-closets-google-calendar";
import { IC_STAFF_ID_COOKIE, IC_STAFF_NAME_COOKIE } from "@/lib/inspired-closets-ops-field";
import { notifyConsultComplete } from "@/lib/inspired-closets-ops-handoffs";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";
import { isJobKind, jobKindTag, resolveJobKind } from "@/lib/inspired-closets-ops-jobs";

export const runtime = "nodejs";

const VALID_KINDS = new Set(APPOINTMENT_KINDS.map((k) => k.id));
const VALID_LOCATIONS = new Set(APPOINTMENT_LOCATIONS.map((l) => l.id));
const VALID_STATUSES = new Set(APPOINTMENT_STATUSES.map((s) => s.id));
const CONSULT_OUTCOME_LABEL: Record<IcConsultOutcome, string> = {
  quote_sent: "Quote sent",
  follow_up: "Needs follow-up",
  no_sale: "No sale",
};

function isConsultOutcome(value: string): value is IcConsultOutcome {
  return CONSULT_OUTCOMES.some((item) => item.id === value);
}

async function actorId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

async function actorName(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IC_STAFF_NAME_COOKIE)?.value ?? null;
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

  const [apptResult, staffResult, clientsResult, leadsResult, jobsResult, readyResult, awaitingResult] =
    await Promise.all([
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
      // select('*') stays compatible before/after migration 0010
      supabase
        .from("ic_jobs")
        .select("*")
        .is("deleted_at", null)
        .not("install_date", "is", null)
        .limit(1000),
      supabase
        .from("ic_jobs")
        .select("*")
        .is("deleted_at", null)
        .is("install_date", null)
        .in("stage", ["deposit_received", "job_check", "ordered"])
        .order("sold_date", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("ic_jobs")
        .select("*")
        .is("deleted_at", null)
        .is("install_date", null)
        .eq("stage", "deposit_pending")
        .order("sold_date", { ascending: false, nullsFirst: false })
        .limit(100),
    ]);

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

  const readyIds = (readyResult.data ?? []).map((j) => j.id);
  const installIds = (jobsResult.data ?? []).map((j) => j.id);
  const materialJobIds = [...new Set([...readyIds, ...installIds])];
  const materialsByJob = new Map<string, number>();
  if (materialJobIds.length > 0) {
    const { data: stockMoves } = await supabase
      .from("ic_stock_movements")
      .select("job_id, movement_type, qty, unit_cost_cents")
      .in("job_id", materialJobIds.slice(0, 400))
      .in("movement_type", ["allocate", "return"]);
    for (const m of stockMoves ?? []) {
      if (!m.job_id) continue;
      const unit = m.unit_cost_cents ?? 0;
      const qty = Math.abs(m.qty ?? 0);
      const delta = m.movement_type === "allocate" ? qty * unit : -(qty * unit);
      materialsByJob.set(m.job_id, (materialsByJob.get(m.job_id) ?? 0) + delta);
    }
  }

  function mapJob(job: Record<string, unknown>) {
    const kind = resolveJobKind(job);
    const clientId = job.client_id as string | null;
    const designerIdVal = job.designer_id as string | null;
    const installerIdVal = job.installer_id as string | null;
    const ownerId = job.job_check_owner_id as string | null;
    const jobId = job.id as string;
    return {
      ...job,
      job_kind: kind,
      visit_window: (job.visit_window as string | null) ?? null,
      materials_cents: Math.max(0, materialsByJob.get(jobId) ?? 0),
      client: clientId ? clientsById.get(clientId) ?? null : null,
      designer: designerIdVal ? staffById.get(designerIdVal) ?? null : null,
      installer: installerIdVal ? staffById.get(installerIdVal) ?? null : null,
      jobCheckOwner: ownerId ? staffById.get(ownerId) ?? null : null,
      serviceTag: jobKindTag(kind),
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
    .map((job) => mapJob(job as Record<string, unknown>));

  const readyToSchedule = (readyResult.data ?? [])
    .filter((job) => !designerId || job.designer_id === designerId)
    .map((job) => mapJob(job as Record<string, unknown>));

  const awaitingDeposit = (awaitingResult.data ?? [])
    .filter((job) => !designerId || job.designer_id === designerId)
    .map((job) => mapJob(job as Record<string, unknown>));

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
  const jobKind = isJobKind(body.job_kind) ? body.job_kind : null;
  const visitWindow =
    typeof body.visit_window === "string" && body.visit_window.trim()
      ? body.visit_window.trim()
      : null;

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
    const receiving = await installBlockedByReceiving(jobId);
    if (receiving.blocked) {
      return NextResponse.json({ ok: false, error: receiving.message }, { status: 409 });
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
    const jobUpdate: Record<string, unknown> = {
      stage: "install_scheduled",
      install_date: installDate,
      installer_id: installerId,
      updated_at: new Date().toISOString(),
      updated_by: actor,
    };
    if (designerId) jobUpdate.designer_id = designerId;
    if (jobKind) jobUpdate.job_kind = jobKind;
    if (visitWindow !== null) jobUpdate.visit_window = visitWindow;
    const jobWrite = await supabase.from("ic_jobs").update(jobUpdate).eq("id", jobId);
    if (jobWrite.error && /job_kind|visit_window|column|schema cache/i.test(jobWrite.error.message)) {
      delete jobUpdate.job_kind;
      delete jobUpdate.visit_window;
      await supabase.from("ic_jobs").update(jobUpdate).eq("id", jobId);
    }

    const [{ data: jobRow }, { data: installerRow }] = await Promise.all([
      supabase
        .from("ic_jobs")
        .select("contract_cents, client_id")
        .eq("id", jobId)
        .maybeSingle(),
      installerId
        ? supabase.from("ic_staff").select("name").eq("id", installerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    let clientName = "Client";
    const clientLookupId = resolvedClientId ?? jobRow?.client_id ?? null;
    if (clientLookupId) {
      const { data: client } = await supabase
        .from("ic_clients")
        .select("name")
        .eq("id", clientLookupId)
        .maybeSingle();
      if (client?.name) clientName = client.name;
    }
    const dollars = ((jobRow?.contract_cents ?? 0) / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    const whenLabel = new Date(scheduledAt).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    try {
      await postInspiredClosetsSlackNotification({
        assignee: "Des",
        title: `Install scheduled — ${clientName}`,
        severity: "info",
        todoLabel: `${whenLabel} · ${dollars} · ${installerRow?.name ?? "Unassigned"}`,
        notifyMessage:
          "Install is on the calendar. Confirm the customer (Podium/text), then log confirm in the Install Event modal.",
        requestedBy: "Ops",
      });
      if (installerRow?.name) {
        await postInspiredClosetsSlackNotification({
          assignee: installerRow.name.split(" ")[0] ?? installerRow.name,
          title: `You're on install — ${clientName}`,
          severity: "info",
          todoLabel: whenLabel,
          notifyMessage: "Check the Install Calendar for address and notes.",
          requestedBy: "Des",
        });
      }
    } catch {
      // Slack optional
    }
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
  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  const action = typeof body.action === "string" ? body.action : "update";

  const supabase = getSupabaseAdmin();
  const actor = await actorId();
  const nowIso = new Date().toISOString();

  // Install confirm from calendar event (job-scoped, not appointment id).
  if (action === "confirm_install" && jobId) {
    const { data: appt } = await supabase
      .from("ic_appointments")
      .select("id")
      .eq("job_id", jobId)
      .eq("kind", "install")
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!appt) {
      return NextResponse.json(
        { ok: false, error: "No install appointment found for this job." },
        { status: 404 },
      );
    }
    const { data: updated, error } = await supabase
      .from("ic_appointments")
      .update({
        confirmation_sent_at: nowIso,
        confirmation_note:
          typeof body.confirmation_note === "string"
            ? body.confirmation_note
            : "Logged install confirm (Podium/text sent manually)",
        status: "confirmed",
        updated_at: nowIso,
        updated_by: actor,
      })
      .eq("id", appt.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    await supabase.from("ic_activity_log").insert({
      entity_type: "appointment",
      entity_id: appt.id,
      action: "install_confirm_logged",
      actor_id: actor,
      changes: { job_id: jobId },
    });
    return NextResponse.json({ ok: true, appointment: updated });
  }

  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

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

  if (action === "complete_consult") {
    const outcomeRaw = typeof body.outcome === "string" ? body.outcome : "";
    if (!isConsultOutcome(outcomeRaw)) {
      return NextResponse.json(
        { ok: false, error: "outcome must be quote_sent, follow_up, or no_sale." },
        { status: 400 },
      );
    }
    const outcome = outcomeRaw;
    if (current.kind !== "consultation") {
      return NextResponse.json(
        { ok: false, error: "Only Design Events can be marked consult-complete." },
        { status: 400 },
      );
    }
    if (current.status === "cancelled") {
      return NextResponse.json(
        { ok: false, error: "Cancelled consults cannot be completed." },
        { status: 409 },
      );
    }
    if (current.status === "completed") {
      return NextResponse.json({ ok: true, appointment: current, alreadyCompleted: true });
    }

    const outcomeLine = `Consult outcome: ${CONSULT_OUTCOME_LABEL[outcome]}`;
    const existingNotes = typeof current.notes === "string" ? current.notes.trim() : "";
    const notes = existingNotes.includes(outcomeLine)
      ? current.notes
      : [existingNotes, outcomeLine].filter(Boolean).join("\n");

    const { data: updated, error } = await supabase
      .from("ic_appointments")
      .update({
        status: "completed",
        notes,
        updated_at: nowIso,
        updated_by: actor,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    try {
      if (current.lead_id) {
        const { data: lead } = await supabase
          .from("ic_leads")
          .select("id, converted_job_id, pipeline_status, stage")
          .eq("id", current.lead_id)
          .maybeSingle();
        const alreadySold = Boolean(lead?.converted_job_id) || lead?.pipeline_status === "sold";
        if (lead && !alreadySold) {
          const leadUpdate: Record<string, unknown> = {
            updated_at: nowIso,
            updated_by: actor,
          };
          if (outcome === "no_sale") {
            leadUpdate.stage = "nurturing";
            leadUpdate.nurturing_reason = "no_longer_interested";
          } else {
            leadUpdate.stage = "follow_up";
          }
          await supabase.from("ic_leads").update(leadUpdate).eq("id", lead.id);
          await supabase.from("ic_activity_log").insert({
            entity_type: "lead",
            entity_id: lead.id,
            action: "consult_complete",
            actor_id: actor,
            changes: { outcome, appointment_id: id },
          });
        }
      }

      await supabase.from("ic_activity_log").insert({
        entity_type: "appointment",
        entity_id: id,
        action: "consult_complete",
        actor_id: actor,
        changes: { outcome, lead_id: current.lead_id },
      });

      let clientName = "Client";
      if (current.client_id) {
        const { data: client } = await supabase
          .from("ic_clients")
          .select("name")
          .eq("id", current.client_id)
          .maybeSingle();
        if (client?.name) clientName = client.name;
      } else if (current.lead_id) {
        const { data: lead } = await supabase
          .from("ic_leads")
          .select("client_id")
          .eq("id", current.lead_id)
          .maybeSingle();
        if (lead?.client_id) {
          const { data: client } = await supabase
            .from("ic_clients")
            .select("name")
            .eq("id", lead.client_id)
            .maybeSingle();
          if (client?.name) clientName = client.name;
        }
      }

      let designerName = await actorName();
      if (current.designer_id) {
        const { data: designer } = await supabase
          .from("ic_staff")
          .select("name")
          .eq("id", current.designer_id)
          .maybeSingle();
        if (designer?.name) designerName = designer.name;
      }

      await notifyConsultComplete({
        clientName,
        designerName,
        outcome,
      });
    } catch {
      /* Lead move + Slack must not undo a completed consult */
    }

    const calendar = await pushAppointmentById(id);
    return NextResponse.json({
      ok: true,
      appointment: updated,
      googleCalendar: calendar,
    });
  }

  const updates: Record<string, unknown> = {
    updated_at: nowIso,
    updated_by: actor,
  };

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
