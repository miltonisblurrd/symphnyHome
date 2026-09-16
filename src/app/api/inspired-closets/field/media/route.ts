import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";

export const runtime = "nodejs";
export const maxDuration = 60;

function mediaKind(value: unknown): string {
  const kind = typeof value === "string" ? value : "other";
  return ["before", "during", "after", "issue", "staging", "other"].includes(kind) ? kind : "other";
}

async function signedMediaUrl(storagePath: string | null | undefined, fallback: string | null) {
  if (!storagePath) return fallback;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage.from("ic-field-media").createSignedUrl(storagePath, 60 * 60 * 12);
  return data?.signedUrl ?? fallback;
}

async function saveMediaRow(input: {
  jobId: string;
  installerId: string;
  kind: string;
  path: string;
  caption: string | null;
  mimeType: string | null;
  bytes: number | null;
}) {
  const supabase = getSupabaseAdmin();
  const publicUrl = await signedMediaUrl(
    input.path,
    supabase.storage.from("ic-field-media").getPublicUrl(input.path).data.publicUrl,
  );
  const { data, error } = await supabase
    .from("ic_job_media")
    .insert({
      job_id: input.jobId,
      installer_id: input.installerId,
      kind: input.kind,
      storage_path: input.path,
      public_url: publicUrl,
      caption: input.caption,
      mime_type: input.mimeType,
      bytes: input.bytes,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("ic_activity_log").insert({
    entity_type: "job_media",
    entity_id: data.id,
    action: "uploaded",
    actor_id: input.installerId,
    changes: { job_id: input.jobId, kind: input.kind },
  });
  return { ...data, public_url: publicUrl };
}

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
  const { data, error } = await supabase
    .from("ic_job_media")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const media = await Promise.all(
    (data ?? []).map(async (row) => ({
      ...row,
      public_url: await signedMediaUrl(row.storage_path, row.public_url),
    })),
  );

  return NextResponse.json({ ok: true, media });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  const installerId = auth.installer.id;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
    }
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    if (!jobId) {
      return NextResponse.json({ ok: false, error: "job_id is required." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    if (body.action === "prepare") {
      const ext =
        typeof body.ext === "string" && /^[a-z0-9]{2,5}$/i.test(body.ext) ? body.ext.toLowerCase() : "jpg";
      const path = `${jobId}/${Date.now()}-${installerId.slice(0, 8)}.${ext}`;
      const { data, error } = await supabase.storage.from("ic-field-media").createSignedUploadUrl(path);
      if (error || !data?.signedUrl) {
        return NextResponse.json(
          { ok: false, error: error?.message ?? "Could not start photo upload." },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, path, token: data.token, signedUrl: data.signedUrl });
    }
    if (body.action === "complete") {
      const path = typeof body.path === "string" ? body.path : "";
      if (!path.startsWith(`${jobId}/`)) {
        return NextResponse.json({ ok: false, error: "path is required." }, { status: 400 });
      }
      try {
        const media = await saveMediaRow({
          jobId,
          installerId,
          kind: mediaKind(body.kind),
          path,
          caption: typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null,
          mimeType: typeof body.mime_type === "string" ? body.mime_type : null,
          bytes: typeof body.bytes === "number" ? body.bytes : null,
        });
        return NextResponse.json({ ok: true, media });
      } catch (error) {
        return NextResponse.json(
          { ok: false, error: error instanceof Error ? error.message : "Could not save photo." },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const form = await request.formData();
  const jobId = String(form.get("job_id") ?? "");
  const kind = mediaKind(form.get("kind"));
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

  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, buffer, {
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

  try {
    const media = await saveMediaRow({
      jobId,
      installerId,
      kind,
      path,
      caption,
      mimeType: file.type || null,
      bytes: file.size,
    });
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save photo." },
      { status: 500 },
    );
  }
}
