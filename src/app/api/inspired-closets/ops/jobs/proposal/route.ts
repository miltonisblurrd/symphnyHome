import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const form = await request.formData();
  const jobId = String(form.get("job_id") ?? "");
  const file = form.get("file");
  if (!jobId || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "job_id and file are required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const actorId = cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null;
  const supabase = getSupabaseAdmin();
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `proposals/${jobId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, buffer, {
    contentType: file.type || "application/pdf",
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

  const { data: pub } = supabase.storage.from("ic-field-media").getPublicUrl(path);
  const nowIso = new Date().toISOString();
  const { data: job, error } = await supabase
    .from("ic_jobs")
    .update({
      proposal_url: pub.publicUrl,
      proposal_path: path,
      proposal_filename: file.name,
      updated_at: nowIso,
      updated_by: actorId,
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) {
    if (/proposal_|column|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { ok: false, error: "Run drizzle/0015_ic_des_intake.sql so proposal files can save." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: jobId,
    action: "proposal_uploaded",
    actor_id: actorId,
    changes: { filename: file.name },
  });

  return NextResponse.json({ ok: true, job });
}
