import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import { isMissingRelationError } from "@/lib/inspired-closets-ops-accounts";

export const runtime = "nodejs";

type Candidate = {
  id: string;
  lead_id: string;
  target_type: "job" | "client" | "lead";
  target_id: string;
  matched_fields: Record<string, string>;
  mismatched_fields: Record<string, string>;
  reason: string;
  status: string;
  created_at: string;
};

async function describeTargets(candidates: Candidate[]) {
  const supabase = getSupabaseAdmin();
  const ids = (type: Candidate["target_type"]) =>
    candidates.filter((c) => c.target_type === type).map((c) => c.target_id);
  const [jobs, clients, leads] = await Promise.all([
    ids("job").length
      ? supabase
          .from("ic_jobs")
          .select("id, stage, title, contract_cents, install_date, workbook_ref, ic_clients(name, phone, email)")
          .in("id", ids("job"))
      : Promise.resolve({ data: [] }),
    ids("client").length
      ? supabase.from("ic_clients").select("id, name, phone, email, address").in("id", ids("client"))
      : Promise.resolve({ data: [] }),
    ids("lead").length
      ? supabase
          .from("ic_leads")
          .select("id, stage, created_at, ic_clients(name, phone, email)")
          .in("id", ids("lead"))
      : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of [...(jobs.data ?? []), ...(clients.data ?? []), ...(leads.data ?? [])]) {
    byId.set((row as { id: string }).id, row as Record<string, unknown>);
  }
  return candidates.map((c) => ({ ...c, target: byId.get(c.target_id) ?? null }));
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const leadId = new URL(request.url).searchParams.get("lead_id");
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_lead_match_candidates")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (leadId) query = query.eq("lead_id", leadId);
  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) return NextResponse.json({ ok: true, matches: [] });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, matches: await describeTargets((data ?? []) as Candidate[]) });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { id?: string; action?: string } | null;
  if (!body?.id || (body.action !== "link" && body.action !== "keep_separate")) {
    return NextResponse.json({ ok: false, error: "Need id and action (link | keep_separate)." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const actorId = (await cookies()).get(IC_STAFF_ID_COOKIE)?.value ?? null;
  const { data: match, error } = await supabase
    .from("ic_lead_match_candidates")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();
  if (error || !match) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Match not found." }, { status: 404 });
  }
  const candidate = match as Candidate;
  const now = new Date().toISOString();

  if (body.action === "link") {
    if (candidate.target_type === "job") {
      const { data: lead } = await supabase
        .from("ic_leads")
        .select("client_id")
        .eq("id", candidate.lead_id)
        .maybeSingle();
      const { error: linkError } = await supabase
        .from("ic_jobs")
        .update({ lead_id: candidate.lead_id, updated_at: now })
        .eq("id", candidate.target_id);
      if (linkError) return NextResponse.json({ ok: false, error: linkError.message }, { status: 500 });
      if (lead?.client_id) {
        await supabase
          .from("ic_leads")
          .update({ converted_job_id: candidate.target_id, updated_at: now })
          .eq("id", candidate.lead_id)
          .is("converted_job_id", null);
      }
    } else if (candidate.target_type === "client") {
      await supabase
        .from("ic_leads")
        .update({ client_id: candidate.target_id, updated_at: now })
        .eq("id", candidate.lead_id);
    } else {
      await supabase
        .from("ic_leads")
        .update({
          stage: "duplicate",
          stage_raw: `Duplicate of lead ${candidate.target_id}`,
          updated_at: now,
        })
        .eq("id", candidate.lead_id);
    }
  }

  const { error: resolveError } = await supabase
    .from("ic_lead_match_candidates")
    .update({
      status: body.action === "link" ? "linked" : "kept_separate",
      resolved_by: actorId,
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", candidate.id);
  if (resolveError) return NextResponse.json({ ok: false, error: resolveError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
