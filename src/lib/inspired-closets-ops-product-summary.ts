/**
 * Stow / Studio product-summary reader.
 * Every summary uses the same layout (order header + line table).
 * Cut wood is always ordered. Catalog hardware is matched to the ledger.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/db/client";
import { applyJobTierFromLines, stampJobFirst, updateJobCompat } from "@/lib/inspired-closets-ops-job-spine";
import { availableQty } from "@/lib/inspired-closets-ops-inventory";
import { extractPdfText } from "@/lib/inspired-closets-ops-pdf-text";
import {
  looksLikePackingSlip,
  looksLikeProductSummary,
  parseStowProductSummaryText,
  summaryParseIsUsable,
} from "@/lib/inspired-closets-ops-product-summary-text";

export const SUMMARY_CLASS = ["stock", "short", "order_stow", "unmatched"] as const;
export type SummaryClass = (typeof SUMMARY_CLASS)[number];

export type ParsedSummaryLine = {
  line_no: number | null;
  item_code: string;
  description: string;
  product_type: string;
  dimensions: string | null;
  finish: string | null;
  qty: number;
  total_cents: number;
};

export type ParsedProductSummary = {
  order_name: string | null;
  order_id: string | null;
  so_number: string | null;
  purchased_on: string | null;
  ship_date: string | null;
  item_count: number;
  total_cents: number;
  lines: ParsedSummaryLine[];
  parse_quality: Record<string, unknown>;
};

export type MatchedSummaryLine = ParsedSummaryLine & {
  classification: SummaryClass;
  part_id: string | null;
  part_name: string | null;
  available_qty: number;
  reserve_qty: number;
  order_qty: number;
};

const STOCKABLE_TYPES =
  /hardware|accessor|accent|led|slatwall|wrap|bottom|handle|rod|rail|cam|hamper|valet|scribe|screw|slide/i;

const WOOD_TYPES = /component|front|cabinet|trim|deck|cleat|toe kick|back panel|vert|shelf|door|filler/i;

function catalogSku(code: string): string | null {
  const digits = code.replace(/\s+/g, "");
  if (/^(10000|20000|40000)\d+$/.test(digits) && digits.length >= 8) return digits;
  return null;
}

function moneyToCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value < 200000 && value % 1 !== 0 ? value * 100 : value);
  }
  const raw = String(value ?? "").replace(/[$,\s]/g, "");
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, mm, dd, yyyy] = slash;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

export function classifySummaryLine(line: ParsedSummaryLine): "stockable" | "cut_wood" {
  if (catalogSku(line.item_code)) return "stockable";
  if (STOCKABLE_TYPES.test(line.product_type) || STOCKABLE_TYPES.test(line.description)) {
    return "stockable";
  }
  if (WOOD_TYPES.test(line.product_type) || WOOD_TYPES.test(line.description)) {
    return "cut_wood";
  }
  return "cut_wood";
}

const PARSE_SYSTEM = `You extract a Stow / Inspired Closets Studio PRODUCT SUMMARY (not a packing slip).
The PDF header has Order (NAME-MMDDYY), Order ID, Sales Order Number, Cart Created / Order Purchased, Number of Items, Order Total, Requested Ship Date.
The table columns are: LINE / ITEM #, DESCRIPTION, PRODUCT TYPE, DIMENSIONS, FINISH, QUANTITY, TOTAL.
Two item identities:
- Cut parts look like "16 - VT" or "80 - SH" (studio codes WS VT SH TR SC HP FF DW DR DK CK BP).
- Catalog / hardware SKUs are long digits like 100001376, 200000403, 400001368. If a line wraps as "283 -" then "200000413", the item_code is 200000413.
Return ONLY JSON:
{
  "order_name": string|null,
  "order_id": string|null,
  "so_number": string|null,
  "purchased_on": "YYYY-MM-DD"|null,
  "ship_date": "YYYY-MM-DD"|null,
  "item_count": number,
  "total_cents": number,
  "lines": [{
    "line_no": number|null,
    "item_code": string,
    "description": string,
    "product_type": string,
    "dimensions": string|null,
    "finish": string|null,
    "qty": number,
    "total_cents": number
  }]
}
Do not invent SKUs. Skip repeated column-header rows. Qty defaults to 1. Dollar totals become cents (31.89 → 3189). Extract every line.`;

export function parsedProductSummaryFromUnknown(
  parsed: {
    order_name?: string | null;
    order_id?: string | null;
    so_number?: string | null;
    purchased_on?: string | null;
    ship_date?: string | null;
    item_count?: number;
    total_cents?: number;
    total?: unknown;
    lines?: Array<Record<string, unknown>>;
    parse_quality?: Record<string, unknown>;
  },
  filename: string,
): ParsedProductSummary {
  const lines = (parsed.lines ?? [])
    .map((row, index): ParsedSummaryLine => {
      const itemCode = String(row.item_code ?? row.item_number ?? "").trim();
      const lineNo = Number(row.line_no ?? row.line ?? index + 1);
      return {
        line_no: Number.isFinite(lineNo) && lineNo > 0 ? lineNo : index + 1,
        item_code: itemCode,
        description: String(row.description ?? "").trim(),
        product_type: String(row.product_type ?? "").trim(),
        dimensions: String(row.dimensions ?? "").trim() || null,
        finish: String(row.finish ?? "").trim() || null,
        qty: Math.max(1, Math.round(Number(row.qty) || 1)),
        total_cents: moneyToCents(row.total_cents ?? row.total),
      };
    })
    .filter((line) => line.item_code || line.description);

  return {
    order_name: parsed.order_name?.trim() || null,
    order_id: parsed.order_id?.trim() || null,
    so_number: parsed.so_number?.trim() || null,
    purchased_on: toIsoDate(parsed.purchased_on),
    ship_date: toIsoDate(parsed.ship_date),
    item_count: Number(parsed.item_count) || lines.length,
    total_cents: moneyToCents(parsed.total_cents ?? parsed.total) ||
      lines.reduce((sum, line) => sum + line.total_cents, 0),
    lines,
    parse_quality: {
      line_count: lines.length,
      filename,
      ...(parsed.parse_quality ?? {}),
    },
  };
}

const FRANK_SUMMARY_ERROR =
  "This file is not a Studio product summary with selectable text. Export PDF from Studio (Product Summary), not a photo, scan, packing slip, or order confirmation.";

const PACKING_SLIP_ON_JOB_ERROR =
  "This is a Stow packing list (shipment notice / palettes). Upload it under Receiving, not on the job.";

export async function parseProductSummary(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ParsedProductSummary> {
  const isPdf = input.mimeType.includes("pdf") || /\.pdf$/i.test(input.filename);
  if (isPdf) {
    let extracted: { text: string; pages: number };
    try {
      extracted = await extractPdfText(input.bytes);
    } catch {
      throw new Error(FRANK_SUMMARY_ERROR);
    }
    if (looksLikePackingSlip(extracted.text) && !looksLikeProductSummary(extracted.text)) {
      throw new Error(PACKING_SLIP_ON_JOB_ERROR);
    }
    const local = parseStowProductSummaryText(extracted.text, input.filename);
    if (local && summaryParseIsUsable(local)) {
      local.parse_quality = {
        ...local.parse_quality,
        pages: extracted.pages,
        chars: extracted.text.length,
      };
      return local;
    }
    if (!extracted.text.trim() || extracted.text.replace(/\s/g, "").length < 80) {
      throw new Error(FRANK_SUMMARY_ERROR);
    }
    if (looksLikePackingSlip(extracted.text)) {
      throw new Error(PACKING_SLIP_ON_JOB_ERROR);
    }
    if (!looksLikeProductSummary(extracted.text)) {
      throw new Error(FRANK_SUMMARY_ERROR);
    }
    throw new Error(
      `Could not read every line from ${input.filename}. Re-export the Product Summary from Studio and try again.`,
    );
  }

  return parseProductSummaryWithModel(input);
}

async function parseProductSummaryWithModel(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ParsedProductSummary> {
  const apiKey =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(FRANK_SUMMARY_ERROR);
  }

  const client = new Anthropic({ apiKey });
  const model =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-5";

  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    system: PARSE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: (input.mimeType.startsWith("image/")
                ? input.mimeType
                : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: input.bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: `Extract every line from this product summary (${input.filename}). JSON only.`,
          },
        ],
      },
    ],
  });
  const message = await stream.finalMessage();
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return parsedProductSummaryFromUnknown(JSON.parse(jsonText), input.filename);
}

type PartRow = {
  id: string;
  sku: string;
  name: string;
  color: string | null;
  size: string | null;
  barcode: string | null;
  qty_on_hand: number;
  qty_reserved: number;
};

function same(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function findPart(parts: PartRow[], line: ParsedSummaryLine): PartRow | null {
  const sku = catalogSku(line.item_code) ?? line.item_code.trim();
  if (sku) {
    const byCode = parts.find(
      (part) => same(part.sku, sku) || same(part.barcode, sku) || part.sku.includes(sku),
    );
    if (byCode) return byCode;
  }
  const nameHits = parts.filter((part) => {
    if (!line.description) return false;
    const hay = `${part.name} ${part.color ?? ""}`.toLowerCase();
    const needle = line.description.toLowerCase();
    return hay.includes(needle) || needle.includes(part.name.toLowerCase());
  });
  const tightened = nameHits.filter(
    (part) =>
      (!line.finish || same(part.color, line.finish) || !part.color) &&
      (!line.dimensions || !part.size || line.dimensions.includes(String(part.size))),
  );
  if (tightened.length === 1) return tightened[0];
  if (nameHits.length === 1) return nameHits[0];
  return null;
}

export async function matchSummaryLines(lines: ParsedSummaryLine[]): Promise<MatchedSummaryLine[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ic_parts")
    .select("id, sku, name, color, size, barcode, qty_on_hand, qty_reserved")
    .is("deleted_at", null)
    .eq("active", true)
    .limit(5000);
  const parts = (data ?? []) as PartRow[];

  return lines.map((line) => {
    const kind = classifySummaryLine(line);
    if (kind === "cut_wood") {
      return {
        ...line,
        classification: "order_stow" as const,
        part_id: null,
        part_name: null,
        available_qty: 0,
        reserve_qty: 0,
        order_qty: line.qty,
      };
    }
    const part = findPart(parts, line);
    if (!part) {
      return {
        ...line,
        classification: "unmatched" as const,
        part_id: null,
        part_name: null,
        available_qty: 0,
        reserve_qty: 0,
        order_qty: line.qty,
      };
    }
    const available = availableQty(part.qty_on_hand, part.qty_reserved);
    const reserve = Math.min(available, line.qty);
    const order = Math.max(0, line.qty - reserve);
    return {
      ...line,
      classification: (order === 0 ? "stock" : reserve > 0 ? "short" : "unmatched") as SummaryClass,
      part_id: part.id,
      part_name: [part.name, part.color, part.size].filter(Boolean).join(" · "),
      available_qty: available,
      reserve_qty: reserve,
      order_qty: order,
    };
  });
}

export function missingSummaryTable(message: string): boolean {
  return /ic_job_summar|ready_to_order|archived_at|schema cache|does not exist/i.test(message);
}

function lineRow(summaryId: string, line: MatchedSummaryLine) {
  return {
    summary_id: summaryId,
    line_no: line.line_no,
    item_code: line.item_code,
    description: line.description,
    product_type: line.product_type,
    dimensions: line.dimensions,
    finish: line.finish,
    qty: line.qty,
    total_cents: line.total_cents,
    classification: line.classification,
    part_id: line.part_id,
    available_qty: line.available_qty,
    reserve_qty: line.reserve_qty,
    order_qty: line.order_qty,
  };
}

export async function persistJobProductSummary(input: {
  jobId: string;
  filename: string;
  storagePath: string;
  publicUrl: string | null;
  parsed: ParsedProductSummary;
  actorId: string | null;
}): Promise<{
  summary: Record<string, unknown>;
  lines: MatchedSummaryLine[];
}> {
  const matched = await matchSummaryLines(input.parsed.lines);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { data: summary, error: insertError } = await supabase
    .from("ic_job_summaries")
    .insert({
      job_id: input.jobId,
      order_name: input.parsed.order_name,
      order_id: input.parsed.order_id,
      so_number: input.parsed.so_number,
      purchased_on: input.parsed.purchased_on,
      ship_date: input.parsed.ship_date,
      item_count: input.parsed.item_count,
      total_cents: input.parsed.total_cents,
      source_filename: input.filename,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      status: "review",
      parse_quality: input.parsed.parse_quality,
      created_by: input.actorId,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (insertError || !summary) {
    throw new Error(insertError?.message ?? "Could not save summary.");
  }

  const rows = matched.map((line) => lineRow(summary.id, line));
  const chunk = 80;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from("ic_job_summary_lines").insert(rows.slice(i, i + chunk));
    if (error) throw error;
  }

  if (input.parsed.order_name || input.parsed.so_number) {
    try {
      await updateJobCompat(input.jobId, {
        studio_ref: input.parsed.order_name ?? input.parsed.so_number,
      });
    } catch {
      /* studio_ref / spine columns may not exist yet */
    }
  }
  try {
    await applyJobTierFromLines({ jobId: input.jobId, lines: matched });
    await stampJobFirst(input.jobId, "ordered_at");
  } catch {
    /* tier columns are optional for the upload to succeed */
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: input.jobId,
    action: "summary_uploaded",
    actor_id: input.actorId,
    changes: { filename: input.filename, lines: matched.length, source: "receiving" },
  });

  return { summary, lines: matched };
}
