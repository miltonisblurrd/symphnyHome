/**
 * Stow web-cart product summary ("Design ID", columns Part Number · Style ·
 * Quantity · Description · Height · Width · Depth · Price Per · Total Price).
 * Every row ends with two prices; cut parts have no part number and are
 * followed by attribute lines (EdgebandType, GrainDirection, …).
 */
import type { ParsedStowSummary } from "@/lib/inspired-closets-ops-product-summary-text";

type CartLine = ParsedStowSummary["lines"][number];

const SECTION = /^(Components|Fronts|Hardware|Accents|Accessories|Trim|Slatwall|Doors|Cabinets|Lighting|Other|CTO|Custom)$/;
const HEADER_FRAGMENT =
  /^(Purchased\b.*|Number|Style Quantit.*|y|Description Heigh.*|t|Width Depth.*|Price|Height Width.*)$/;
const NOISE = /^(Price Total:|Page \d+ of \d+|Design ID:|Total Price:|Order Total:)/i;
const ROW_END = /\$[\d,]+(?:\.\d{2})?\s+\$[\d,]+(?:\.\d{2})?$/;
const PRICES = /\s*\$([\d,]+(?:\.\d{2})?)\s+\$([\d,]+(?:\.\d{2})?)$/;
/** "Purchase Item: No" rows print only a total. */
const ROW_END_TOTAL_ONLY = /\$[\d,]+(?:\.\d{2})?$/;
const PRICE_TOTAL_ONLY = /\s*()\$([\d,]+(?:\.\d{2})?)$/;
const SERVICE = /\btear[- ]?out\b/i;
const DIM_TOKEN = /\s(\d+(?:\.\d+)?")$/;
const CATALOG = /^(\d{9})\s+/;

const SECTION_TYPE: Record<string, string> = {
  Components: "components",
  Fronts: "front",
  Hardware: "hardware",
  Accents: "accents",
  Accessories: "accessories",
  Trim: "trim",
  Slatwall: "slatwall",
  Doors: "door",
  Cabinets: "cabinet",
  Lighting: "accessories",
  CTO: "components",
  Custom: "components",
  Other: "",
};

export function looksLikeStowCartSummary(text: string): boolean {
  return /Design ID:/i.test(text) && /Purchased Part/i.test(text);
}

function isAttributeLine(line: string): boolean {
  if (ROW_END.test(line) || /^Purchase Item:/i.test(line)) return false;
  return /\b[\w ()]+:\s/.test(line) || /GrainDirection|EdgebandType|wood color style/i.test(line);
}

function parseRow(raw: string, section: string, lineNo: number, totalOnly: boolean): CartLine | null {
  let text = raw.replace(/(\d)\s+"/g, '$1"').replace(/\s+/g, " ").trim();
  const prices = text.match(totalOnly ? PRICE_TOTAL_ONLY : PRICES);
  if (!prices) return null;
  const totalCents = Math.round(Number(prices[2].replace(/,/g, "")) * 100);
  text = text.slice(0, prices.index).trim();

  const dims: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const hit = text.match(DIM_TOKEN);
    if (!hit) break;
    dims.unshift(hit[1]);
    text = text.slice(0, hit.index).trim();
  }

  let code = "";
  const catalog = text.match(CATALOG);
  if (catalog) {
    code = catalog[1];
    text = text.slice(catalog[0].length);
  }
  const tokens = text.split(" ");
  const qtyAt = tokens.findIndex((token) => /^\d{1,4}$/.test(token));
  if (qtyAt < 0) return null;
  const before = tokens.slice(0, qtyAt).join(" ");
  const description = tokens.slice(qtyAt + 1).join(" ");
  if (!code) code = description.split(" ")[0] ?? "";
  if (!catalog && SERVICE.test(`${before} ${description}`)) return null;

  return {
    line_no: lineNo,
    item_code: code,
    description: catalog ? description : [before, description].filter(Boolean).join(" · "),
    product_type: SECTION_TYPE[section] ?? "",
    dimensions: dims.length > 0 ? dims.join(" x ") : null,
    finish: catalog && before ? before : null,
    qty: Math.max(1, Number(tokens[qtyAt])),
    total_cents: totalCents,
  };
}

export function parseStowCartSummary(text: string, filename: string): ParsedStowSummary | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const items: CartLine[] = [];
  let section = "";
  let pending: string[] = [];
  let unread = 0;
  let skipped = 0;
  let totalOnly = false;
  for (const line of lines) {
    if (SECTION.test(line)) {
      section = line;
      totalOnly = false;
      pending = [];
      continue;
    }
    if (/^Purchase Item:\s*No/i.test(line)) {
      totalOnly = true;
      pending = [];
      continue;
    }
    if (HEADER_FRAGMENT.test(line) || NOISE.test(line)) {
      pending = [];
      continue;
    }
    if (pending.length === 0 && isAttributeLine(line)) continue;
    pending.push(line);
    if (!(totalOnly ? ROW_END_TOTAL_ONLY : ROW_END).test(line)) continue;
    const joined = pending.join(" ");
    pending = [];
    const row = parseRow(joined, section, items.length + 1, totalOnly);
    if (row) items.push(row);
    else if (SERVICE.test(joined)) skipped += 1;
    else unread += 1;
  }
  if (items.length === 0) return null;

  const designId = text.match(/Design ID:\s*(\S+)/i)?.[1] ?? null;
  const printedTotal = Number(text.match(/Total Price:\s*\$?([\d,]+(?:\.\d{2})?)/i)?.[1]?.replace(/,/g, "") ?? NaN);
  const totalCents = items.reduce((sum, line) => sum + line.total_cents, 0);
  return {
    order_name: designId,
    order_id: designId,
    so_number: null,
    purchased_on: null,
    ship_date: null,
    item_count: items.length,
    total_cents: Number.isFinite(printedTotal) ? Math.round(printedTotal * 100) : totalCents,
    lines: items,
    parse_quality: {
      source: "stow-cart",
      filename,
      line_count: items.length,
      unread_rows: unread,
      skipped_services: skipped,
      printed_total_cents: Number.isFinite(printedTotal) ? Math.round(printedTotal * 100) : null,
      lines_total_cents: totalCents,
    },
  };
}
