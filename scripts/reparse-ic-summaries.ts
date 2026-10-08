/**
 * Re-read stored Studio design reports and Stow cart exports with their own
 * readers and replace the kit lines. Model reads glued cells together.
 *
 * Confirmed summaries already reserved stock against their lines, so they are
 * listed and left alone.
 *
 * Usage:
 *   npx tsx scripts/reparse-ic-summaries.ts            # dry run
 *   npx tsx scripts/reparse-ic-summaries.ts --apply
 */
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";

const ROOT = path.resolve(__dirname, "..");
const BUCKET = "ic-field-media";

type OldLine = {
  id: string;
  item_code: string | null;
  gather_status: string | null;
  problem_note: string | null;
  gather_marked_by: string | null;
  gather_marked_at: string | null;
};

async function main() {
  loadDotEnv(ROOT);
  const apply = process.argv.includes("--apply");
  const { getSupabaseAdmin } = await import("../src/db/client");
  const { extractPdfText } = await import("../src/lib/inspired-closets-ops-pdf-text");
  const { lineRow, matchSummaryLines, readKnownSummaryLayout } = await import(
    "../src/lib/inspired-closets-ops-product-summary"
  );
  const supabase = getSupabaseAdmin();

  const { data: summaries, error } = await supabase
    .from("ic_job_summaries")
    .select("id, job_id, order_name, status, storage_path, source_filename, parse_quality")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const report: Array<Record<string, unknown>> = [];
  for (const summary of summaries ?? []) {
    const label = summary.source_filename ?? summary.id;
    const download = await supabase.storage.from(BUCKET).download(String(summary.storage_path));
    if (download.error || !download.data) {
      report.push({ file: label, result: "download failed", error: download.error?.message });
      continue;
    }
    const { text, pages } = await extractPdfText(Buffer.from(await download.data.arrayBuffer()));
    const parsed = readKnownSummaryLayout(text, String(label));
    if (!parsed) {
      report.push({ file: label, result: "Stow order table or unreadable, left alone" });
      continue;
    }

    const { data: oldRows } = await supabase
      .from("ic_job_summary_lines")
      .select("id, item_code, gather_status, problem_note, gather_marked_by, gather_marked_at")
      .eq("summary_id", summary.id);
    const old = (oldRows ?? []) as OldLine[];
    const marked = old.filter((row) => row.gather_status && row.gather_status !== "unset");
    const row = {
      file: label,
      status: summary.status,
      old_lines: old.length,
      new_lines: parsed.lines.length,
      old_marks: marked.length,
    };

    if (summary.status === "confirmed") {
      report.push({ ...row, result: "confirmed, stock already reserved, left alone" });
      continue;
    }

    // A mark carries only when every old line with that item code agreed on it.
    const carry = new Map<string, OldLine>();
    const conflict = new Set<string>();
    for (const line of marked) {
      const code = (line.item_code ?? "").trim();
      if (!code) continue;
      const seen = carry.get(code);
      if (seen && seen.gather_status !== line.gather_status) conflict.add(code);
      else carry.set(code, line);
    }
    for (const code of conflict) carry.delete(code);

    const matched = await matchSummaryLines(parsed.lines);
    const rows = matched.map((line) => {
      const base = lineRow(String(summary.id), line);
      const mark = carry.get(line.item_code.trim());
      if (!mark) return base;
      return {
        ...base,
        gather_status: mark.gather_status,
        problem_note: mark.problem_note,
        gather_marked_by: mark.gather_marked_by,
        gather_marked_at: mark.gather_marked_at,
      };
    });
    const carried = rows.filter((line) => "gather_status" in line).length;

    if (apply) {
      const removed = await supabase.from("ic_job_summary_lines").delete().eq("summary_id", summary.id);
      if (removed.error) throw removed.error;
      for (let i = 0; i < rows.length; i += 80) {
        const inserted = await supabase.from("ic_job_summary_lines").insert(rows.slice(i, i + 80));
        if (inserted.error) throw inserted.error;
      }
      const updated = await supabase
        .from("ic_job_summaries")
        .update({
          order_name: summary.order_name ?? parsed.order_name,
          item_count: parsed.lines.length,
          parse_quality: {
            ...(summary.parse_quality as Record<string, unknown> | null),
            ...parsed.parse_quality,
            pages,
            reparsed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", summary.id);
      if (updated.error) throw updated.error;
    }
    report.push({
      ...row,
      source: parsed.parse_quality.source,
      carried_marks: carried,
      result: apply ? "replaced" : "would replace",
    });
  }

  console.table(report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
