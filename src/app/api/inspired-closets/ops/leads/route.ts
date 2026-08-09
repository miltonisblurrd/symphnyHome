import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  ensurePaymentMilestones,
  isDepositPaid,
  recordPaymentAmount,
} from "@/lib/inspired-closets-ops-billing";
import {
  AREAS_OF_HOME,
  ATTEMPT_STAGES,
  FORM_TYPES,
  INFLUENCER_TYPES,
  JUNK_REASONS,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TYPES,
  MAX_FOLLOW_UP_ATTEMPTS,
  NURTURING_REASONS,
  PIPELINE_STATUSES,
  nextAttemptStage,
  type IcLeadSourceId,
  type IcLeadStageId,
} from "@/lib/inspired-closets-ops-leads";
import { IC_STAFF_ID_COOKIE, IC_STAFF_NAME_COOKIE } from "@/lib/inspired-closets-ops-field";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";

export const runtime = "nodejs";

const VALID_SOURCES = new Set<string>(LEAD_SOURCES.map((s) => s.id));
const VALID_STAGES = new Set<string>(LEAD_STAGES.map((s) => s.id));
const VALID_JUNK = new Set<string>(JUNK_REASONS.map((r) => r.id));
const VALID_NURTURE = new Set<string>(NURTURING_REASONS.map((r) => r.id));
const VALID_FORM = new Set<string>(FORM_TYPES.map((f) => f.id));
const VALID_INFLUENCER = new Set<string>(INFLUENCER_TYPES.map((i) => i.id));
const VALID_PIPELINE = new Set<string>(PIPELINE_STATUSES.map((p) => p.id));
const VALID_DEPOSIT_INTAKE = new Set(["pending", "link_sent", "check_pending", "paid"]);

async function actor(): Promise<{ id: string | null; name: string | null }> {
  const cookieStore = await cookies();
  return {
    id: cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null,
    name: cookieStore.get(IC_STAFF_NAME_COOKIE)?.value ?? null,
  };
}

async function applyDepositIntakeStatus(
  jobId: string,
  status: string,
  depositCents: number,
  actorId: string | null,
) {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  if (status === "link_sent") {
    await supabase
      .from("ic_payments")
      .update({ link_sent_at: nowIso, updated_at: nowIso, updated_by: actorId })
      .eq("job_id", jobId)
      .eq("milestone", "deposit_50")
      .is("link_sent_at", null);
    return;
  }

  if (status === "paid" || status === "check_pending") {
    const { data: payment } = await supabase
      .from("ic_payments")
      .select("id, amount_due_cents, amount_paid_cents, status")
      .eq("job_id", jobId)
      .eq("milestone", "deposit_50")
      .maybeSingle();
    if (!payment) return;
    if (status === "paid" && payment.status !== "paid") {
      await recordPaymentAmount({
        paymentId: payment.id,
        amountPaidCents: payment.amount_due_cents || depositCents,
        method: "podium",
        notes: "Marked paid from Sold intake",
        actorId,
      });
    }
  }
}

