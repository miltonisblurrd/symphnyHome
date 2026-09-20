import { getSupabaseAdmin } from "@/db/client";
import { extractPdfText } from "@/lib/inspired-closets-ops-pdf-text";
import { shipDateFromSlipText } from "@/lib/inspired-closets-ops-ship-date";

export type SlipHeader = {
  order_name: string | null;
  order_number: string | null;
  so_number: string | null;
  po_number: string | null;
  reference: string | null;
  order_total: number | null;
  weight_lbs: number | null;
  ship_from: string | null;
  ship_date: string | null;
};

function money(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clean(value: string | null | undefined): string | null {
  const next = (value ?? "").replace(/\s+/g, " ").trim();
  if (!next || next === "-" || next === ":") return null;
  if (/\b(due to|tariff|prices may)\b/i.test(next)) return null;
  return next;
}

export function slipHeaderFromText(text: string): SlipHeader {
  const page = text.replace(/\u00a0/g, " ");
  const orderName = page.match(/(?:^|\n)Order\s+([A-Z][A-Za-z]+[-_]\d{5,8})\b/)?.[1] ?? null;
  const so =
    page.match(/Sales Order Number\s+(\d{5,})/i)?.[1] ??
    page.match(/\bSO(?:\s|#|:)*\s*(\d{5,})\b/i)?.[1] ??
    null;
  const orderNumber =
    page.match(/Order no\.?\s+([A-Z]?\d{5,})/i)?.[1] ??
    page.match(/ORDER\s*#\s*(\d{5,})/i)?.[1] ??
    so;
  const po =
    clean(page.match(/(?:Your Purchase Order Number|Your PO number|PO no\.?)\s*:?\s*([^\n]+)/i)?.[1]) ??
    null;
  const reference = page.match(/Reference Number:\s*(\d{5,})/i)?.[1] ?? null;
  const totalMatch =
    page.match(/Estimated total\s*\$?\s*([\d,]+(?:\.\d{2})?)/i) ??
    page.match(/Grand Total\s*\*?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i) ??
    page.match(/Order Total\s*\$?\s*([\d,]+(?:\.\d{2})?)/i) ??
    page.match(/(?:^|\n)Total:\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  const weight = page.match(/app(?:roximate|oximate)?\s+weight\s*([\d,.]+)/i)?.[1];
  const shipFrom = clean(page.match(/ship from\s+([^.\n]+)/i)?.[1]);
  const shipDate = shipDateFromSlipText(page);

  return {
    order_name: clean(orderName),
    order_number: clean(orderNumber),
    so_number: clean(so),
    po_number: po,
    reference: clean(reference),
    order_total: money(totalMatch?.[1]),
    weight_lbs: money(weight),
    ship_from: shipFrom,
    ship_date: shipDate,
  };
}

function asQuality(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function headerReady(quality: Record<string, unknown>): boolean {
  return Boolean(
    quality.header_sourced ||
      (quality.order_total && (quality.order_name || quality.order_number || quality.so_number)),
  );
}

async function downloadPdf(ship: {
  storage_path?: string | null;
  public_url?: string | null;
}): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  if (ship.storage_path) {
    const { data, error } = await supabase.storage.from("ic-field-media").download(ship.storage_path);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }
  if (ship.public_url) {
    try {
      const response = await fetch(ship.public_url);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

/** Read name / SO / PO / total / weight from the stored slip and persist them. */
export async function ensureShipmentHeaderFacts(ship: {
  id: string;
  notice?: string | null;
  source_filename?: string | null;
  storage_path?: string | null;
  public_url?: string | null;
  parse_quality?: unknown;
}): Promise<Record<string, unknown>> {
  const quality = asQuality(ship.parse_quality);
  if (headerReady(quality)) return quality;

  const bytes = await downloadPdf(ship);
  if (!bytes) return quality;
  let text = "";
  try {
    text = (await extractPdfText(bytes)).text;
  } catch {
    return quality;
  }
  const header = slipHeaderFromText(text);
  const next: Record<string, unknown> = {
    ...quality,
    header_sourced: true,
    order_name: header.order_name ?? quality.order_name ?? null,
    order_number: header.order_number ?? quality.order_number ?? null,
    so_number: header.so_number ?? quality.so_number ?? null,
    po_number: header.po_number ?? quality.po_number ?? null,
    reference: header.reference ?? quality.reference ?? null,
    order_total: header.order_total ?? quality.order_total ?? null,
    weight_lbs: header.weight_lbs ?? quality.weight_lbs ?? null,
    ship_from: header.ship_from ?? quality.ship_from ?? null,
  };
  const supabase = getSupabaseAdmin();
  await supabase
    .from("ic_shipments")
    .update({ parse_quality: next, updated_at: new Date().toISOString() })
    .eq("id", ship.id);
  return next;
}
