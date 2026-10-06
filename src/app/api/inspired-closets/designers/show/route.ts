import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { getDesigner } from "@/lib/inspired-closets-designer-auth";
import {
  listShowProjects,
  SHOW_SQL_HINT,
  SHOW_TOGGLE_SQL_HINT,
  showCardLabel,
  showDefaultLabel,
} from "@/lib/inspired-closets-show";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "ic-field-media";
const MAX_PHOTOS = 24;
const MAX_BYTES = 12 * 1024 * 1024;
const MISSING = /relation|does not exist|schema cache|show_label|ic_show_photos/i;

type Designer = { id: string; name: string };

function sqlHint(message: string): string {
  return MISSING.test(message) ? SHOW_SQL_HINT : message;
}

function fileExt(name: string, mime: string): string {
  const raw = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (raw && raw.length <= 5 && /^(jpe?g|png|webp|gif|heic|heif)$/.test(raw)) return raw === "jpeg" ? "jpg" : raw;
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

function contentTypeFor(file: File, ext: string): string {
  if (file.type.startsWith("image/")) return file.type;
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

async function loadOwnedJob(jobId: string, designerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_jobs")
    .select("id, designer_id, client_id, title, deleted_at")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: sqlHint(error.message), job: null };
  if (!data || data.designer_id !== designerId) return { error: "That job is not assigned to you.", job: null };
  return { error: null, job: data };
}

async function loadOwnedPhoto(photoId: string, designerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("ic_show_photos").select("*").eq("id", photoId).maybeSingle();
  if (error) return { error: sqlHint(error.message), photo: null };
  if (!data || data.designer_id !== designerId) return { error: "That photo is not on your show.", photo: null };
  const owned = await loadOwnedJob(data.job_id, designerId);
  if (!owned.job) return { error: owned.error ?? "That job is not assigned to you.", photo: null };
  return { error: null, photo: data };
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const designer = await getDesigner();
  if (!designer) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const listed = await listShowProjects(designer.id);
  if (!listed.ok) return NextResponse.json({ ok: false, error: listed.error }, { status: 500 });
  return NextResponse.json({ ok: true, projects: listed.projects, error: listed.error ?? null });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const designer = await getDesigner();
  if (!designer) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return uploadShowPhoto(await request.formData(), designer);
  }

  let body: {
    action?: string;
    id?: string;
    photoId?: string;
    label?: string;
    caption?: string;
    visible?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (body.action === "cover") return setCover(body.photoId ?? "", designer);
  if (body.action === "delete") return removePhoto(body.photoId ?? "", designer);
  if (body.action === "caption") return setCaption(body.photoId ?? "", body.caption ?? "", designer);
  if (body.action === "label") return setLabel(body.id ?? "", body.label ?? "", designer);
  if (body.action === "visibility") return setVisibility(body.id ?? "", Boolean(body.visible), designer);
  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}

async function uploadShowPhoto(form: FormData, designer: Designer) {
  const jobId = String(form.get("id") ?? "");
  const file = form.get("file");
  const captionRaw = String(form.get("caption") ?? "").trim();
  if (!jobId || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose a job and a photo." }, { status: 400 });
  }

  const owned = await loadOwnedJob(jobId, designer.id);
  if (!owned.job) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const name = file.name.toLowerCase();
  const mime = file.type || "";
  const looksLikeImage = mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(name);
  if (!looksLikeImage || mime === "application/pdf" || name.endsWith(".pdf")) {
    return NextResponse.json(
      { ok: false, error: "Add a photo. The proposal stays on the job." },
      { status: 400 },
    );
  }
  if (file.size <= 0) {
    return NextResponse.json({ ok: false, error: "That photo was empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Keep each photo under 12 MB." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase
    .from("ic_show_photos")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("designer_id", designer.id);
  if (countError) return NextResponse.json({ ok: false, error: sqlHint(countError.message) }, { status: 500 });
  if ((count ?? 0) >= MAX_PHOTOS) {
    return NextResponse.json({ ok: false, error: "This project already has 24 photos." }, { status: 400 });
  }

  const { data: latest } = await supabase
    .from("ic_show_photos")
    .select("sort_order")
    .eq("job_id", jobId)
    .eq("designer_id", designer.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ext = fileExt(file.name, mime);
  const path = `show/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: contentTypeFor(file, ext),
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const isFirst = (count ?? 0) === 0;
  const sortOrder = (typeof latest?.sort_order === "number" ? latest.sort_order : -1) + 1;
  const inserted = await supabase
    .from("ic_show_photos")
    .insert({
      job_id: jobId,
      designer_id: designer.id,
      storage_path: path,
      caption: captionRaw ? captionRaw.slice(0, 160) : null,
      sort_order: sortOrder,
      is_cover: isFirst,
      mime_type: contentTypeFor(file, ext),
      bytes: file.size,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    const duplicate = inserted.error && /duplicate|unique/i.test(inserted.error.message);
    if (!duplicate || !isFirst) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json(
        { ok: false, error: sqlHint(inserted.error?.message ?? "Could not save the photo.") },
        { status: 500 },
      );
    }
    const retry = await supabase
      .from("ic_show_photos")
      .insert({
        job_id: jobId,
        designer_id: designer.id,
        storage_path: path,
        caption: captionRaw ? captionRaw.slice(0, 160) : null,
        sort_order: sortOrder,
        is_cover: false,
        mime_type: contentTypeFor(file, ext),
        bytes: file.size,
      })
      .select("id")
      .single();
    if (retry.error || !retry.data) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json(
        { ok: false, error: sqlHint(retry.error?.message ?? "Could not save the photo.") },
        { status: 500 },
      );
    }
  }

  const { count: covers } = await supabase
    .from("ic_show_photos")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("designer_id", designer.id)
    .eq("is_cover", true);
  if (!covers) {
    const { data: first } = await supabase
      .from("ic_show_photos")
      .select("id")
      .eq("job_id", jobId)
      .eq("designer_id", designer.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (first?.id) {
      await supabase.from("ic_show_photos").update({ is_cover: true }).eq("id", first.id);
    }
  }

  return NextResponse.json({ ok: true });
}

async function setCover(photoId: string, designer: Designer) {
  if (!photoId) return NextResponse.json({ ok: false, error: "Pick a photo." }, { status: 400 });
  const owned = await loadOwnedPhoto(photoId, designer.id);
  if (!owned.photo) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const { error: clearError } = await supabase
    .from("ic_show_photos")
    .update({ is_cover: false })
    .eq("job_id", owned.photo.job_id)
    .eq("designer_id", designer.id)
    .neq("id", photoId);
  if (clearError) return NextResponse.json({ ok: false, error: sqlHint(clearError.message) }, { status: 500 });

  const { error } = await supabase.from("ic_show_photos").update({ is_cover: true }).eq("id", photoId);
  if (error) return NextResponse.json({ ok: false, error: sqlHint(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function removePhoto(photoId: string, designer: Designer) {
  if (!photoId) return NextResponse.json({ ok: false, error: "Pick a photo." }, { status: 400 });
  const owned = await loadOwnedPhoto(photoId, designer.id);
  if (!owned.photo) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("ic_show_photos").delete().eq("id", photoId);
  if (error) return NextResponse.json({ ok: false, error: sqlHint(error.message) }, { status: 500 });

  if (owned.photo.storage_path) {
    await supabase.storage.from(BUCKET).remove([owned.photo.storage_path]);
  }

  if (owned.photo.is_cover) {
    const { data: next } = await supabase
      .from("ic_show_photos")
      .select("id")
      .eq("job_id", owned.photo.job_id)
      .eq("designer_id", designer.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await supabase.from("ic_show_photos").update({ is_cover: true }).eq("id", next.id);
    }
  }

  return NextResponse.json({ ok: true });
}

async function setCaption(photoId: string, caption: string, designer: Designer) {
  if (!photoId) return NextResponse.json({ ok: false, error: "Pick a photo." }, { status: 400 });
  const owned = await loadOwnedPhoto(photoId, designer.id);
  if (!owned.photo) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const next = caption.trim().slice(0, 160);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ic_show_photos")
    .update({ caption: next || null })
    .eq("id", photoId);
  if (error) return NextResponse.json({ ok: false, error: sqlHint(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true, caption: next || null });
}

async function setLabel(jobId: string, label: string, designer: Designer) {
  if (!jobId) return NextResponse.json({ ok: false, error: "Choose a job." }, { status: 400 });
  const owned = await loadOwnedJob(jobId, designer.id);
  if (!owned.job) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const supabase = getSupabaseAdmin();
  let clientName: string | null = null;
  if (owned.job.client_id) {
    const { data: client } = await supabase
      .from("ic_clients")
      .select("name")
      .eq("id", owned.job.client_id)
      .maybeSingle();
    clientName = client?.name ?? null;
  }

  const trimmed = label.trim().slice(0, 80);
  const defaultLabel = showDefaultLabel({ title: owned.job.title, clientName });
  const stored = !trimmed || trimmed === defaultLabel ? null : trimmed;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ic_jobs")
    .update({ show_label: stored, updated_at: now, updated_by: designer.id })
    .eq("id", jobId);
  if (error) return NextResponse.json({ ok: false, error: sqlHint(error.message) }, { status: 500 });

  return NextResponse.json({
    ok: true,
    showLabel: stored,
    label: showCardLabel({ showLabel: stored, title: owned.job.title, clientName }),
  });
}

async function setVisibility(jobId: string, visible: boolean, designer: Designer) {
  if (!jobId) return NextResponse.json({ ok: false, error: "Choose a job." }, { status: 400 });
  const owned = await loadOwnedJob(jobId, designer.id);
  if (!owned.job) return NextResponse.json({ ok: false, error: owned.error }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ic_jobs")
    .update({ show_on: visible, updated_at: now, updated_by: designer.id })
    .eq("id", jobId);
  if (error) {
    const missing = /show_on|column|schema cache/i.test(error.message);
    return NextResponse.json({ ok: false, error: missing ? SHOW_TOGGLE_SQL_HINT : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, visible });
}
