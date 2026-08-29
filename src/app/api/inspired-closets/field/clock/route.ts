import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";

export const runtime = "nodejs";

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
  const action = body.action === "out" ? "out" : "in";
  const lat = typeof body.lat === "string" || typeof body.lat === "number" ? String(body.lat) : null;
  const lng = typeof body.lng === "string" || typeof body.lng === "number" ? String(body.lng) : null;
  const note = typeof body.note === "string" ? body.note : null;

  if (!jobId) {
    return NextResponse.json({ ok: false, error: "job_id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  if (action === "in") {
    const { data: existing } = await supabase
      .from("ic_time_entries")
      .select("id")
      .eq("installer_id", installerId)
      .is("clock_out_at", null)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Already clocked in on another job. Clock out first." },
        { status: 409 },
      );
    }

    // Claim job if unassigned.
    await supabase
      .from("ic_jobs")
      .update({
        installer_id: installerId,
        stage: "install_in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const { data, error } = await supabase
      .from("ic_time_entries")
      .insert({
        job_id: jobId,
        installer_id: installerId,
        clock_in_at: new Date().toISOString(),
        clock_in_lat: lat,
        clock_in_lng: lng,
        note,
      })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await supabase.from("ic_activity_log").insert({
      entity_type: "time_entry",
      entity_id: data.id,
      action: "clock_in",
      actor_id: installerId,
      changes: { job_id: jobId, lat, lng },
    });

    return NextResponse.json({ ok: true, entry: data });
  }

  const { data: open, error: findError } = await supabase
    .from("ic_time_entries")
    .select("*")
    .eq("installer_id", installerId)
    .eq("job_id", jobId)
    .is("clock_out_at", null)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!open) {
    return NextResponse.json({ ok: false, error: "No open clock-in for this job." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("ic_time_entries")
    .update({
      clock_out_at: new Date().toISOString(),
      clock_out_lat: lat,
      clock_out_lng: lng,
      note: note ?? open.note,
    })
    .eq("id", open.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "time_entry",
    entity_id: data.id,
    action: "clock_out",
    actor_id: installerId,
    changes: { job_id: jobId, lat, lng },
  });

  return NextResponse.json({ ok: true, entry: data });
}