async function notifyDesSold(input: {
  clientName: string;
  contractCents: number;
  jobId: string;
  depositStatus: string;
  requestedBy?: string | null;
}) {
  const dollars = (input.contractCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  try {
    await postInspiredClosetsSlackNotification({
      assignee: "Des",
      title: `Sold — ${input.clientName}`,
      severity: "info",
      todoLabel: `${dollars} · deposit ${input.depositStatus.replace(/_/g, " ")}`,
      notifyMessage: `Sold job ready for Des intake follow-up. Job ${input.jobId}. Mark deposit in Billing when cleared, then schedule from Ready to Schedule.`,
      requestedBy: input.requestedBy ?? "Ops",
    });
  } catch {
    // Slack is optional — never fail the sell path.
  }
}

function formatAddress(parts: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const line = [parts.street, [parts.city, parts.state].filter(Boolean).join(", "), parts.zip]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage");
  const source = searchParams.get("source");
  const ownerId = searchParams.get("ownerId");
  const leadId = searchParams.get("id");
  const view = searchParams.get("view"); // unscheduled | scheduled | all | needs
  const includeChatter = searchParams.get("chatter") === "1";

  const supabase = getSupabaseAdmin();

  if (leadId) {
    const { data: lead, error } = await supabase
      .from("ic_leads")
      .select("*")
      .eq("id", leadId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!lead) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const [clientRes, staffRes, apptsRes, activityRes, chatterRes] = await Promise.all([
      lead.client_id
        ? supabase.from("ic_clients").select("*").eq("id", lead.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("ic_staff")
        .select("id, name, role, active")
        .is("deleted_at", null)
        .eq("active", true)
        .order("name"),
      supabase
        .from("ic_appointments")
        .select("*")
        .eq("lead_id", leadId)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("ic_activity_log")
        .select("*")
        .eq("entity_type", "lead")
        .eq("entity_id", leadId)
        .order("created_at", { ascending: false })
        .limit(100),
      includeChatter
        ? supabase
            .from("ic_lead_chatter")
            .select("*")
            .eq("lead_id", leadId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] }),
    ]);

    const staffById = new Map((staffRes.data ?? []).map((s) => [s.id, s]));
    return NextResponse.json({
      ok: true,
      lead: {
        ...lead,
        client: clientRes.data ?? null,
        owner: lead.owner_id ? staffById.get(lead.owner_id) ?? null : null,
        designer: lead.designer_id ? staffById.get(lead.designer_id) ?? null : null,
      },
      appointments: apptsRes.data ?? [],
      activity: activityRes.data ?? [],
      chatter: chatterRes.data ?? [],
      sources: LEAD_SOURCES,
      stages: LEAD_STAGES,
      leadTypes: LEAD_TYPES,
      influencerTypes: INFLUENCER_TYPES,
      formTypes: FORM_TYPES,
      areasOfHome: AREAS_OF_HOME,
      nurturingReasons: NURTURING_REASONS,
      junkReasons: JUNK_REASONS,
      pipelineStatuses: PIPELINE_STATUSES,
      maxAttempts: MAX_FOLLOW_UP_ATTEMPTS,
      staff: staffRes.data ?? [],
    });
  }

  let query = supabase
    .from("ic_leads")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (stage && VALID_STAGES.has(stage)) query = query.eq("stage", stage);
  if (source && VALID_SOURCES.has(source)) query = query.eq("source", source);
  if (ownerId) query = query.eq("owner_id", ownerId);

  const [leadsResult, staffResult, clientsResult, apptsResult] = await Promise.all([
    query,
    supabase
      .from("ic_staff")
      .select("id, name, role, active")
      .is("deleted_at", null)
      .eq("active", true)
      .order("name"),
    supabase
      .from("ic_clients")
      .select("id, name, phone, email, address")
      .is("deleted_at", null)
      .order("name")
      .limit(3000),
    supabase
      .from("ic_appointments")
      .select("id, lead_id, scheduled_at, kind, status, designer_id")
      .is("deleted_at", null)
      .limit(3000),
  ]);

  if (leadsResult.error) {
    return NextResponse.json({ ok: false, error: leadsResult.error.message }, { status: 500 });
  }

  const staffById = new Map((staffResult.data ?? []).map((s) => [s.id, s]));
  const clientsById = new Map((clientsResult.data ?? []).map((c) => [c.id, c]));
  type ApptRow = {
    id: string;
    lead_id: string | null;
    scheduled_at: string;
    kind: string;
    status: string;
    designer_id: string | null;
  };
  const apptByLead = new Map<string, ApptRow>();
  for (const a of (apptsResult.data ?? []) as ApptRow[]) {
    if (a.lead_id && !apptByLead.has(a.lead_id)) apptByLead.set(a.lead_id, a);
  }

  const terminal = new Set([
    "junk",
    "duplicate",
    "moved_to_studio",
    "appointment_set",
    "rescheduled",
    "canceled_appointment",
  ]);

  let leads = (leadsResult.data ?? []).map((lead) => {
    const nextDue = lead.next_action_at ? new Date(lead.next_action_at).getTime() : null;
    const followUpNeeded =
      lead.stage === "follow_up" ||
      lead.stage === "new" ||
      ATTEMPT_STAGES.includes(lead.stage as (typeof ATTEMPT_STAGES)[number]) ||
      (nextDue != null && nextDue <= Date.now() && !terminal.has(lead.stage));
    const appointment = apptByLead.get(lead.id) ?? null;
    return {
      ...lead,
      client: lead.client_id ? clientsById.get(lead.client_id) ?? null : null,
      owner: lead.owner_id ? staffById.get(lead.owner_id) ?? null : null,
      designer: lead.designer_id ? staffById.get(lead.designer_id) ?? null : null,
      appointment,
      followUpNeeded,
      attemptsRemaining: Math.max(0, MAX_FOLLOW_UP_ATTEMPTS - (lead.contact_attempts ?? 0)),
    };
  });

  if (view === "needs") {
    leads = leads.filter((l) => l.followUpNeeded && !terminal.has(l.stage));
  } else if (view === "unscheduled") {
    leads = leads.filter(
      (l) =>
        !["appointment_set", "rescheduled", "moved_to_studio", "junk", "duplicate"].includes(
          l.stage,
        ),
    );
  } else if (view === "scheduled") {
    leads = leads.filter((l) =>
      ["appointment_set", "rescheduled", "moved_to_studio"].includes(l.stage),
    );
  }

  return NextResponse.json({
    ok: true,
    sources: LEAD_SOURCES,
    stages: LEAD_STAGES,
    leadTypes: LEAD_TYPES,
    influencerTypes: INFLUENCER_TYPES,
    formTypes: FORM_TYPES,
    areasOfHome: AREAS_OF_HOME,
    nurturingReasons: NURTURING_REASONS,
    junkReasons: JUNK_REASONS,
    pipelineStatuses: PIPELINE_STATUSES,
    maxAttempts: MAX_FOLLOW_UP_ATTEMPTS,
    leads,
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

  const action = typeof body.action === "string" ? body.action : "create";
  const supabase = getSupabaseAdmin();
  const { id: actorId, name: actorName } = await actor();

  if (action === "chatter") {
    const leadId = typeof body.lead_id === "string" ? body.lead_id : null;
    const chatterBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!leadId || !chatterBody) {
      return NextResponse.json(
        { ok: false, error: "lead_id and body are required." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("ic_lead_chatter")
      .insert({
        lead_id: leadId,
        author_id: actorId,
        author_name: actorName,
        body: chatterBody,
      })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    await supabase.from("ic_activity_log").insert({
      entity_type: "lead",
      entity_id: leadId,
      action: "chatter_post",
      actor_id: actorId,
      actor_label: actorName,
      changes: { body: chatterBody.slice(0, 200) },
    });
    return NextResponse.json({ ok: true, post: data });
  }

  const clientName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const clientId = typeof body.client_id === "string" ? body.client_id : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  const email = typeof body.email === "string" ? body.email.trim() || null : null;
  const street = typeof body.street === "string" ? body.street.trim() || null : null;
  const city = typeof body.city === "string" ? body.city.trim() || null : null;
  const state = typeof body.state === "string" ? body.state.trim() || null : null;
  const zip = typeof body.zip === "string" ? body.zip.trim() || null : null;
  const country = typeof body.country === "string" ? body.country.trim() || null : "United States";
  const address =
    typeof body.address === "string" && body.address.trim()
      ? body.address.trim()
      : formatAddress({ street, city, state, zip });

  const source =
    typeof body.source === "string" && VALID_SOURCES.has(body.source)
      ? (body.source as IcLeadSourceId)
      : "instagram";
  const stage =
    typeof body.stage === "string" && VALID_STAGES.has(body.stage)
      ? (body.stage as IcLeadStageId)
      : "new";

  if (!clientId && !clientName) {
    return NextResponse.json(
      { ok: false, error: "client_name or client_id is required." },
      { status: 400 },
    );
  }

  let resolvedClientId = clientId;
  if (!resolvedClientId) {
    const { data: createdClient, error: clientError } = await supabase
      .from("ic_clients")
      .insert({
        name: clientName,
        phone,
        email,
        address,
        created_by: actorId,
      })
      .select("id")
      .single();
    if (clientError) {
      return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
    }
    resolvedClientId = createdClient.id;
  }

  const areas = Array.isArray(body.areas_of_home)
    ? body.areas_of_home.filter((a): a is string => typeof a === "string")
    : [];

  const { data: lead, error } = await supabase
    .from("ic_leads")
    .insert({
      client_id: resolvedClientId,
      source,
      stage,
      owner_id: typeof body.owner_id === "string" ? body.owner_id : actorId,
      designer_id: typeof body.designer_id === "string" ? body.designer_id : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      project_area: areas[0] ?? (typeof body.project_area === "string" ? body.project_area : null),
      areas_of_home: areas,
      lead_type: body.lead_type === "influencer" ? "influencer" : "consumer",
      influencer_type:
        typeof body.influencer_type === "string" && VALID_INFLUENCER.has(body.influencer_type)
          ? body.influencer_type
          : null,
      form_type:
        typeof body.form_type === "string" && VALID_FORM.has(body.form_type)
          ? body.form_type
          : null,
      street,
      city,
      state,
      zip,
      country,
      community_name:
        typeof body.community_name === "string" ? body.community_name.trim() || null : null,
      community_ref:
        typeof body.community_name === "string" ? body.community_name.trim() || null : null,
      showroom_visit: body.showroom_visit === true,
      show_room:
        typeof body.show_room === "string" ? body.show_room : "Las Vegas Showroom",
      contact_preference:
        typeof body.contact_preference === "string" ? body.contact_preference : null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "lead",
    entity_id: lead.id,
    action: "created",
    actor_id: actorId,
    actor_label: actorName,
    changes: { source, stage, Lead_Status: { from: null, to: stage } },
  });

  return NextResponse.json({ ok: true, lead });
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

  const leadId = typeof body.id === "string" ? body.id : null;
  const action = typeof body.action === "string" ? body.action : "update";
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { id: actorId, name: actorName } = await actor();
  const nowIso = new Date().toISOString();

  const { data: existing, error: findError } = await supabase
    .from("ic_leads")
    .select("*")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (action === "attempt") {
    const attempts = (existing.contact_attempts ?? 0) + 1;
    const stage = nextAttemptStage(existing.stage);
    const updates: Record<string, unknown> = {
      contact_attempts: attempts,
      stage,
      updated_at: nowIso,
      updated_by: actorId,
    };
    if (stage === "nurturing" && !existing.nurturing_reason) {
      updates.nurturing_reason = "no_contact_made";
    }
    const { data, error } = await supabase
      .from("ic_leads")
      .update(updates)
      .eq("id", leadId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    await supabase.from("ic_activity_log").insert({
      entity_type: "lead",
      entity_id: leadId,
      action: "contact_attempt",
      actor_id: actorId,
      actor_label: actorName,
      changes: {
        contact_attempts: attempts,
        "Lead Status": { from: existing.stage, to: stage },
      },
    });
    return NextResponse.json({ ok: true, lead: data });
  }

  if (action === "move_to_studio") {
    const { data, error } = await supabase
      .from("ic_leads")
      .update({
        stage: "moved_to_studio",
        converted_at: nowIso,
        designer_id:
          typeof body.designer_id === "string" ? body.designer_id : existing.designer_id,
        updated_at: nowIso,
        updated_by: actorId,
      })
      .eq("id", leadId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    await supabase.from("ic_activity_log").insert({
      entity_type: "lead",
      entity_id: leadId,
      action: "moved_to_studio",
      actor_id: actorId,
      actor_label: actorName,
      changes: { "Lead Status": { from: existing.stage, to: "moved_to_studio" } },
    });
    return NextResponse.json({ ok: true, lead: data });
  }

  if (action === "schedule_event") {
    const scheduledAt = typeof body.scheduled_at === "string" ? body.scheduled_at : null;
    if (!scheduledAt) {
      return NextResponse.json({ ok: false, error: "scheduled_at is required." }, { status: 400 });
    }
    const kind =
      body.kind === "install" ? "install" : body.kind === "job_check" ? "job_check" : "consultation";
    const locationType =
      body.location_type === "showroom" || body.location_type === "virtual"
        ? body.location_type
        : "on_site";
    const designerId =
      typeof body.designer_id === "string" ? body.designer_id : existing.designer_id;
    const installerId =
      typeof body.installer_id === "string" ? body.installer_id : null;

    if (kind === "install" && !existing.converted_job_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Install events need a sold job. Complete Sold intake first, or book a Design Event.",
        },
        { status: 409 },
      );
    }

    if (kind === "install" && existing.converted_job_id) {
      const paid = await isDepositPaid(existing.converted_job_id);
      if (!paid) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "50% deposit must be received before scheduling install. Mark deposit paid in Billing first.",
          },
          { status: 409 },
        );
      }
    }

    const { data: appointment, error: apptError } = await supabase
      .from("ic_appointments")
      .insert({
        lead_id: leadId,
        client_id: existing.client_id,
        job_id: existing.converted_job_id,
        designer_id: kind === "install" ? existing.designer_id ?? designerId : designerId,
        kind,
        scheduled_at: scheduledAt,
        location_type: locationType,
        status: "scheduled",
        notes: typeof body.notes === "string" ? body.notes : null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select("*")
      .single();
    if (apptError) {
      return NextResponse.json({ ok: false, error: apptError.message }, { status: 500 });
    }

    const nextStage =
      kind === "consultation" || kind === "job_check" ? "appointment_set" : existing.stage;

    const leadUpdates: Record<string, unknown> = {
      stage: nextStage,
      updated_at: nowIso,
      updated_by: actorId,
    };
    if (kind !== "install" && designerId) {
      leadUpdates.designer_id = designerId;
    }

    const { data: lead, error: leadError } = await supabase
      .from("ic_leads")
      .update(leadUpdates)
      .eq("id", leadId)
      .select("*")
      .single();
    if (leadError) {
      return NextResponse.json({ ok: false, error: leadError.message }, { status: 500 });
    }

    if (kind === "install" && existing.converted_job_id) {
      await supabase
        .from("ic_jobs")
        .update({
          stage: "install_scheduled",
          install_date: scheduledAt.slice(0, 10),
          installer_id: installerId,
          updated_at: nowIso,
          updated_by: actorId,
        })
        .eq("id", existing.converted_job_id);
    }

    await supabase.from("ic_activity_log").insert({
      entity_type: "lead",
      entity_id: leadId,
      action: "appointment_created",
      actor_id: actorId,
      actor_label: actorName,
      changes: {
        kind,
        scheduled_at: scheduledAt,
        installer_id: installerId,
        "Lead Status": { from: existing.stage, to: nextStage },
      },
    });

    return NextResponse.json({ ok: true, lead, appointment });
  }

  if (action === "sell" || action === "convert") {
    if (existing.converted_job_id && action === "convert") {
      return NextResponse.json(
        { ok: false, error: "Lead already has a job.", job_id: existing.converted_job_id },
        { status: 409 },
      );
    }
    const contractCents =
      typeof body.contract_cents === "number"
        ? Math.max(0, Math.round(body.contract_cents))
        : typeof body.contract === "string"
          ? Math.max(0, Math.round(Number(body.contract.replace(/[$,\s]/g, "")) * 100))
          : existing.pipeline_sold_cents ?? 0;
    if (contractCents <= 0) {
      return NextResponse.json(
        { ok: false, error: "Contract amount is required to create the job." },
        { status: 400 },
      );
    }

    const designerId =
      typeof body.designer_id === "string" ? body.designer_id : existing.designer_id;
    const depositCents = Math.round(contractCents * 0.5);
    const soldDate =
      typeof body.sold_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.sold_date)
        ? body.sold_date
        : nowIso.slice(0, 10);
    const depositIntakeStatus =
      typeof body.deposit_intake_status === "string" &&
      VALID_DEPOSIT_INTAKE.has(body.deposit_intake_status)
        ? body.deposit_intake_status
        : "pending";
    const communityRef =
      typeof body.community_ref === "string"
        ? body.community_ref.trim() || null
        : existing.community_name ?? existing.community_ref ?? null;
    const studioRef =
      typeof body.studio_ref === "string" ? body.studio_ref.trim() || null : null;
    const jobCheckOwnerId =
      typeof body.job_check_owner_id === "string" ? body.job_check_owner_id : null;
    const tentativeInstallNotes =
      typeof body.tentative_install_notes === "string"
        ? body.tentative_install_notes.trim() || null
        : null;
    const siteReadyNotes =
      typeof body.site_ready_notes === "string" ? body.site_ready_notes.trim() || null : null;

    // If already sold, update intake on the existing job instead of creating another.
    if (existing.converted_job_id && action === "sell") {
      const jobUpdate: Record<string, unknown> = {
        contract_cents: contractCents,
        deposit_cents: depositCents,
        sold_date: soldDate,
        community_ref: communityRef,
        studio_ref: studioRef,
        job_check_owner_id: jobCheckOwnerId,
        tentative_install_notes: tentativeInstallNotes,
        site_ready_notes: siteReadyNotes,
        deposit_intake_status: depositIntakeStatus,
        designer_id: designerId,
        updated_at: nowIso,
        updated_by: actorId,
      };
      const { data: job, error: jobError } = await supabase
        .from("ic_jobs")
        .update(jobUpdate)
        .eq("id", existing.converted_job_id)
        .select("*")
        .single();
      if (jobError) {
        return NextResponse.json({ ok: false, error: jobError.message }, { status: 500 });
      }
      try {
        await ensurePaymentMilestones(job.id, contractCents, { dueDepositNow: true });
        await applyDepositIntakeStatus(job.id, depositIntakeStatus, depositCents, actorId);
      } catch (err) {
        return NextResponse.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : "Failed to update payment milestones.",
            job,
          },
          { status: 500 },
        );
      }
      const { data: client } = existing.client_id
        ? await supabase.from("ic_clients").select("name").eq("id", existing.client_id).maybeSingle()
        : { data: null };
      await notifyDesSold({
        clientName: client?.name ?? "Client",
        contractCents,
        jobId: job.id,
        depositStatus: depositIntakeStatus,
        requestedBy: actorName,
      });
      return NextResponse.json({ ok: true, lead: existing, job, updated: true });
    }

    const { data: job, error: jobError } = await supabase
      .from("ic_jobs")
      .insert({
        client_id: existing.client_id,
        lead_id: leadId,
        designer_id: designerId,
        stage: depositIntakeStatus === "paid" ? "deposit_received" : "deposit_pending",
        contract_cents: contractCents,
        deposit_cents: depositCents,
        collected_cents: 0,
        sold_date: soldDate,
        community_ref: communityRef,
        studio_ref: studioRef,
        job_check_owner_id: jobCheckOwnerId,
        tentative_install_notes: tentativeInstallNotes,
        site_ready_notes: siteReadyNotes,
        deposit_intake_status: depositIntakeStatus,
        notes: [existing.notes, siteReadyNotes].filter(Boolean).join("\n") || null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select("*")
      .single();
    if (jobError) {
      return NextResponse.json({ ok: false, error: jobError.message }, { status: 500 });
    }

    try {
      await ensurePaymentMilestones(job.id, contractCents, { dueDepositNow: true });
      await applyDepositIntakeStatus(job.id, depositIntakeStatus, depositCents, actorId);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Failed to create payment milestones.",
          job,
        },
        { status: 500 },
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("ic_leads")
      .update({
        converted_job_id: job.id,
        designer_id: designerId,
        stage: "moved_to_studio",
        converted_at: existing.converted_at ?? nowIso,
        pipeline_status: "sold",
        pipeline_sold_cents: contractCents,
        pipeline_signed: true,
        updated_at: nowIso,
        updated_by: actorId,
      })
      .eq("id", leadId)
      .select("*")
      .single();
    if (leadError) {
      return NextResponse.json({ ok: false, error: leadError.message }, { status: 500 });
    }

    await supabase.from("ic_activity_log").insert({
      entity_type: "lead",
      entity_id: leadId,
      action: "converted_to_job",
      actor_id: actorId,
      actor_label: actorName,
      changes: {
        job_id: job.id,
        contract_cents: contractCents,
        deposit_intake_status: depositIntakeStatus,
      },
    });

    const { data: client } = existing.client_id
      ? await supabase.from("ic_clients").select("name").eq("id", existing.client_id).maybeSingle()
      : { data: null };

    await notifyDesSold({
      clientName: client?.name ?? "Client",
      contractCents,
      jobId: job.id,
      depositStatus: depositIntakeStatus,
      requestedBy: actorName,
    });

    return NextResponse.json({ ok: true, lead, job });
  }

  const updates: Record<string, unknown> = {
    updated_at: nowIso,
    updated_by: actorId,
  };
  const changeLog: Record<string, unknown> = {};

  if (typeof body.stage === "string" && VALID_STAGES.has(body.stage)) {
    if (body.stage === "junk") {
      const reason =
        typeof body.junk_reason === "string"
          ? body.junk_reason
          : typeof body.disqualification_reason === "string"
            ? body.disqualification_reason
            : "";
      if (!reason || !VALID_JUNK.has(reason)) {
        return NextResponse.json(
          { ok: false, error: "junk_reason is required when status is Junk." },
          { status: 400 },
        );
      }
      updates.junk_reason = reason;
      updates.disqualification_reason = reason;
    }
    if (body.stage === "nurturing") {
      const reason = typeof body.nurturing_reason === "string" ? body.nurturing_reason : "";
      if (!reason || !VALID_NURTURE.has(reason)) {
        return NextResponse.json(
          { ok: false, error: "nurturing_reason is required for Lead Nurturing." },
          { status: 400 },
        );
      }
      updates.nurturing_reason = reason;
    }
    if (body.stage !== existing.stage) {
      changeLog["Lead Status"] = { from: existing.stage, to: body.stage };
    }
    updates.stage = body.stage;
  }

  if (typeof body.source === "string" && VALID_SOURCES.has(body.source)) {
    updates.source = body.source;
  }
  if (typeof body.owner_id === "string" || body.owner_id === null) updates.owner_id = body.owner_id;
  if (typeof body.designer_id === "string" || body.designer_id === null) {
    updates.designer_id = body.designer_id;
  }
  if (typeof body.notes === "string" || body.notes === null) updates.notes = body.notes;
  if (body.lead_type === "consumer" || body.lead_type === "influencer") {
    updates.lead_type = body.lead_type;
    if (body.lead_type === "consumer") updates.influencer_type = null;
  }
  if (typeof body.influencer_type === "string" || body.influencer_type === null) {
    if (body.influencer_type === null || VALID_INFLUENCER.has(body.influencer_type)) {
      updates.influencer_type = body.influencer_type;
    }
  }
  if (typeof body.form_type === "string" || body.form_type === null) {
    if (body.form_type === null || VALID_FORM.has(body.form_type)) {
      updates.form_type = body.form_type;
    }
  }
  for (const key of ["street", "city", "state", "zip", "country", "community_name", "show_room", "contact_preference"] as const) {
    if (typeof body[key] === "string" || body[key] === null) {
      updates[key] = body[key];
    }
  }
  if (typeof body.community_name === "string") {
    updates.community_ref = body.community_name;
  }
  if (typeof body.showroom_visit === "boolean") updates.showroom_visit = body.showroom_visit;
  if (Array.isArray(body.areas_of_home)) {
    updates.areas_of_home = body.areas_of_home.filter((a): a is string => typeof a === "string");
    updates.project_area = (updates.areas_of_home as string[])[0] ?? null;
  }
  if (typeof body.nurturing_reason === "string" && VALID_NURTURE.has(body.nurturing_reason)) {
    updates.nurturing_reason = body.nurturing_reason;
  }
  if (typeof body.junk_reason === "string" && VALID_JUNK.has(body.junk_reason)) {
    updates.junk_reason = body.junk_reason;
    updates.disqualification_reason = body.junk_reason;
  }
  if (typeof body.needs_follow_up_date === "string" || body.needs_follow_up_date === null) {
    updates.needs_follow_up_date = body.needs_follow_up_date;
  }
  if (typeof body.next_action_at === "string" || body.next_action_at === null) {
    updates.next_action_at = body.next_action_at;
  }
  if (typeof body.next_action_note === "string" || body.next_action_note === null) {
    updates.next_action_note = body.next_action_note;
  }

  // Craig pipeline fields
  if (typeof body.pipeline_status === "string" && VALID_PIPELINE.has(body.pipeline_status)) {
    updates.pipeline_status = body.pipeline_status;
  }
  if (typeof body.pipeline_signed === "boolean") updates.pipeline_signed = body.pipeline_signed;
  if (typeof body.pipeline_rto === "boolean") updates.pipeline_rto = body.pipeline_rto;
  if (typeof body.pipeline_sold_cents === "number") {
    updates.pipeline_sold_cents = Math.max(0, Math.round(body.pipeline_sold_cents));
  }
  if (typeof body.pipeline_deposit_cents === "number") {
    updates.pipeline_deposit_cents = Math.max(0, Math.round(body.pipeline_deposit_cents));
  }
  if (typeof body.pipeline_margin_bps === "number" || body.pipeline_margin_bps === null) {
    updates.pipeline_margin_bps = body.pipeline_margin_bps;
  }
  if (typeof body.pipeline_source_label === "string" || body.pipeline_source_label === null) {
    updates.pipeline_source_label = body.pipeline_source_label;
  }

  // Sync client contact fields
  if (existing.client_id && (body.phone !== undefined || body.email !== undefined || body.client_name)) {
    const clientUpdates: Record<string, unknown> = {};
    if (typeof body.phone === "string" || body.phone === null) clientUpdates.phone = body.phone;
    if (typeof body.email === "string" || body.email === null) clientUpdates.email = body.email;
    if (typeof body.client_name === "string" && body.client_name.trim()) {
      clientUpdates.name = body.client_name.trim();
    }
    const addr = formatAddress({
      street: (updates.street as string) ?? existing.street,
      city: (updates.city as string) ?? existing.city,
      state: (updates.state as string) ?? existing.state,
      zip: (updates.zip as string) ?? existing.zip,
    });
    if (addr) clientUpdates.address = addr;
    if (Object.keys(clientUpdates).length) {
      await supabase.from("ic_clients").update(clientUpdates).eq("id", existing.client_id);
    }
  }

  const { data, error } = await supabase
    .from("ic_leads")
    .update(updates)
    .eq("id", leadId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "lead",
    entity_id: leadId,
    action: "updated",
    actor_id: actorId,
    actor_label: actorName,
    changes: Object.keys(changeLog).length ? changeLog : updates,
  });

  return NextResponse.json({ ok: true, lead: data });
}
