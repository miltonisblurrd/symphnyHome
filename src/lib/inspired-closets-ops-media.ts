import { getSupabaseAdmin } from "@/db/client";
import { MEDIA_KINDS } from "@/lib/inspired-closets-ops-field";

export type JobPhoto = {
  id: string;
  kind: string;
  kind_label: string;
  caption: string | null;
  created_at: string;
  public_url: string | null;
  mime_type: string | null;
  installer_name: string | null;
};

export function mediaKindLabel(kind: string): string {
  if (kind === "other") return "Paperwork";
  return MEDIA_KINDS.find((row) => row.id === kind)?.label ?? kind.replace(/_/g, " ");
}

export function isImageMime(mime: string | null | undefined): boolean {
  return !mime || mime.startsWith("image/");
}

/** Photos installers posted on a job, with a fresh view link. */
export async function listJobPhotos(jobId: string): Promise<JobPhoto[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_job_media")
    .select("id, job_id, installer_id, kind, storage_path, public_url, caption, mime_type, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data?.length) return [];

  const installerIds = [
    ...new Set(data.map((row) => row.installer_id).filter((id): id is string => Boolean(id))),
  ];
  const names = new Map<string, string>();
  if (installerIds.length > 0) {
    const { data: staff } = await supabase.from("ic_staff").select("id, name").in("id", installerIds);
    for (const row of staff ?? []) names.set(row.id, row.name);
  }

  return Promise.all(
    data.map(async (row) => {
      let url = row.public_url as string | null;
      if (row.storage_path) {
        const signed = await supabase.storage
          .from("ic-field-media")
          .createSignedUrl(row.storage_path, 60 * 60 * 12);
        url = signed.data?.signedUrl ?? url;
      }
      const kind = String(row.kind ?? "other");
      return {
        id: row.id as string,
        kind,
        kind_label: mediaKindLabel(kind),
        caption: (row.caption as string | null) ?? null,
        created_at: row.created_at as string,
        public_url: url,
        mime_type: (row.mime_type as string | null) ?? null,
        installer_name: row.installer_id ? names.get(row.installer_id) ?? null : null,
      };
    }),
  );
}
