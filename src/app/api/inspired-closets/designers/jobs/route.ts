import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { getDesigner } from "@/lib/inspired-closets-designer-auth";
import { notifyDesignReady } from "@/lib/inspired-closets-ops-handoffs";
import { listJobPhotos } from "@/lib/inspired-closets-ops-media";
import { stageLabel } from "@/lib/inspired-closets-ops-jobs";

export const runtime = "nodejs";

const PAST_DESIGN = new Set([
  "install_scheduled",
  "install_in_progress",
  "install_complete",
  "final_payment",
  "closed",
  "cancelled",
]);

const BEFORE_ORDER = new Set([
  "lead",
  "consultation",
  "quoted",
  "deposit_pending",
  "deposit_received",
  "job_check",
]);

async function loadOwnedJob(jobId: string, designerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_jobs")
    .select("*")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message, job: null };
  if (!data || data.designer_id !== designerId) return { error: "That job is not assigned to you.", job: null };
  return { error: null, job: data };
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const designer = await getDesigner();
  if (!designer) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });

  const owned = await loadOwnedJob(id, designer.id);
  if (!owned.job) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const [clientResult, installerResult, photos] = await Promise.all([
    owned.job.client_id
      ? supabase.from("ic_clients").select("id, name, phone, address").eq("id", owned.job.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    owned.job.installer_id
      ? supabase.from("ic_staff").select("id, name").eq("id", owned.job.installer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    listJobPhotos(id).catch(() => []),
  ]);

  return NextResponse.json({
    ok: true,
    job: {
      ...owned.job,
      stage_label: stageLabel(owned.job.stage),
      client: clientResult.data ?? null,
      installer: installerResult.data ?? null,
    },
    photos,
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const designer = await getDesigner();
  if (!designer) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });

  const owned = await loadOwnedJob(id, designer.id);
  if (!owned.job) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  if (action === "grade") {
    const grade = typeof body.grade === "number" ? body.grade : Number(body.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 5) {
      return NextResponse.json({ ok: false, error: "Grade must be a whole number from 1 to 5." }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim() || null : null;
    const { data, error } = await supabase
      .from("ic_jobs")
      .update({
        install_grade: grade,
        install_grade_note: note,
        install_graded_by: designer.id,
        install_graded_at: now,
        updated_at: now,
        updated_by: designer.id,
      })
      .eq("id", id)
      .select("id, install_grade, install_grade_note, install_graded_at")
      .single();
    if (error) {
      const missing = /install_grade|skip_job_check|column|schema cache/i.test(error.message);
      return NextResponse.json(
        {
          ok: false,
          error: missing
            ? "Run drizzle/0028_ic_called_in_design.sql in Supabase first."
            : error.message,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, job: data });
  }

  if (action === "design_done") {
    const choice = body.choice === "skip" ? "skip" : body.choice === "job_check" ? "job_check" : null;
    if (!choice) {
      return NextResponse.json(
        { ok: false, error: "Choose job check or a simple closet." },
        { status: 400 },
      );
    }
    if (PAST_DESIGN.has(owned.job.stage)) {
      return NextResponse.json(
        { ok: false, error: "This job is already past design." },
        { status: 409 },
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: now,
      updated_by: designer.id,
      skip_job_check: choice === "skip",
    };
    if (choice === "job_check" && BEFORE_ORDER.has(owned.job.stage)) {
      updates.stage = "job_check";
    }
    if (choice === "skip" && BEFORE_ORDER.has(owned.job.stage)) {
      updates.stage = "ordered";
      updates.ready_to_order = true;
    }

    const { data, error } = await supabase.from("ic_jobs").update(updates).eq("id", id).select("*").single();
    if (error) {
      const missing = /install_grade|skip_job_check|column|schema cache/i.test(error.message);
      return NextResponse.json(
        {
          ok: false,
          error: missing
            ? "Run drizzle/0028_ic_called_in_design.sql in Supabase first."
            : error.message,
        },
        { status: 500 },
      );
    }

    const { data: client } = owned.job.client_id
      ? await supabase.from("ic_clients").select("name").eq("id", owned.job.client_id).maybeSingle()
      : { data: null };
    await notifyDesignReady({
      clientName: client?.name ?? "Client",
      designerName: designer.name,
      jobId: id,
      choice,
    });

    return NextResponse.json({ ok: true, job: data });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
