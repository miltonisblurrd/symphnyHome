import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { getDesigner } from "@/lib/inspired-closets-designer-auth";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const designer = await getDesigner();
  if (!designer) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const [leadsResult, appointmentsResult, clientsResult] = await Promise.all([
    supabase
      .from("ic_leads")
      .select("id, client_id, first_name, last_name, stage, source, notes, updated_at, converted_job_id")
      .eq("designer_id", designer.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("ic_appointments")
      .select("id, lead_id, job_id, client_id, kind, subject, scheduled_at, status, location_text")
      .eq("designer_id", designer.id)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true })
      .limit(80),
    supabase.from("ic_clients").select("id, name").is("deleted_at", null).limit(3000),
  ]);

  let jobsResult = await supabase
    .from("ic_jobs")
    .select(
      "id, client_id, title, stage, notes, field_notes, install_date, sold_date, install_grade, skip_job_check, ready_to_order",
    )
    .eq("designer_id", designer.id)
    .is("deleted_at", null)
    .order("sold_date", { ascending: false, nullsFirst: false })
    .limit(200);
  if (jobsResult.error && /install_grade|skip_job_check|column|schema cache/i.test(jobsResult.error.message)) {
    const fallback = await supabase
      .from("ic_jobs")
      .select("id, client_id, title, stage, notes, field_notes, install_date, sold_date, ready_to_order")
      .eq("designer_id", designer.id)
      .is("deleted_at", null)
      .order("sold_date", { ascending: false, nullsFirst: false })
      .limit(200);
    jobsResult = fallback as unknown as typeof jobsResult;
  }

  if (leadsResult.error) {
    return NextResponse.json({ ok: false, error: leadsResult.error.message }, { status: 500 });
  }
  if (jobsResult.error) {
    return NextResponse.json({ ok: false, error: jobsResult.error.message }, { status: 500 });
  }

  const clients = new Map((clientsResult.data ?? []).map((row) => [row.id, row.name as string]));
  const nameFor = (clientId: string | null, first?: string | null, last?: string | null) => {
    const fromClient = clientId ? clients.get(clientId) : null;
    if (fromClient) return fromClient;
    return [first, last].filter(Boolean).join(" ") || "Client";
  };

  return NextResponse.json({
    ok: true,
    designer,
    leads: (leadsResult.data ?? []).map((lead) => ({
      ...lead,
      client_name: nameFor(lead.client_id, lead.first_name, lead.last_name),
    })),
    jobs: (jobsResult.data ?? []).map((job) => ({
      ...job,
      client_name: nameFor(job.client_id),
    })),
    appointments: (appointmentsResult.data ?? []).map((row) => ({
      ...row,
      client_name: nameFor(row.client_id),
    })),
  });
}
