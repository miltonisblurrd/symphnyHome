import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { stageLabel as jobStageLabel } from "@/lib/inspired-closets-ops-jobs";
import { sourceLabel, stageLabel as leadStageLabel } from "@/lib/inspired-closets-ops-leads";

export const runtime = "nodejs";

const JOB_SELECT =
  "id, client_id, title, stage, job_kind, visit_window, notes, field_notes, designer_notes, install_date, install_grade, install_grade_note, design_ready_at, design_ready_choice, proposal_path, proposal_filename, proposal_url";

const JOB_SELECT_MID =
  "id, client_id, title, stage, job_kind, visit_window, notes, field_notes, install_date, install_grade, install_grade_note, proposal_path, proposal_filename, proposal_url";

type StaffRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  active: boolean;
  password_hash?: string | null;
};

type LeadRow = {
  id: string;
  designer_id: string | null;
  client_id: string | null;
  first_name: string | null;
  last_name: string | null;
  stage: string;
  source: string;
  notes: string | null;
  updated_at: string;
  converted_job_id: string | null;
};

type JobRow = {
  id: string;
  designer_id: string | null;
  client_id: string | null;
  title: string | null;
  stage: string;
  job_kind: string | null;
  visit_window: string | null;
  notes: string | null;
  field_notes?: string | null;
  designer_notes?: string | null;
  install_date: string | null;
  install_grade?: number | null;
  install_grade_note?: string | null;
  design_ready_at?: string | null;
  design_ready_choice?: string | null;
  proposal_path?: string | null;
  proposal_filename?: string | null;
  proposal_url?: string | null;
};

type ClientRow = { id: string; name: string; phone: string | null; address: string | null };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function clientName(client: ClientRow | null, first?: string | null, last?: string | null): string {
  if (client?.name) return client.name;
  return [first, last].filter(Boolean).join(" ") || "Client";
}

