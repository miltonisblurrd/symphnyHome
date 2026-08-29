import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;

  const jobId = new URL(request.url).searchParams.get("jobId");
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_field_issues")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, issues: data ?? [] });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  const installerId = auth.installer.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const issueType = typeof body.issue_type === "string" ? body.issue_type : "other";
  const mediaId = typeof body.media_id === "string" ? body.media_id : null;

  if (!jobId || !description) {
    return NextResponse.json(
      { ok: false, error: "job_id and description are required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_field_issues")
    .insert({
      job_id: jobId,
      installer_id: installerId,
      issue_type: issueType,
      description,
      media_id: mediaId,
      status: "open",
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase
    .from("ic_jobs")
    .update({ risk_flag: true, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  await supabase.from("ic_activity_log").insert({
    entity_type: "field_issue",
    entity_id: data.id,
    action: "reported",
    actor_id: installerId,
    changes: { job_id: jobId, issue_type: issueType },
  });

  return NextResponse.json({ ok: true, issue: data });
}
