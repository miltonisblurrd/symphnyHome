import { getSupabaseAdmin } from "@/db/client";
import { stageLabel } from "@/lib/inspired-closets-ops-jobs";

export const SHOW_SQL_HINT = "Run drizzle/0035_ic_show_photos.sql in Supabase, then reload.";
export const SHOW_TOGGLE_SQL_HINT = "Run drizzle/0036_ic_show_toggle.sql in Supabase, then reload.";

const MISSING = /relation|does not exist|schema cache|show_label|ic_show_photos/i;
const BUCKET = "ic-field-media";
const SIGNED_SECONDS = 60 * 60 * 12;

export type ShowPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  isCover: boolean;
  sortOrder: number;
};

export type ShowProject = {
  id: string;
  clientName: string;
  title: string | null;
  showLabel: string | null;
  label: string;
  defaultLabel: string;
  stage: string;
  stageLabel: string;
  installDate: string | null;
  visible: boolean;
  photos: ShowPhoto[];
};

type JobRow = {
  id: string;
  client_id: string | null;
  title: string | null;
  stage: string;
  install_date: string | null;
  sold_date: string | null;
  show_label?: string | null;
  show_on?: boolean | null;
};

type PhotoRow = {
  id: string;
  job_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
};

export function showDefaultLabel(input: { title?: string | null; clientName?: string | null }): string {
  const title = input.title?.trim();
  if (title) return title;
  const first = input.clientName?.trim().split(/\s+/)[0];
  return first || "Project";
}

export function showCardLabel(input: {
  showLabel?: string | null;
  title?: string | null;
  clientName?: string | null;
}): string {
  const custom = input.showLabel?.trim();
  if (custom) return custom;
  return showDefaultLabel(input);
}

function missingTable(message: string): boolean {
  return MISSING.test(message);
}

async function signUrls(rows: PhotoRow[]): Promise<Map<string, string | null>> {
  const supabase = getSupabaseAdmin();
  const urls = new Map<string, string | null>();
  const chunk = 20;
  for (let index = 0; index < rows.length; index += chunk) {
    const slice = rows.slice(index, index + chunk);
    await Promise.all(
      slice.map(async (row) => {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, SIGNED_SECONDS);
        urls.set(row.id, data?.signedUrl ?? null);
      }),
    );
  }
  return urls;
}

export async function listShowProjects(
  designerId: string,
): Promise<{ ok: true; projects: ShowProject[]; error?: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  let toggleHint: string | undefined;
  let jobsResult = await supabase
    .from("ic_jobs")
    .select("id, client_id, title, stage, install_date, sold_date, show_label, show_on")
    .eq("designer_id", designerId)
    .is("deleted_at", null)
    .order("sold_date", { ascending: false, nullsFirst: false })
    .limit(200);

  if (jobsResult.error && /show_on/i.test(jobsResult.error.message)) {
    toggleHint = SHOW_TOGGLE_SQL_HINT;
    const withoutToggle = await supabase
      .from("ic_jobs")
      .select("id, client_id, title, stage, install_date, sold_date, show_label")
      .eq("designer_id", designerId)
      .is("deleted_at", null)
      .order("sold_date", { ascending: false, nullsFirst: false })
      .limit(200);
    jobsResult = withoutToggle as unknown as typeof jobsResult;
  }

  if (jobsResult.error && /show_label|column|schema cache/i.test(jobsResult.error.message)) {
    const fallback = await supabase
      .from("ic_jobs")
      .select("id, client_id, title, stage, install_date, sold_date")
      .eq("designer_id", designerId)
      .is("deleted_at", null)
      .order("sold_date", { ascending: false, nullsFirst: false })
      .limit(200);
    jobsResult = fallback as unknown as typeof jobsResult;
  }

  if (jobsResult.error) {
    return {
      ok: false,
      error: missingTable(jobsResult.error.message) ? SHOW_SQL_HINT : jobsResult.error.message,
    };
  }

  const jobs = (jobsResult.data ?? []) as JobRow[];
  if (jobs.length === 0) return { ok: true, projects: [] };

  const clientIds = [...new Set(jobs.map((job) => job.client_id).filter((id): id is string => Boolean(id)))];
  const clients = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data } = await supabase.from("ic_clients").select("id, name").in("id", clientIds);
    for (const row of data ?? []) {
      if (row.name) clients.set(row.id, row.name);
    }
  }

  const { data: photoData, error: photoError } = await supabase
    .from("ic_show_photos")
    .select("id, job_id, storage_path, caption, sort_order, is_cover")
    .eq("designer_id", designerId)
    .in(
      "job_id",
      jobs.map((job) => job.id),
    )
    .order("sort_order", { ascending: true });

  if (photoError && !missingTable(photoError.message)) {
    return { ok: false, error: photoError.message };
  }

  const photoRows = (photoData ?? []) as PhotoRow[];
  const urls = await signUrls(photoRows);
  const photosByJob = new Map<string, ShowPhoto[]>();
  for (const row of photoRows) {
    const list = photosByJob.get(row.job_id) ?? [];
    list.push({
      id: row.id,
      url: urls.get(row.id) ?? null,
      caption: row.caption,
      isCover: row.is_cover,
      sortOrder: row.sort_order,
    });
    photosByJob.set(row.job_id, list);
  }

  for (const list of photosByJob.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    if (list.length > 0 && !list.some((photo) => photo.isCover)) list[0].isCover = true;
    list.sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);
  }

  const projects = jobs.map((job) => {
    const clientName = (job.client_id && clients.get(job.client_id)) || "Client";
    const showLabel = job.show_label ?? null;
    return {
      id: job.id,
      clientName,
      title: job.title,
      showLabel,
      defaultLabel: showDefaultLabel({ title: job.title, clientName }),
      label: showCardLabel({ showLabel, title: job.title, clientName }),
      stage: job.stage,
      stageLabel: stageLabel(job.stage),
      installDate: job.install_date,
      visible: Boolean(job.show_on),
      photos: photosByJob.get(job.id) ?? [],
    };
  });

  return {
    ok: true,
    projects,
    error: photoError ? SHOW_SQL_HINT : toggleHint,
  };
}
