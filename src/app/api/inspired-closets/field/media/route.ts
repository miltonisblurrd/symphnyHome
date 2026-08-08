import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_job_media")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, media: data ?? [] });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const installerId = cookieStore.get(IC_STAFF_ID_COOKIE)?.value;
  if (!installerId) {
    return NextResponse.json({ ok: false, error: "Sign in as a driver first." }, { status: 401 });
  }

  const form = await request.formData();
  const jobId = String(form.get("job_id") ?? "");
  const kind = String(form.get("kind") ?? "other");
  const caption = String(form.get("caption") ?? "") || null;
  const file = form.get("file");

  if (!jobId || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "job_id and file are required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${jobId}/${Date.now()}-${installerId.slice(0, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("ic-field-media")
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Upload failed: ${uploadError.message}. Confirm storage bucket ic-field-media exists.`,
      },
      { status: 500 },
    );
  }

  const { data: publicData } = supabase.storage.from("ic-field-media").getPublicUrl(path);

  const { data, error } = await supabase
    .from("ic_job_media")
    .insert({
      job_id: jobId,
      installer_id: installerId,
      kind,
      storage_path: path,
      public_url: publicData.publicUrl,
      caption,
      mime_type: file.type || null,
      bytes: file.size,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "job_media",
    entity_id: data.id,
    action: "uploaded",
    actor_id: installerId,
    changes: { job_id: jobId, kind },
  });

  return NextResponse.json({ ok: true, media: data });
}
