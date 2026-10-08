import { getSupabaseAdmin } from "@/db/client";
import { insertFieldNotice } from "@/lib/inspired-closets-field-home";
import { receivingRollupByJobIds } from "@/lib/inspired-closets-ops-receiving";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";
import {
  addCalendarDays,
  isGatherStatus,
  kitLineGroup,
  kitProgress,
  kitProgressLabel,
  laToday,
  missingWarehouseSchema,
  readyGate,
  WAREHOUSE_MIGRATION_HINT,
  type GatherStatus,
  type KitGroup,
} from "@/lib/inspired-closets-ops-warehouse";

type Failure = { ok: false; status: number; error: string; hint?: string };

const JOB_SELECT =
  "id, client_id, installer_id, title, install_date, stage, deleted_at, duplicate_of_job_id, warehouse_status, pile_location, warehouse_ready_at";

export type JobRow = {
  id: string;
  client_id: string | null;
  installer_id: string | null;
  title: string | null;
  install_date: string | null;
  stage: string;
  deleted_at: string | null;
  duplicate_of_job_id: string | null;
  warehouse_status: string | null;
  pile_location: string | null;
  warehouse_ready_at: string | null;
};

export type WarehouseQueueJob = {
  id: string;
  client_name: string;
  title: string | null;
  install_date: string | null;
  installer_name: string | null;
  scan_received: number;
  scan_total: number;
  kit_progress: string;
  kit_label: string;
  has_summary: boolean;
  line_count: number;
  marked_count: number;
  just_scanned: boolean;
  warehouse_status: string | null;
};

export type WarehouseKitLine = {
  id: string;
  item_code: string | null;
  description: string | null;
  product_type: string | null;
  dimensions: string | null;
  finish: string | null;
  qty: number;
  group: KitGroup;
  bin: string | null;
  gather_status: GatherStatus;
  problem_note: string | null;
};

export type WarehouseKitPhoto = {
  id: string;
  public_url: string | null;
  caption: string | null;
  created_at: string;
};

export type WarehouseKit = {
  id: string;
  client_name: string;
  title: string | null;
  install_date: string | null;
  installer_name: string | null;
  installer_id: string | null;
  so_number: string | null;
  order_name: string | null;
  pdf_url: string | null;
  warehouse_status: string | null;
  pile_location: string | null;
  scan_received: number;
  scan_total: number;
  has_summary: boolean;
  lines: WarehouseKitLine[];
  photos: WarehouseKitPhoto[];
  ready: { ok: boolean; reasons: string[] };
};

function fail(status: number, error: string, hint?: string): Failure {
  return hint ? { ok: false, status, error, hint } : { ok: false, status, error };
}

function schemaFail(message: string): Failure | null {
  if (!missingWarehouseSchema(message)) return null;
  return fail(400, "Warehouse kit is not on this database yet.", WAREHOUSE_MIGRATION_HINT);
}

async function signedUrl(storagePath: string | null | undefined, fallback: string | null): Promise<string | null> {
  if (!storagePath) return fallback;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage.from("ic-field-media").createSignedUrl(storagePath, 60 * 60 * 12);
  return data?.signedUrl ?? fallback;
}

function keepJob(job: JobRow): boolean {
  if (job.deleted_at || job.duplicate_of_job_id) return false;
  if (job.warehouse_status) return true;
  return job.stage !== "cancelled" && job.stage !== "closed";
}

