/**
 * Studio install reports Frank uploads in Receiving.
 * The PDF is a job-file document. It does not become a scan card.
 */
import { getSupabaseAdmin } from "@/db/client";
import { extractPdfText } from "@/lib/inspired-closets-ops-pdf-text";
import {
  looksLikePackingSlip,
  looksLikeProductSummary,
} from "@/lib/inspired-closets-ops-product-summary-text";
import { findJobId } from "@/lib/inspired-closets-ops-receiving";

export function missingInstallReportTable(message: string): boolean {
  return /ic_install_reports|schema cache|does not exist/i.test(message);
}

export function installReportUploadError(text: string): string | null {
  if (!text.trim() || /install\s*report/i.test(text)) return null;
  if (looksLikePackingSlip(text)) {
    return "This is a packaging slip. Use Upload packaging slip.";
  }
  if (looksLikeProductSummary(text)) {
    return "This is a product summary. Use Upload Product Summary.";
  }
  return null;
}

export function productSummaryUploadError(text: string): string | null {
  if (/install\s*report/i.test(text) && !looksLikeProductSummary(text)) {
    return "This is an install report. Use Upload install report.";
  }
  return null;
}

function labeledValue(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  const value = match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  if (value.length < 2 || value.length > 80) return null;
  return value;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
}

export function clientFromInstallFilename(filename: string): string {
  const base = String(filename ?? "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/^\d{8}[_-]?\d{0,6}[_-]*/, "")
    .replace(/install[\s_-]*reports?/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (base.length < 2 || /^(pdf|report|install|studio)$/i.test(base)) return "";
  return base;
}

export function readInstallReportIdentity(
  text: string,
  filename: string,
): { orderName: string; soNumber: string | null; shipDate: string | null } {
  const fromLabel = labeledValue(
    text,
    /(?:customer|client|job name|order name)\s*[:\-]\s*([^\n]+)/i,
  );
  const fromFile = clientFromInstallFilename(filename);
  const stem = filename.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim();
  const orderName = fromLabel || fromFile || stem || "Install report";
  const soNumber = labeledValue(
    text,
    /(?:sales order(?: number)?|so number)\s*[:#]?\s*([A-Z0-9-]{4,})/i,
  );
  const shipDate = isoDate(
    labeledValue(text, /(?:ship date|install date)\s*[:\-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i),
  );
  return { orderName, soNumber, shipDate };
}

async function matchJob(filename: string, orderName: string): Promise<string | null> {
  const hints = [clientFromInstallFilename(filename), orderName].filter(
    (hint, index, all) => hint.length >= 2 && all.indexOf(hint) === index && hint !== "Install report",
  );
  for (const hint of hints) {
    const jobId = await findJobId({
      item_number: "",
      qty: 1,
      cust_ref: hint,
      job_name: hint,
    });
    if (jobId) return jobId;
  }
  return null;
}

export async function ingestInstallReport(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  actorId: string | null;
}): Promise<{
  id: string;
  order_name: string;
  job_id: string | null;
  message: string;
}> {
  const supabase = getSupabaseAdmin();
  let text = "";
  let pages = 0;
  try {
    const extracted = await extractPdfText(input.bytes);
    text = extracted.text;
    pages = extracted.pages;
  } catch {
    text = "";
  }
  const wrong = installReportUploadError(text);
  if (wrong) throw new Error(wrong);

  const identity = readInstallReportIdentity(text, input.filename);
  const jobId = await matchJob(input.filename, identity.orderName);
  const path = `install-reports/uploads/${Date.now()}-${input.filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, input.bytes, {
    contentType: input.mimeType || "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`Could not store the install report: ${uploadError.message}`);
  }
  const publicUrl = supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ic_install_reports")
    .insert({
      job_id: jobId,
      order_name: identity.orderName,
      so_number: identity.soNumber,
      ship_date: identity.shipDate,
      item_count: 0,
      source_filename: input.filename,
      storage_path: path,
      public_url: publicUrl,
      status: jobId ? "attached" : "unmatched",
      parse_quality: { source: "install_report", pages, chars: text.length },
      created_by: input.actorId,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error || !data) {
    await supabase.storage.from("ic-field-media").remove([path]);
    if (error && missingInstallReportTable(error.message)) {
      throw new Error("Run drizzle/0031_ic_install_reports.sql in Supabase.");
    }
    throw new Error(error?.message ?? "Could not save the install report.");
  }

  if (jobId) {
    await supabase.from("ic_activity_log").insert({
      entity_type: "job",
      entity_id: jobId,
      action: "install_report_uploaded",
      actor_id: input.actorId,
      changes: { filename: input.filename, report_id: data.id },
    });
  }

  const note = jobId
    ? `Attached to the job from ${input.filename}.`
    : `No job matched ${input.filename} yet. It is on the Install reports tab.`;
  return {
    id: String(data.id),
    order_name: identity.orderName,
    job_id: jobId,
    message: `Install report ${identity.orderName} saved. ${note}`,
  };
}

export async function attachInstallReport(input: {
  reportId: string;
  jobId: string;
}): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_install_reports")
    .update({
      job_id: input.jobId,
      status: "attached",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.reportId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && missingInstallReportTable(error.message)) {
      throw new Error("Run drizzle/0031_ic_install_reports.sql in Supabase.");
    }
    throw new Error(error?.message ?? "Could not attach install report.");
  }
  return data as Record<string, unknown>;
}
