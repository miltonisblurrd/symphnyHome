import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE, IC_STAFF_ROLE_COOKIE } from "@/lib/inspired-closets-ops-field";
import { isInventoryRole } from "@/lib/inspired-closets-ops-roles";
import { loadWarehouseKit } from "@/lib/inspired-closets-ops-warehouse-data";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const jar = await cookies();
  const role = jar.get(IC_STAFF_ROLE_COOKIE)?.value ?? null;
  if (isInventoryRole(role)) {
    return NextResponse.json(
      { ok: false, error: "Your login is limited to Inventory and Receiving." },
      { status: 403 },
    );
  }
  const staffId = jar.get(IC_STAFF_ID_COOKIE)?.value ?? "";
  if (!staffId) {
    return NextResponse.json({ ok: false, error: "Sign in to use the warehouse." }, { status: 401 });
  }

  const { id: jobId } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  const captionRaw = String(form.get("caption") ?? "").trim();
  const caption = captionRaw || "Whole pile";

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose a photo of the pile." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Keep the photo under 8 MB." }, { status: 400 });
  }
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Use a photo of the pile." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: job, error: jobError } = await supabase
    .from("ic_jobs")
    .select("id")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (jobError) return NextResponse.json({ ok: false, error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${jobId}/pile-${Date.now()}-${staffId.slice(0, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json(
      { ok: false, error: `Upload failed: ${uploadError.message}. Confirm storage bucket ic-field-media exists.` },
      { status: 500 },
    );
  }

  const { data: signed } = await supabase.storage.from("ic-field-media").createSignedUrl(path, 60 * 60 * 12);
  const publicUrl = signed?.signedUrl ?? supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl;
  const { error: insertError } = await supabase.from("ic_job_media").insert({
    job_id: jobId,
    installer_id: staffId,
    kind: "staging",
    storage_path: path,
    public_url: publicUrl,
    caption,
    mime_type: file.type || null,
    bytes: file.size,
  });
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const kit = await loadWarehouseKit(jobId);
  if (!kit.ok) {
    return NextResponse.json({ ok: false, error: kit.error, hint: kit.hint }, { status: kit.status });
  }
  return NextResponse.json({ ok: true, job: kit.job });
}