export async function loadWarehouseQueue(): Promise<{ ok: true; jobs: WarehouseQueueJob[] } | Failure> {
  const supabase = getSupabaseAdmin();
  const today = laToday();
  const from = addCalendarDays(today, -2);
  const to = addCalendarDays(today, 21);
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [upcoming, active, recentItems] = await Promise.all([
    supabase
      .from("ic_jobs")
      .select(JOB_SELECT)
      .is("deleted_at", null)
      .is("duplicate_of_job_id", null)
      .gte("install_date", from)
      .lte("install_date", to)
      .limit(200),
    supabase
      .from("ic_jobs")
      .select(JOB_SELECT)
      .is("deleted_at", null)
      .in("warehouse_status", ["gathering", "ready", "hold"])
      .limit(100),
    supabase
      .from("ic_shipment_items")
      .select("job_id")
      .not("job_id", "is", null)
      .gt("received_qty", 0)
      .gte("updated_at", since)
      .limit(400),
  ]);

  const schemaError = [upcoming.error, active.error].find((error) => error && schemaFail(error.message));
  if (schemaError) return schemaFail(schemaError.message)!;
  if (upcoming.error) return fail(500, upcoming.error.message);
  if (active.error) return fail(500, active.error.message);

  const scannedIds = new Set(
    (recentItems.error ? [] : (recentItems.data ?? []))
      .map((row) => (row.job_id ? String(row.job_id) : ""))
      .filter(Boolean),
  );

  const jobsById = new Map<string, JobRow>();
  for (const row of [...(upcoming.data ?? []), ...(active.data ?? [])] as JobRow[]) {
    if (keepJob(row)) jobsById.set(row.id, row);
  }

  const missingScans = [...scannedIds].filter((id) => !jobsById.has(id));
  if (missingScans.length > 0) {
    const extra = await supabase.from("ic_jobs").select(JOB_SELECT).in("id", missingScans).is("deleted_at", null);
    if (extra.error) {
      const schema = schemaFail(extra.error.message);
      if (schema) return schema;
      return fail(500, extra.error.message);
    }
    for (const row of (extra.data ?? []) as JobRow[]) {
      if (keepJob(row)) jobsById.set(row.id, row);
    }
  }

  const built = await queueRowsFor([...jobsById.values()], scannedIds);
  if (!built.ok) return built;
  const queue = built.rows;

  queue.sort((a, b) => {
    const aDate = a.install_date ?? "9999-99-99";
    const bDate = b.install_date ?? "9999-99-99";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.client_name.localeCompare(b.client_name);
  });

  return { ok: true, jobs: queue };
}

/** Load jobs by id with the same filter the queue uses. */
export async function loadQueueJobRows(jobIds: string[]): Promise<{ ok: true; jobs: JobRow[] } | Failure> {
  if (jobIds.length === 0) return { ok: true, jobs: [] };
  const supabase = getSupabaseAdmin();
  const out: JobRow[] = [];
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data, error } = await supabase
      .from("ic_jobs")
      .select(JOB_SELECT)
      .in("id", jobIds.slice(i, i + 200))
      .is("deleted_at", null);
    if (error) return schemaFail(error.message) ?? fail(500, error.message);
    out.push(...((data ?? []) as JobRow[]).filter(keepJob));
  }
  return { ok: true, jobs: out };
}

export async function queueRowsFor(
  jobs: JobRow[],
  scannedIds: Set<string> = new Set(),
): Promise<{ ok: true; rows: WarehouseQueueJob[] } | Failure> {
  const supabase = getSupabaseAdmin();
  const jobIds = jobs.map((job) => job.id);
  const clientIds = [...new Set(jobs.map((job) => job.client_id).filter(Boolean))] as string[];
  const installerIds = [...new Set(jobs.map((job) => job.installer_id).filter(Boolean))] as string[];

  const [clientsRes, staffRes, summariesRes, rollup] = await Promise.all([
    clientIds.length
      ? supabase.from("ic_clients").select("id, name").in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    installerIds.length
      ? supabase.from("ic_staff").select("id, name").in("id", installerIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase
          .from("ic_job_summaries")
          .select("id, job_id, created_at")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    receivingRollupByJobIds(jobIds),
  ]);

  const clientName = new Map((clientsRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]));
  const staffName = new Map((staffRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]));

  const summaryByJob = new Map<string, string>();
  for (const row of summariesRes.data ?? []) {
    const jobId = String(row.job_id);
    if (!summaryByJob.has(jobId)) summaryByJob.set(jobId, String(row.id));
  }
  const summaryIds = [...summaryByJob.values()];
  const linesRes = summaryIds.length
    ? await supabase.from("ic_job_summary_lines").select("summary_id, gather_status").in("summary_id", summaryIds)
    : { data: [], error: null };
  if (linesRes.error) {
    const schema = schemaFail(linesRes.error.message);
    if (schema) return schema;
    return fail(500, linesRes.error.message);
  }

  const lineStats = new Map<string, { total: number; marked: number }>();
  for (const row of linesRes.data ?? []) {
    const summaryId = String(row.summary_id);
    const current = lineStats.get(summaryId) ?? { total: 0, marked: 0 };
    current.total += 1;
    if (row.gather_status && row.gather_status !== "unset") current.marked += 1;
    lineStats.set(summaryId, current);
  }

  const rows: WarehouseQueueJob[] = jobs.map((job) => {
    const summaryId = summaryByJob.get(job.id) ?? null;
    const stats = summaryId ? lineStats.get(summaryId) : undefined;
    const lineCount = stats?.total ?? 0;
    const markedCount = stats?.marked ?? 0;
    const hasSummary = lineCount > 0;
    const progress = kitProgress({
      hasSummary,
      warehouseStatus: job.warehouse_status,
      markedCount,
    });
    const scan = rollup.get(job.id);
    return {
      id: job.id,
      client_name: (job.client_id && clientName.get(job.client_id)) || "No client",
      title: job.title,
      install_date: job.install_date,
      installer_name: (job.installer_id && staffName.get(job.installer_id)) || null,
      scan_received: scan?.received_qty ?? 0,
      scan_total: scan?.total_qty ?? 0,
      kit_progress: progress,
      kit_label: kitProgressLabel(progress),
      has_summary: hasSummary,
      line_count: lineCount,
      marked_count: markedCount,
      just_scanned: scannedIds.has(job.id),
      warehouse_status: job.warehouse_status,
    };
  });

  return { ok: true, rows };
}

