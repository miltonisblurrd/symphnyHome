import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  ensurePaymentMilestones,
} from "@/lib/inspired-closets-ops-billing";
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  MAX_FOLLOW_UP_ATTEMPTS,
  type IcLeadSource,
  type IcLeadStage,
} from "@/lib/inspired-closets-ops-leads";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

const VALID_SOURCES = new Set(LEAD_SOURCES.map((s) => s.id));
const VALID_STAGES = new Set(LEAD_STAGES.map((s) => s.id));

async function actorId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage");
  const source = searchParams.get("source");
  const ownerId = searchParams.get("ownerId");
  const needsFollowUp = searchParams.get("needsFollowUp") === "1";

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_leads")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (stage && VALID_STAGES.has(stage as IcLeadStage)) {
    query = query.eq("stage", stage);
  }
  if (source && VALID_SOURCES.has(source as IcLeadSource)) {
    query = query.eq("source", source);
  }
  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  const [leadsResult, staffResult, clientsResult] = await Promise.all([
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
  ]);

  if (leadsResult.error) {
    return NextResponse.json({ ok: false, error: leadsResult.error.message }, { status: 500 });
  }

  const staffById = new Map((staffResult.data ?? []).map((s) => [s.id, s]));
  const clientsById = new Map((clientsResult.data ?? []).map((c) => [c.id, c]));
  const now = Date.now();

  let leads = (leadsResult.data ?? []).map((lead) => {
    const nextDue = lead.next_action_at ? new Date(lead.next_action_at).getTime() : null;
    const followUpNeeded =
      lead.stage === "follow_up" ||
      lead.stage === "new" ||
      lead.stage === "schedule" ||
      (nextDue != null && nextDue <= now);
    return {
      ...lead,
      client: lead.client_id ? clientsById.get(lead.client_id) ?? null : null,
      owner: lead.owner_id ? staffById.get(lead.owner_id) ?? null : null,
      designer: lead.designer_id ? staffById.get(lead.designer_id) ?? null : null,
      followUpNeeded,
      attemptsRemaining: Math.max(0, MAX_FOLLOW_UP_ATTEMPTS - (lead.contact_attempts ?? 0)),
    };
  });

  if (needsFollowUp) {
    leads = leads.filter((lead) => lead.followUpNeeded && !["junk", "not_interested", "appointment_set"].includes(lead.stage));
  }

  return NextResponse.json({
    ok: true,
    sources: LEAD_SOURCES,
    stages: LEAD_STAGES,
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

  const clientName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const clientId = typeof body.client_id === "string" ? body.client_id : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const email = typeof body.email === "string" ? body.email.trim() : null;
  const address = typeof body.address === "string" ? body.address.trim() : null;
  const source =
    typeof body.source === "string" && VALID_SOURCES.has(body.source as IcLeadSource)
      ? (body.source as IcLeadSource)
      : "call";
  const stage =
    typeof body.stage === "string" && VALID_STAGES.has(body.stage as IcLeadStage)
      ? (body.stage as IcLeadStage)
      : "new";
  const ownerId = typeof body.owner_id === "string" ? body.owner_id : null;
  const designerId = typeof body.designer_id === "string" ? body.designer_id : null;
  const notes = typeof body.notes === "string" ? body.notes : null;
  const projectArea = typeof body.project_area === "string" ? body.project_area : null;
  const motivation = typeof body.motivation === "string" ? body.motivation : null;
  const desiredTimeline = typeof body.desired_timeline === "string" ? body.desired_timeline : null;
  const communityRef = typeof body.community_ref === "string" ? body.community_ref : null;
  const nextActionAt = typeof body.next_action_at === "string" ? body.next_action_at : null;
  const nextActionNote = typeof body.next_action_note === "string" ? body.next_action_note : null;

  if (!clientId && !clientName) {
    return NextResponse.json(
      { ok: false, error: "client_name or client_id is required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const actor = await actorId();
  let resolvedClientId = clientId;

  if (!resolvedClientId) {
    const { data: createdClient, error: clientError } = await supabase
      .from("ic_clients")
      .insert({
        name: clientName,
        phone,
        email,
        address,
        created_by: actor,
      })
      .select("id")
      .single();
    if (clientError) {
      return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
    }
    resolvedClientId = createdClient.id;
  }

  const { data: lead, error } = await supabase
    .from("ic_leads")
    .insert({
      client_id: resolvedClientId,
      source,
      stage,
      owner_id: ownerId ?? actor,
      designer_id: designerId,
      notes,
      project_area: projectArea,
      motivation,
      desired_timeline: desiredTimeline,
      community_ref: communityRef,
      next_action_at: nextActionAt,
      next_action_note: nextActionNote,
      created_by: actor,
      updated_by: actor,
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
    actor_id: actor,
    changes: { source, stage },
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
  const actor = await actorId();
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
    let stage = existing.stage as string;
    if (attempts >= MAX_FOLLOW_UP_ATTEMPTS && stage === "follow_up") {
      stage = "nurturing";
    } else if (stage === "new") {
      stage = "follow_up";
    }
    const { data, error } = await supabase
      .from("ic_leads")
      .update({
        contact_attempts: attempts,
        stage,
        updated_at: nowIso,
        updated_by: actor,
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
      action: "contact_attempt",
      actor_id: actor,
      changes: { contact_attempts: attempts, stage },
    });
    return NextResponse.json({ ok: true, lead: data });
  }

  if (action === "convert") {
    if (existing.converted_job_id) {
      return NextResponse.json(
        { ok: false, error: "Lead already converted.", job_id: existing.converted_job_id },
        { status: 409 },
      );
    }
    const contractCents =
      typeof body.contract_cents === "number"
        ? Math.max(0, Math.round(body.contract_cents))
        : typeof body.contract === "string"
          ? Math.max(0, Math.round(Number(body.contract.replace(/[$,\s]/g, "")) * 100))
          : 0;
    if (contractCents <= 0) {
      return NextResponse.json(
        { ok: false, error: "contract_cents (or contract dollars) is required to convert." },
        { status: 400 },
      );
    }

    const designerId =
      typeof body.designer_id === "string" ? body.designer_id : existing.designer_id;
    const depositCents = Math.round(contractCents * 0.5);
    const today = nowIso.slice(0, 10);

    const { data: job, error: jobError } = await supabase
      .from("ic_jobs")
      .insert({
        client_id: existing.client_id,
        lead_id: leadId,
        designer_id: designerId,
        stage: "deposit_pending",
        contract_cents: contractCents,
        deposit_cents: depositCents,
        collected_cents: 0,
        sold_date: today,
        community_ref: existing.community_ref,
        notes: existing.notes,
        created_by: actor,
        updated_by: actor,
      })
      .select("*")
      .single();
    if (jobError) {
      return NextResponse.json({ ok: false, error: jobError.message }, { status: 500 });
    }

    try {
      await ensurePaymentMilestones(job.id, contractCents, { dueDepositNow: true });
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
        stage: "appointment_set",
        updated_at: nowIso,
        updated_by: actor,
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
      actor_id: actor,
      changes: { job_id: job.id, contract_cents: contractCents },
    });

    return NextResponse.json({ ok: true, lead, job });
  }

  // Generic update
  const updates: Record<string, unknown> = {
    updated_at: nowIso,
    updated_by: actor,
  };

  if (typeof body.stage === "string" && VALID_STAGES.has(body.stage as IcLeadStage)) {
    if (body.stage === "junk") {
      const reason =
        typeof body.disqualification_reason === "string"
          ? body.disqualification_reason.trim()
          : "";
      if (!reason) {
        return NextResponse.json(
          { ok: false, error: "disqualification_reason is required for junk." },
          { status: 400 },
        );
      }
      updates.disqualification_reason = reason;
    }
    updates.stage = body.stage;
  }
  if (typeof body.source === "string" && VALID_SOURCES.has(body.source as IcLeadSource)) {
    // Source locked at intake — only allow change if still new, or admin override flag
    if (existing.stage === "new" || body.allow_source_change === true) {
      updates.source = body.source;
    }
  }
  if (typeof body.owner_id === "string" || body.owner_id === null) {
    updates.owner_id = body.owner_id;
  }
  if (typeof body.designer_id === "string" || body.designer_id === null) {
    updates.designer_id = body.designer_id;
  }
  if (typeof body.next_action_at === "string" || body.next_action_at === null) {
    updates.next_action_at = body.next_action_at;
  }
  if (typeof body.next_action_note === "string" || body.next_action_note === null) {
    updates.next_action_note = body.next_action_note;
  }
  if (typeof body.notes === "string" || body.notes === null) updates.notes = body.notes;
  if (typeof body.project_area === "string" || body.project_area === null) {
    updates.project_area = body.project_area;
  }
  if (typeof body.motivation === "string" || body.motivation === null) {
    updates.motivation = body.motivation;
  }
  if (typeof body.desired_timeline === "string" || body.desired_timeline === null) {
    updates.desired_timeline = body.desired_timeline;
  }
  if (typeof body.community_ref === "string" || body.community_ref === null) {
    updates.community_ref = body.community_ref;
  }
  if (typeof body.disqualification_reason === "string") {
    updates.disqualification_reason = body.disqualification_reason;
  }
  if (typeof body.risk_flag === "boolean") updates.risk_flag = body.risk_flag;
  if (typeof body.contact_attempts === "number") {
    updates.contact_attempts = Math.max(0, Math.round(body.contact_attempts));
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
    actor_id: actor,
    changes: updates,
  });

  return NextResponse.json({ ok: true, lead: data });
}
