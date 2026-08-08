import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  FIELD_JOB_STAGES,
  IC_STAFF_ID_COOKIE,
} from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const installerId = cookieStore.get(IC_STAFF_ID_COOKIE)?.value;
  if (!installerId) {
    return NextResponse.json({ ok: false, error: "Sign in as a driver first." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const [{ data: jobs, error }, { data: openClocks }, { data: clients }, { data: staff }] =
    await Promise.all([
      supabase
        .from("ic_jobs")
        .select("*")
        .is("deleted_at", null)
        .in("stage", [...FIELD_JOB_STAGES, "install_complete", "final_payment"])
        .order("install_date", { ascending: true, nullsFirst: false })
        .limit(200),
      supabase
        .from("ic_time_entries")
        .select("*")
        .eq("installer_id", installerId)
        .is("clock_out_at", null),
      supabase.from("ic_clients").select("id, name, address, phone").is("deleted_at", null),
      supabase
        .from("ic_staff")
        .select("id, name")
        .eq("id", installerId)
        .maybeSingle(),
    ]);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const clientsById = new Map((clients ?? []).map((client) => [client.id, client]));
  const openClockByJob = new Map(
    (openClocks ?? []).map((entry) => [entry.job_id, entry]),
  );

  const enriched = (jobs ?? [])
    .filter((job) => {
      // Prefer jobs assigned to this installer; also show unassigned install-ready jobs.
      if (job.installer_id === installerId) return true;
      if (
        !job.installer_id &&
        (FIELD_JOB_STAGES as readonly string[]).includes(job.stage as string)
      ) {
        return true;
      }
      return false;
    })
    .map((job) => ({
      ...job,
      client: job.client_id ? clientsById.get(job.client_id) ?? null : null,
      openClock: openClockByJob.get(job.id) ?? null,
      mine: job.installer_id === installerId,
    }));

  return NextResponse.json({
    ok: true,
    installer: staff ?? { id: installerId, name: "Driver" },
    jobs: enriched,
  });
}

/** Claim a job / set installer + move to install_in_progress optional. */
export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const installerId = cookieStore.get(IC_STAFF_ID_COOKIE)?.value;
  if (!installerId) {
    return NextResponse.json({ ok: false, error: "Sign in as a driver first." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  const action = typeof body.action === "string" ? body.action : "claim";
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "job_id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: job, error: findError } = await supabase
    .from("ic_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  }

  if (action === "claim") {
    const { data, error } = await supabase
      .from("ic_jobs")
      .update({
        installer_id: installerId,
        stage: job.stage === "install_scheduled" ? "install_in_progress" : job.stage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    await supabase.from("ic_activity_log").insert({
      entity_type: "job",
      entity_id: jobId,
      action: "claimed_by_installer",
      actor_id: installerId,
      changes: { installer_id: installerId },
    });
    return NextResponse.json({ ok: true, job: data });
  }

  if (action === "complete") {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("ic_jobs")
      .update({
        installer_id: installerId,
        stage: "install_complete",
        completed_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Auto clock-out any open entry on this job for this installer.
    await supabase
      .from("ic_time_entries")
      .update({ clock_out_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("installer_id", installerId)
      .is("clock_out_at", null);

    await supabase.from("ic_activity_log").insert({
      entity_type: "job",
      entity_id: jobId,
      action: "install_completed",
      actor_id: installerId,
      changes: { stage: { from: job.stage, to: "install_complete" } },
    });

    return NextResponse.json({
      ok: true,
      job: data,
      next: "final_payment",
      message: "Install marked complete. Final 10% payment can be triggered from ops/billing.",
    });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