async function loadJobRow(jobId: string): Promise<{ job: JobRow } | Failure> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("ic_jobs").select(JOB_SELECT).eq("id", jobId).maybeSingle();
  if (error) {
    const schema = schemaFail(error.message);
    if (schema) return schema;
    return fail(500, error.message);
  }
  if (!data || data.deleted_at) return fail(404, "Job not found.");
  return { job: data as JobRow };
}

export async function loadWarehouseKit(jobId: string): Promise<{ ok: true; job: WarehouseKit } | Failure> {
  const loaded = await loadJobRow(jobId);
  if (!("job" in loaded)) return loaded;
  const job = loaded.job;
  const supabase = getSupabaseAdmin();

  const [clientRes, installerRes, summaryRes, rollup] = await Promise.all([
    job.client_id
      ? supabase.from("ic_clients").select("id, name").eq("id", job.client_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    job.installer_id
      ? supabase.from("ic_staff").select("id, name").eq("id", job.installer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("ic_job_summaries")
      .select("id, order_name, so_number, public_url, storage_path, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    receivingRollupByJobIds([jobId]),
  ]);

  const summary = summaryRes.data;
  const linesRes = summary
    ? await supabase
        .from("ic_job_summary_lines")
        .select(
          "id, line_no, item_code, description, product_type, dimensions, finish, qty, part_id, gather_status, problem_note",
        )
        .eq("summary_id", summary.id)
        .order("line_no", { ascending: true })
    : { data: [], error: null };
  if (linesRes.error) {
    const schema = schemaFail(linesRes.error.message);
    if (schema) return schema;
    return fail(500, linesRes.error.message);
  }

  const partIds = [...new Set((linesRes.data ?? []).map((row) => row.part_id).filter(Boolean))] as string[];
  const partsRes = partIds.length
    ? await supabase.from("ic_parts").select("id, location").in("id", partIds)
    : { data: [] as Array<{ id: string; location: string | null }> };
  const bins = new Map((partsRes.data ?? []).map((part) => [String(part.id), part.location ? String(part.location) : null]));

  const lines: WarehouseKitLine[] = (linesRes.data ?? []).map((row) => {
    const status = typeof row.gather_status === "string" && isGatherStatus(row.gather_status) ? row.gather_status : "unset";
    return {
      id: String(row.id),
      item_code: row.item_code ? String(row.item_code) : null,
      description: row.description ? String(row.description) : null,
      product_type: row.product_type ? String(row.product_type) : null,
      dimensions: row.dimensions ? String(row.dimensions) : null,
      finish: row.finish ? String(row.finish) : null,
      qty: Number(row.qty) || 0,
      group: kitLineGroup({
        item_code: row.item_code ? String(row.item_code) : null,
        description: row.description ? String(row.description) : null,
        product_type: row.product_type ? String(row.product_type) : null,
      }),
      bin: row.part_id ? bins.get(String(row.part_id)) ?? null : null,
      gather_status: status,
      problem_note: row.problem_note ? String(row.problem_note) : null,
    };
  });

  const photosRes = await supabase
    .from("ic_job_media")
    .select("id, public_url, storage_path, caption, created_at, kind")
    .eq("job_id", jobId)
    .eq("kind", "staging")
    .order("created_at", { ascending: true });
  const photos: WarehouseKitPhoto[] = await Promise.all(
    (photosRes.data ?? []).map(async (row) => ({
      id: String(row.id),
      public_url: await signedUrl(
        typeof row.storage_path === "string" ? row.storage_path : null,
        typeof row.public_url === "string" ? row.public_url : null,
      ),
      caption: row.caption ? String(row.caption) : null,
      created_at: String(row.created_at ?? ""),
    })),
  );

  const pdfUrl = summary
    ? await signedUrl(
        typeof summary.storage_path === "string" ? summary.storage_path : null,
        typeof summary.public_url === "string" ? summary.public_url : null,
      )
    : null;
  const scan = rollup.get(jobId);
  const hasSummary = lines.length > 0;
  const wholePilePhotos = photos.filter((photo) => photo.caption === "Whole pile").length;
  const gate = readyGate({ hasSummary, lines, photoCount: wholePilePhotos });

  return {
    ok: true,
    job: {
      id: job.id,
      client_name: clientRes.data?.name ? String(clientRes.data.name) : "No client",
      title: job.title,
      install_date: job.install_date,
      installer_name: installerRes.data?.name ? String(installerRes.data.name) : null,
      installer_id: job.installer_id,
      so_number: summary?.so_number ? String(summary.so_number) : null,
      order_name: summary?.order_name ? String(summary.order_name) : null,
      pdf_url: pdfUrl,
      warehouse_status: job.warehouse_status,
      pile_location: job.pile_location,
      scan_received: scan?.received_qty ?? 0,
      scan_total: scan?.total_qty ?? 0,
      has_summary: hasSummary,
      lines,
      photos,
      ready: gate,
    },
  };
}

function lineName(line: WarehouseKitLine): string {
  return line.description || line.item_code || "Line";
}

function exceptionText(lines: WarehouseKitLine[]): string {
  const exceptions = lines.filter((line) => line.gather_status === "on_truck" || line.gather_status === "problem");
  if (exceptions.length === 0) return "Everything from the product summary is in the pile.";
  if (exceptions.length > 6) {
    const truck = exceptions.filter((line) => line.gather_status === "on_truck").length;
    const problem = exceptions.filter((line) => line.gather_status === "problem").length;
    const parts = [
      truck > 0 ? `${truck} still on the truck` : null,
      problem > 0 ? `${problem} problem` : null,
    ].filter(Boolean);
    return parts.join(". ") + ".";
  }
  return exceptions
    .map((line) => {
      if (line.gather_status === "on_truck") return `${lineName(line)} still on the truck`;
      return `${lineName(line)} problem${line.problem_note ? ` (${line.problem_note})` : ""}`;
    })
    .join(". ") + ".";
}

async function notifyCrew(job: WarehouseKit, status: "ready" | "hold"): Promise<void> {
  const supabase = getSupabaseAdmin();
  const ids = new Set<string>();
  if (job.installer_id) ids.add(job.installer_id);
  const { data: crew } = await supabase
    .from("ic_job_crew")
    .select("installer_id, status")
    .eq("job_id", job.id);
  for (const row of crew ?? []) {
    if (row.status === "denied" || !row.installer_id) continue;
    ids.add(String(row.installer_id));
  }

  const spot = job.pile_location?.trim();
  const title = status === "ready" ? "Warehouse ready" : "Hold";
  const body =
    status === "ready"
      ? [
          `${job.client_name} pile is ready${spot ? ` at ${spot}` : ""}.`,
          exceptionText(job.lines),
        ].join(" ")
      : `${job.client_name} is on hold. Bryant reopened this pile.`;

  await Promise.all(
    [...ids].map((installerId) =>
      insertFieldNotice({
        installerId,
        kind: "warehouse",
        title,
        body,
        relatedId: job.id,
      }),
    ),
  );

  if (status === "ready" && job.installer_name) {
    try {
      await postInspiredClosetsSlackNotification({
        assignee: job.installer_name,
        title: "Pile is ready",
        severity: "info",
        todoLabel: job.client_name,
        notifyMessage: `${job.client_name} pile is ready${spot ? ` — ${spot}` : ""}.`,
        requestedBy: "Bryant",
      });
    } catch {
      /* Slack stays optional. Photos stay off this ping. */
    }
  }
}

async function setWarehouseStatus(
  jobId: string,
  patch: Record<string, unknown>,
): Promise<Failure | null> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("ic_jobs").update(patch).eq("id", jobId);
  if (!error) return null;
  return schemaFail(error.message) ?? fail(500, error.message);
}

export async function markKitLine(input: {
  jobId: string;
  lineId: string;
  gatherStatus: GatherStatus;
  problemNote: string | null;
  actorId: string;
}): Promise<{ ok: true; job: WarehouseKit } | Failure> {
  const current = await loadWarehouseKit(input.jobId);
  if (!current.ok) return current;
  const line = current.job.lines.find((row) => row.id === input.lineId);
  if (!line) return fail(404, "That line is not on this job's product summary.");

  const supabase = getSupabaseAdmin();
  const note = input.gatherStatus === "problem" ? input.problemNote : null;
  const { error } = await supabase
    .from("ic_job_summary_lines")
    .update({
      gather_status: input.gatherStatus,
      problem_note: note,
      gather_marked_by: input.actorId,
      gather_marked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.lineId);
  if (error) return schemaFail(error.message) ?? fail(500, error.message);

  const wasReady = current.job.warehouse_status === "ready";
  if (!current.job.warehouse_status && input.gatherStatus !== "unset") {
    const statusError = await setWarehouseStatus(input.jobId, {
      warehouse_status: "gathering",
      updated_at: new Date().toISOString(),
    });
    if (statusError) return statusError;
  }
  if (wasReady && input.gatherStatus === "unset") {
    const statusError = await setWarehouseStatus(input.jobId, {
      warehouse_status: "hold",
      updated_at: new Date().toISOString(),
    });
    if (statusError) return statusError;
  }

  const next = await loadWarehouseKit(input.jobId);
  if (!next.ok) return next;
  if (wasReady && input.gatherStatus === "unset") await notifyCrew(next.job, "hold");
  return next;
}

export async function savePileSpot(input: {
  jobId: string;
  pileLocation: string | null;
}): Promise<{ ok: true; job: WarehouseKit } | Failure> {
  const statusError = await setWarehouseStatus(input.jobId, {
    pile_location: input.pileLocation,
    updated_at: new Date().toISOString(),
  });
  if (statusError) return statusError;
  return loadWarehouseKit(input.jobId);
}

export async function markKitReady(input: {
  jobId: string;
  actorId: string;
}): Promise<{ ok: true; job: WarehouseKit } | Failure> {
  const current = await loadWarehouseKit(input.jobId);
  if (!current.ok) return current;
  if (!current.job.ready.ok) {
    return fail(400, current.job.ready.reasons.join(" "));
  }
  const now = new Date().toISOString();
  const statusError = await setWarehouseStatus(input.jobId, {
    warehouse_status: "ready",
    warehouse_ready_at: now,
    warehouse_ready_by: input.actorId,
    updated_at: now,
  });
  if (statusError) return statusError;
  const next = await loadWarehouseKit(input.jobId);
  if (!next.ok) return next;
  await notifyCrew(next.job, "ready");
  return next;
}

export async function markKitHold(jobId: string): Promise<{ ok: true; job: WarehouseKit } | Failure> {
  const current = await loadWarehouseKit(jobId);
  if (!current.ok) return current;
  if (current.job.warehouse_status !== "hold") {
    const statusError = await setWarehouseStatus(jobId, {
      warehouse_status: "hold",
      updated_at: new Date().toISOString(),
    });
    if (statusError) return statusError;
  }
  const next = await loadWarehouseKit(jobId);
  if (!next.ok) return next;
  if (current.job.warehouse_status !== "hold") await notifyCrew(next.job, "hold");
  return next;
}
