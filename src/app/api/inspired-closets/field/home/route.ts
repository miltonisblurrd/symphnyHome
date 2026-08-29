import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";
import {
  FIELD_TEST_UPDATES,
  isFieldTestInstaller,
} from "@/lib/inspired-closets-field-test-seed";

export const runtime = "nodejs";

function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function minutesBetween(start: string, end: string | null): number {
  if (!end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 60000);
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;

  const installer = auth.installer;
  const supabase = getSupabaseAdmin();
  const weekStart = startOfWeek().toISOString();
  const { data: crewRows } = await supabase
    .from("ic_job_crew")
    .select("job_id")
    .eq("installer_id", installer.id)
    .eq("status", "approved");
  const crewJobIds = (crewRows ?? []).map((row) => row.job_id);

  const [
    { data: jobs },
    { data: clocks },
    { data: notices },
    { data: updates },
    { data: pay },
    { data: documents },
    { data: clients },
    { data: openClock },
  ] = await Promise.all([
    supabase
      .from("ic_jobs")
      .select("id, installer_id, stage, install_date, visit_window, notes, field_notes, client_id, job_kind")
      .or(
        crewJobIds.length
          ? `installer_id.eq.${installer.id},id.in.(${crewJobIds.join(",")})`
          : `installer_id.eq.${installer.id}`,
      )
      .is("deleted_at", null)
      .order("install_date", { ascending: true, nullsFirst: false })
      .limit(80),
    supabase
      .from("ic_time_entries")
      .select("id, job_id, clock_in_at, clock_out_at")
      .eq("installer_id", installer.id)
      .gte("clock_in_at", weekStart)
      .limit(200),
    supabase
      .from("ic_field_notices")
      .select("id, kind, title, body, related_id, read_at, created_at")
      .eq("installer_id", installer.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("ic_company_updates")
      .select("id, title, body, author_name, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("ic_staff_pay").select("*").eq("staff_id", installer.id).maybeSingle(),
    supabase
      .from("ic_staff_documents")
      .select("id, kind, title, public_url, staff_id, created_at")
      .or(`staff_id.eq.${installer.id},staff_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("ic_clients").select("id, name, address, phone").is("deleted_at", null),
    supabase
      .from("ic_time_entries")
      .select("id, job_id, clock_in_at")
      .eq("installer_id", installer.id)
      .is("clock_out_at", null)
      .limit(1)
      .maybeSingle(),
  ]);

  const clientsById = new Map((clients ?? []).map((c) => [c.id, c]));
  const activeStages = new Set(["install_scheduled", "install_in_progress", "ordered", "job_check"]);
  const mappedJobs = (jobs ?? []).map((job) => {
    const client = job.client_id ? clientsById.get(job.client_id) : null;
    return {
      id: job.id,
      stage: job.stage,
      installDate: job.install_date,
      visitWindow: job.visit_window,
      notes: job.notes,
      fieldNotes: job.field_notes,
      jobKind: job.job_kind,
      client: client ?? null,
    };
  });
  const nextJob =
    mappedJobs.find((job) => activeStages.has(job.stage)) ??
    mappedJobs.find((job) => job.installDate && job.installDate >= new Date().toISOString().slice(0, 10)) ??
    null;

  const weekMinutes = (clocks ?? []).reduce(
    (sum, row) => sum + minutesBetween(row.clock_in_at, row.clock_out_at),
    0,
  );

  return NextResponse.json({
    ok: true,
    installer,
    nextJob,
    onSiteNow: Boolean(openClock),
    hoursThisWeekMinutes: weekMinutes,
    notices: notices ?? [],
    unreadCount: (notices ?? []).filter((n) => !n.read_at).length,
    updates: isFieldTestInstaller(installer)
      ? [...FIELD_TEST_UPDATES, ...(updates ?? [])]
      : (updates ?? []),
    pay: pay ?? null,
    documents: documents ?? [],
  });
}

export async function PATCH(request: Request) {
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (body.action === "read_notices") {
    await supabase
      .from("ic_field_notices")
      .update({ read_at: new Date().toISOString() })
      .eq("installer_id", auth.installer.id)
      .is("read_at", null);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
