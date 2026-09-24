import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { getDesigner } from "@/lib/inspired-closets-designer-auth";
import { notifyDesignReady } from "@/lib/inspired-closets-ops-handoffs";
import { listJobPhotos, mediaKindLabel } from "@/lib/inspired-closets-ops-media";
import { stageLabel } from "@/lib/inspired-closets-ops-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const PHOTO_KINDS = new Set(["before", "during", "after", "issue", "staging", "other"]);

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

  let proposalUrl = typeof owned.job.proposal_url === "string" ? owned.job.proposal_url : null;
  const proposalPath = typeof owned.job.proposal_path === "string" ? owned.job.proposal_path : null;
  if (proposalPath) {
    const { data: signed } = await supabase.storage.from("ic-field-media").createSignedUrl(proposalPath, 60 * 60 * 12);
    proposalUrl = signed?.signedUrl ?? proposalUrl;
  }

  return NextResponse.json({
    ok: true,
    job: {
      ...owned.job,
      proposal_url: proposalUrl,
      stage_label: stageLabel(owned.job.stage),
      client: clientResult.data ?? null,
      installer: installerResult.data ?? null,
    },
    photos,
  });
}

function fileExt(name: string, mime: string): string {
  const raw = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (raw && raw.length <= 5) return raw;
  if (mime === "application/pdf") return "pdf";
  return "jpg";
}

async function uploadDesignerProposal(form: FormData, designer: { id: string; name: string }) {
  const jobId = String(form.get("id") ?? "");
  const file = form.get("file");
  if (!jobId || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Job and file are required." }, { status: 400 });
  }
  const owned = await loadOwnedJob(jobId, designer.id);
  if (!owned.job) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const mime = file.type || "";
  const isPdf = mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = mime.startsWith("image/");
  if (!isPdf && !isImage) {
    return NextResponse.json({ ok: false, error: "The proposal needs to be a PDF or a photo." }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Keep the proposal under 20 MB." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const path = `proposals/${jobId}/${Date.now()}.${fileExt(file.name, isPdf ? "application/pdf" : mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = isPdf ? "application/pdf" : mime || "image/jpeg";
  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: signed } = await supabase.storage.from("ic-field-media").createSignedUrl(path, 60 * 60 * 12);
  const publicUrl =
    signed?.signedUrl ?? supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ic_jobs")
    .update({
      proposal_url: supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl,
      proposal_path: path,
      proposal_filename: file.name,
      updated_at: now,
      updated_by: designer.id,
    })
    .eq("id", jobId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: jobId,
    action: "proposal_uploaded",
    actor_id: designer.id,
    changes: { filename: file.name },
  });

  return NextResponse.json({
    ok: true,
    proposal_url: publicUrl,
    proposal_filename: file.name,
  });
}

async function uploadDesignerMedia(form: FormData, designer: { id: string; name: string }) {
  const jobId = String(form.get("id") ?? "");
  const kindRaw = String(form.get("kind") ?? "other");
  const kind = PHOTO_KINDS.has(kindRaw) ? kindRaw : "other";
  const caption = String(form.get("caption") ?? "").trim() || null;
  const file = form.get("file");
  if (!jobId || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Job and file are required." }, { status: 400 });
  }

  const owned = await loadOwnedJob(jobId, designer.id);
  if (!owned.job) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const mime = file.type || "";
  const isPdf = mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = mime.startsWith("image/");
  if (!isImage && !isPdf) {
    return NextResponse.json({ ok: false, error: "Add a photo or a PDF." }, { status: 400 });
  }
  if (file.size > 12 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Keep each file under 12 MB." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const path = `${jobId}/${Date.now()}-${designer.id.slice(0, 8)}.${fileExt(file.name, isPdf ? "application/pdf" : mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = isPdf ? "application/pdf" : mime || "image/jpeg";
  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: signed } = await supabase.storage.from("ic-field-media").createSignedUrl(path, 60 * 60 * 12);
  const publicUrl =
    signed?.signedUrl ?? supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabase
    .from("ic_job_media")
    .insert({
      job_id: jobId,
      installer_id: designer.id,
      kind,
      storage_path: path,
      public_url: publicUrl,
      caption,
      mime_type: contentType,
      bytes: file.size,
    })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await supabase.from("ic_activity_log").insert({
    entity_type: "job_media",
    entity_id: data.id,
    action: "uploaded",
    actor_id: designer.id,
    changes: { job_id: jobId, kind },
  });

  return NextResponse.json({
    ok: true,
    photo: {
      id: data.id,
      kind,
      kind_label: mediaKindLabel(kind),
      caption,
      created_at: data.created_at,
      public_url: publicUrl,
      mime_type: contentType,
      installer_name: designer.name,
    },
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const designer = await getDesigner();
  if (!designer) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (String(form.get("action") ?? "") === "proposal") {
      return uploadDesignerProposal(form, designer);
    }
    return uploadDesignerMedia(form, designer);
  }

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

  if (action === "notes") {
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const { data, error } = await supabase
      .from("ic_jobs")
      .update({ designer_notes: notes || null, updated_at: now, updated_by: designer.id })
      .eq("id", id)
      .select("id, designer_notes")
      .single();
    if (error) {
      const missing = /designer_notes|column|schema cache/i.test(error.message);
      return NextResponse.json(
        {
          ok: false,
          error: missing ? "Run drizzle/0029_ic_designer_notes.sql in Supabase first." : error.message,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, job: data });
  }

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
      design_ready_at: now,
      design_ready_choice: choice,
    };
    if (choice === "job_check" && BEFORE_ORDER.has(owned.job.stage)) {
      updates.stage = "job_check";
    }
    if (choice === "skip" && BEFORE_ORDER.has(owned.job.stage)) {
      updates.stage = "ordered";
      updates.ready_to_order = true;
    }

    let saved = await supabase.from("ic_jobs").update(updates).eq("id", id).select("*").single();
    if (saved.error && /design_ready|column|schema cache/i.test(saved.error.message)) {
      const withoutReady = { ...updates };
      delete withoutReady.design_ready_at;
      delete withoutReady.design_ready_choice;
      saved = await supabase.from("ic_jobs").update(withoutReady).eq("id", id).select("*").single();
    }
    const { data, error } = saved;
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