function frankLabel(choice: string | null | undefined, readyAt: string | null | undefined): string {
  if (!readyAt) return "Not sent to Frank yet";
  if (choice === "skip") return "Sent to Frank · simple closet, skip job check";
  if (choice === "job_check") return "Sent to Frank · needs a job check";
  return "Sent to Frank";
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const designerId = new URL(request.url).searchParams.get("id");
  const supabase = getSupabaseAdmin();

  const [staffResult, leadsResult, clientsResult] = await Promise.all([
    supabase
      .from("ic_staff")
      .select("id, name, phone, email, avatar_url, active, password_hash")
      .eq("role", "designer")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("ic_leads")
      .select("id, designer_id, client_id, first_name, last_name, stage, source, notes, updated_at, converted_job_id")
      .is("deleted_at", null)
      .limit(2000),
    supabase.from("ic_clients").select("id, name, phone, address").is("deleted_at", null).limit(3000),
  ]);

  if (staffResult.error) {
    return NextResponse.json({ ok: false, error: staffResult.error.message }, { status: 500 });
  }
  if (leadsResult.error) {
    return NextResponse.json({ ok: false, error: leadsResult.error.message }, { status: 500 });
  }

  let jobsResult = await supabase
    .from("ic_jobs")
    .select(`designer_id, ${JOB_SELECT}`)
    .is("deleted_at", null)
    .not("designer_id", "is", null)
    .limit(2000);
  if (jobsResult.error && /column|schema cache/i.test(jobsResult.error.message)) {
    const mid = await supabase
      .from("ic_jobs")
      .select(`designer_id, ${JOB_SELECT_MID}`)
      .is("deleted_at", null)
      .not("designer_id", "is", null)
      .limit(2000);
    jobsResult = mid as unknown as typeof jobsResult;
  }
  if (jobsResult.error && /column|schema cache/i.test(jobsResult.error.message)) {
    const basic = await supabase
      .from("ic_jobs")
      .select("id, designer_id, client_id, title, stage, job_kind, visit_window, notes, install_date")
      .is("deleted_at", null)
      .not("designer_id", "is", null)
      .limit(2000);
    jobsResult = basic as unknown as typeof jobsResult;
  }
  if (jobsResult.error) {
    return NextResponse.json({ ok: false, error: jobsResult.error.message }, { status: 500 });
  }

  const clients = new Map(((clientsResult.data ?? []) as ClientRow[]).map((row) => [row.id, row]));
  const staff = (staffResult.data ?? []) as StaffRow[];
  const leads = (leadsResult.data ?? []) as LeadRow[];
  const jobs = (jobsResult.data ?? []) as JobRow[];

  const designers = staff.map((person) => {
    const theirLeads = leads.filter((lead) => lead.designer_id === person.id);
    const theirJobs = jobs.filter((job) => job.designer_id === person.id);
    return {
      id: person.id,
      name: person.name,
      phone: person.phone,
      email: person.email,
      avatarUrl: person.avatar_url,
      initials: initials(person.name),
      hasPassword: Boolean(person.password_hash),
      openLeads: theirLeads.filter((lead) => !lead.converted_job_id).length,
      jobs: theirJobs.length,
    };
  });

  const payload: Record<string, unknown> = { ok: true, designers };

  if (!designerId) return NextResponse.json(payload);

  const person = designers.find((row) => row.id === designerId);
  if (!person) {
    return NextResponse.json({ ok: false, error: "Designer not found." }, { status: 404 });
  }

  const theirLeads = leads
    .filter((lead) => lead.designer_id === designerId)
    .map((lead) => {
      const client = lead.client_id ? clients.get(lead.client_id) ?? null : null;
      return {
        id: lead.id,
        clientName: clientName(client, lead.first_name, lead.last_name),
        phone: client?.phone ?? null,
        address: client?.address ?? null,
        stage: leadStageLabel(lead.stage),
        source: sourceLabel(lead.source),
        notes: lead.notes,
        updatedAt: lead.updated_at,
        open: !lead.converted_job_id,
      };
    });

  const theirJobs = jobs.filter((job) => job.designer_id === designerId);
  const jobsForFile = await Promise.all(
    theirJobs.map(async (job) => {
      const client = job.client_id ? clients.get(job.client_id) ?? null : null;
      let proposalUrl = job.proposal_url ?? null;
      if (job.proposal_path) {
        const signed = await supabase.storage
          .from("ic-field-media")
          .createSignedUrl(job.proposal_path, 60 * 60 * 12);
        proposalUrl = signed.data?.signedUrl ?? proposalUrl;
      }
      return {
        id: job.id,
        clientName: clientName(client),
        address: client?.address ?? null,
        phone: client?.phone ?? null,
        title: job.title,
        stage: jobStageLabel(job.stage),
        installDate: job.install_date,
        visitWindow: job.visit_window,
        notes: job.notes,
        fieldNotes: job.field_notes ?? null,
        designerNotes: job.designer_notes ?? null,
        installGrade: job.install_grade ?? null,
        installGradeNote: job.install_grade_note ?? null,
        frank: frankLabel(job.design_ready_choice, job.design_ready_at),
        proposalFilename: job.proposal_filename ?? null,
        proposalUrl,
      };
    }),
  );

  const { data: appointments } = await supabase
    .from("ic_appointments")
    .select("id, client_id, kind, subject, scheduled_at, status, location_text")
    .eq("designer_id", designerId)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: true })
    .limit(80);

  const schedule = ((appointments ?? []) as Array<{
    id: string;
    client_id: string | null;
    kind: string;
    subject: string | null;
    scheduled_at: string;
    status: string;
    location_text: string | null;
  }>).map((row) => {
    const client = row.client_id ? clients.get(row.client_id) ?? null : null;
    return {
      id: row.id,
      clientName: client?.name ?? row.subject ?? "Appointment",
      kind: row.kind.replace(/_/g, " "),
      scheduledAt: row.scheduled_at,
      status: row.status,
      locationText: row.location_text,
    };
  });

  const { data: mediaRows } = await supabase
    .from("ic_job_media")
    .select("id, job_id, kind, storage_path, public_url, caption, mime_type, created_at")
    .eq("installer_id", designerId)
    .order("created_at", { ascending: false })
    .limit(80);

  const media = await Promise.all(
    ((mediaRows ?? []) as Array<{
      id: string;
      job_id: string;
      kind: string;
      storage_path: string | null;
      public_url: string | null;
      caption: string | null;
      mime_type: string | null;
      created_at: string;
    }>).map(async (item) => {
      const job = theirJobs.find((row) => row.id === item.job_id);
      const client = job?.client_id ? clients.get(job.client_id) ?? null : null;
      let publicUrl = item.public_url;
      if (item.storage_path) {
        const signed = await supabase.storage
          .from("ic-field-media")
          .createSignedUrl(item.storage_path, 60 * 60 * 12);
        publicUrl = signed.data?.signedUrl ?? publicUrl;
      }
      return {
        id: item.id,
        jobId: item.job_id,
        clientName: client?.name ?? "Job",
        kind: item.kind,
        caption: item.caption,
        mimeType: item.mime_type,
        publicUrl,
        createdAt: item.created_at,
      };
    }),
  );

  payload.designer = person;
  payload.leads = theirLeads;
  payload.jobs = jobsForFile;
  payload.schedule = schedule;
  payload.media = media;
  return NextResponse.json(payload);
}
