import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";
import { insertFieldNotice, notifyCrewRequest } from "@/lib/inspired-closets-field-home";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const [{ data: crew }, { data: staff }, { data: job }] = await Promise.all([
    supabase
      .from("ic_job_crew")
      .select("id, job_id, installer_id, status, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase.from("ic_staff").select("id, name, role, active").eq("role", "installer").eq("active", true),
    supabase.from("ic_jobs").select("id, installer_id, client_id").eq("id", jobId).maybeSingle(),
  ]);
  const staffById = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const people = (crew ?? []).map((row) => ({
    ...row,
    name: staffById.get(row.installer_id) ?? "Installer",
  }));
  if (job?.installer_id && !people.some((p) => p.installer_id === job.installer_id && p.status === "approved")) {
    people.unshift({
      id: `lead-${job.installer_id}`,
      job_id: jobId,
      installer_id: job.installer_id,
      status: "approved",
      created_at: "",
      name: staffById.get(job.installer_id) ?? "Lead",
    });
  }
  return NextResponse.json({
    ok: true,
    crew: people,
    installers: (staff ?? []).filter((s) => s.id !== auth.installer.id).map((s) => ({ id: s.id, name: s.name })),
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const helperId = typeof body.installer_id === "string" ? body.installer_id : "";
  if (!jobId || !helperId) {
    return NextResponse.json({ ok: false, error: "Pick an installer." }, { status: 400 });
  }
  if (helperId === auth.installer.id) {
    return NextResponse.json({ ok: false, error: "That’s you." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const [{ data: job }, { data: helper }] = await Promise.all([
    supabase.from("ic_jobs").select("id, client_id, installer_id").eq("id", jobId).maybeSingle(),
    supabase.from("ic_staff").select("id, name").eq("id", helperId).maybeSingle(),
  ]);
  if (!job || !helper) {
    return NextResponse.json({ ok: false, error: "Job or installer not found." }, { status: 404 });
  }
  const { data: clientRow } = job.client_id
    ? await supabase.from("ic_clients").select("name").eq("id", job.client_id).maybeSingle()
    : { data: null };

  const { data, error } = await supabase
    .from("ic_job_crew")
    .upsert(
      {
        job_id: jobId,
        installer_id: helperId,
        status: "requested",
        requested_by: auth.installer.id,
      },
      { onConflict: "job_id,installer_id" },
    )
    .select("id, job_id, installer_id, status")
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Could not request." }, { status: 500 });
  }

  const clientName = clientRow?.name ?? "this job";
  await insertFieldNotice({
    installerId: auth.installer.id,
    kind: "crew",
    title: `Asked for ${helper.name}`,
    body: `Waiting on Craig, Des, and Gavin for ${clientName}.`,
    relatedId: data.id,
  });
  await notifyCrewRequest({
    requesterName: auth.installer.name,
    helperName: helper.name,
    clientName,
    requestId: data.id,
  });
  return NextResponse.json({ ok: true, request: data });
}
