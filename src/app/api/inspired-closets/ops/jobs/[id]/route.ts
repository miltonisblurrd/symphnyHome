import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { listPendingMergeCandidates } from "@/lib/inspired-closets-ops-clients";
import { listJobPhotos } from "@/lib/inspired-closets-ops-media";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: job, error: jobError } = await supabase
    .from("ic_jobs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobError) {
    return NextResponse.json({ ok: false, error: jobError.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }

  const staffIds = [
    job.designer_id,
    job.installer_id,
    job.job_check_owner_id,
  ].filter((value): value is string => Boolean(value));

  const [clientWithMerge, staffResult, leadById, leadByJob, paymentsResult] = await Promise.all([
    job.client_id
      ? supabase
          .from("ic_clients")
          .select("id, name, phone, email, address, merged_into_client_id, identity_key")
          .eq("id", job.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    staffIds.length > 0
      ? supabase.from("ic_staff").select("id, name, role, active").in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
    job.lead_id
      ? supabase.from("ic_leads").select("*").eq("id", job.lead_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("ic_leads")
      .select("*")
      .eq("converted_job_id", id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
    supabase.from("ic_payments").select("*").eq("job_id", id).order("due_at", { ascending: true }),
  ]);

  let clientResult = clientWithMerge;
  if (
    clientResult.error &&
    /merged_into_client_id|identity_key|schema cache|column/i.test(clientResult.error.message)
  ) {
    clientResult = job.client_id
      ? await supabase
          .from("ic_clients")
          .select("id, name, phone, email, address")
          .eq("id", job.client_id)
          .maybeSingle()
      : { data: null, error: null };
  }

  let client = clientResult.data ?? null;
  if (client?.merged_into_client_id) {
    const { data: canonical } = await supabase
      .from("ic_clients")
      .select("id, name, phone, email, address, merged_into_client_id, identity_key")
      .eq("id", client.merged_into_client_id)
      .maybeSingle();
    if (canonical) client = canonical;
  }

  const canonicalClientId = client?.id ?? job.client_id ?? null;
  let clientJobs: Array<{
    id: string;
    title: string | null;
    job_kind: string | null;
    stage: string;
    sold_date: string | null;
    install_date: string | null;
    contract_cents: number;
  }> = [];

  if (canonicalClientId) {
    const { data: siblings } = await supabase
      .from("ic_jobs")
      .select("id, title, job_kind, stage, sold_date, install_date, contract_cents, created_at")
      .eq("client_id", canonicalClientId)
      .is("deleted_at", null)
      .is("duplicate_of_job_id", null)
      .order("sold_date", { ascending: false, nullsFirst: false })
      .limit(40);
    clientJobs = (siblings ?? []).map((row) => ({
      id: row.id,
      title: row.title ?? null,
      job_kind: row.job_kind ?? null,
      stage: row.stage,
      sold_date: row.sold_date ?? null,
      install_date: row.install_date ?? null,
      contract_cents: row.contract_cents ?? 0,
    }));

    // Also include jobs still pointing at merged-away client ids for this person.
    if (client?.identity_key) {
      const { data: mergedClients } = await supabase
        .from("ic_clients")
        .select("id")
        .eq("merged_into_client_id", canonicalClientId);
      const extraIds = (mergedClients ?? []).map((row) => row.id).filter((cid) => cid !== canonicalClientId);
      if (extraIds.length > 0) {
        const { data: more } = await supabase
          .from("ic_jobs")
          .select("id, title, job_kind, stage, sold_date, install_date, contract_cents")
          .in("client_id", extraIds)
          .is("deleted_at", null)
          .is("duplicate_of_job_id", null)
          .limit(40);
        const seen = new Set(clientJobs.map((j) => j.id));
        for (const row of more ?? []) {
          if (seen.has(row.id)) continue;
          clientJobs.push({
            id: row.id,
            title: row.title ?? null,
            job_kind: row.job_kind ?? null,
            stage: row.stage,
            sold_date: row.sold_date ?? null,
            install_date: row.install_date ?? null,
            contract_cents: row.contract_cents ?? 0,
          });
        }
      }
    }
  }

  const lead = leadById.data ?? leadByJob.data ?? null;
  const leadId = lead?.id ?? job.lead_id ?? null;

  let appointmentsQuery = supabase
    .from("ic_appointments")
    .select("*")
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (leadId) {
    appointmentsQuery = appointmentsQuery.or(`job_id.eq.${id},lead_id.eq.${leadId}`);
  } else {
    appointmentsQuery = appointmentsQuery.eq("job_id", id);
  }

  const appointmentsResult = await appointmentsQuery;
  const staffById = new Map((staffResult.data ?? []).map((row) => [row.id, row]));

  const apptStaffIds = [
    ...new Set(
      (appointmentsResult.data ?? [])
        .flatMap((row) => [row.designer_id, row.installer_id])
        .filter((value): value is string => Boolean(value)),
    ),
  ].filter((staffId) => !staffById.has(staffId));

  if (apptStaffIds.length > 0) {
    const extra = await supabase.from("ic_staff").select("id, name, role, active").in("id", apptStaffIds);
    for (const row of extra.data ?? []) staffById.set(row.id, row);
  }

  const appointments = (appointmentsResult.data ?? []).map((row) => ({
    ...row,
    designer: row.designer_id ? staffById.get(row.designer_id) ?? null : null,
    installer: row.installer_id ? staffById.get(row.installer_id) ?? null : null,
  }));

  const [mergeCandidates, photos] = await Promise.all([
    listPendingMergeCandidates().catch(() => []),
    listJobPhotos(id).catch(() => []),
  ]);
  const mergeCandidate =
    mergeCandidates.find((candidate) =>
      candidate.client_ids.includes(canonicalClientId ?? "") ||
      candidate.client_ids.includes(job.client_id ?? ""),
    ) ?? null;

  return NextResponse.json({
    ok: true,
    job: {
      ...job,
      client: client
        ? {
            id: client.id,
            name: client.name,
            phone: client.phone,
            email: client.email,
            address: client.address,
          }
        : null,
      designer: job.designer_id ? staffById.get(job.designer_id) ?? null : null,
      installer: job.installer_id ? staffById.get(job.installer_id) ?? null : null,
      jobCheckOwner: job.job_check_owner_id
        ? staffById.get(job.job_check_owner_id) ?? null
        : null,
    },
    lead,
    appointments,
    payments: paymentsResult.data ?? [],
    clientJobs,
    mergeCandidate,
    photos,
  });
}
