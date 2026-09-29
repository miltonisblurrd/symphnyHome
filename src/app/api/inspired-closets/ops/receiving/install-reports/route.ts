import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  attachInstallReport,
  ingestInstallReport,
  missingInstallReportTable,
} from "@/lib/inspired-closets-ops-install-report";

export const runtime = "nodejs";
export const maxDuration = 120;

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const jobId = new URL(request.url).searchParams.get("jobId");
  const supabase = getSupabaseAdmin();
  let query = supabase.from("ic_install_reports").select("*").order("created_at", { ascending: false });
  if (jobId) query = query.eq("job_id", jobId);
  else query = query.limit(80);
  const { data, error } = await query;
  if (error) {
    if (missingInstallReportTable(error.message)) {
      return NextResponse.json({
        ok: true,
        reports: [],
        hint: "Run drizzle/0031_ic_install_reports.sql in Supabase.",
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reports: data ?? [] });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
    }
    const reportId = typeof body.id === "string" ? body.id : "";
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    if (!reportId || !jobId) {
      return NextResponse.json({ ok: false, error: "id and job_id are required." }, { status: 400 });
    }
    try {
      const report = await attachInstallReport({ reportId, jobId });
      return NextResponse.json({ ok: true, report });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not attach install report.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose the install report PDF." }, { status: 400 });
  }
  try {
    const saved = await ingestInstallReport({
      filename: file.name,
      mimeType: file.type || "application/pdf",
      bytes: Buffer.from(await file.arrayBuffer()),
      actorId: await actorId(),
    });
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the install report.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
