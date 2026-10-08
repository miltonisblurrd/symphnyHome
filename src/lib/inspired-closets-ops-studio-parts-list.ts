/**
 * Studio design report → kit lines. The report's "Project Parts List" is the
 * pull sheet: QTY, ITEM #, DESCRIPTION, DIMENSIONS, printed two records per row.
 * Wall tables earlier in the report list the same parts by wall; reading those
 * double-counts and glues neighbouring cells together.
 */
import type { ParsedStowSummary } from "@/lib/inspired-closets-ops-product-summary-text";

type StudioLine = ParsedStowSummary["lines"][number];

const PAGE_FOOTER =
  /^(Inspired Closets Las Vegas|6445 W Sunset|Ste \d+$|Las Vegas, NV \d|\(702\)\s?821|Page \d+ of \d+)|www\.inspiredclosets/i;
const COLUMN_HEADER = /^(PULLED\s+)?(QTY ITEM #|ITEM # QUANTITY)/;
const SECTION = /^(Accents|CTO|Components|Custom|Fronts|Hardware|Trim|Accessories|Slatwall|Doors|Lighting|Other)$/;
/** Services and labour priced on the report. Nothing to pull. */
const SKIP_SECTION = /^Third Party Parts$/i;
const CODE = String.raw`\d{9}|[A-Z]{1,5}(?:-[A-Z]{1,4})?|Custom`;
/** Two-column layout: QTY ITEM # … QTY ITEM # … */
const RECORD_START = new RegExp(String.raw`(?:^|\s)(\d{1,4}) (${CODE})(?=\s|$)`, "g");
/** One-column layout: ITEM # QUANTITY DESCRIPTION. */
const CODE_FIRST = new RegExp(String.raw`^(${CODE}) (\d{1,4})(?:\s+(.*))?$`);
const TRAILING_DIMS = /\s+(\d+(?:\.\d+)?"[WH] x \d+(?:\.\d+)?"[WH])$/;
const ZERO_DIMS = /^0(\.0)?"[WH] x 0(\.0)?"[WH]$/;
const CUSTOM_CODE = /^([A-Z][A-Za-z]*-[A-Z]{1,4})\b\s*/;

/** Shelf vs truck reads product_type; Studio section names say it directly. */
const SECTION_TYPE: Record<string, string> = {
  Accents: "accents",
  Hardware: "hardware",
  Trim: "trim",
  Accessories: "accessories",
  Slatwall: "slatwall",
  Lighting: "accessories",
  CTO: "components",
  Components: "components",
  Custom: "components",
  Fronts: "front",
  Doors: "door",
  Other: "",
};

export function looksLikeStudioDesignReport(text: string): boolean {
  return /Project Parts List/i.test(text) || (/^Parts List$/m.test(text) && /QTY ITEM # DESCRIPTION/.test(text));
}

function projectName(lines: string[]): string | null {
  const named = lines.find((line) => line.startsWith("PROJECT NAME "));
  if (named) return named.slice("PROJECT NAME ".length).trim() || null;
  const header = lines.find((line) => /Project:\s*\S+/.test(line));
  return header?.match(/Project:\s*(\S+)/)?.[1] ?? null;
}

function sectionLines(lines: string[]): string[] {
  const project = lines.findIndex((line) => line.startsWith("Project Parts List"));
  if (project >= 0) return lines.slice(project + 1);
  const start = lines.findIndex((line) => line === "Parts List");
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /^(Estimate|DESIGN TOTAL)\b/.test(line));
  return lines.slice(start + 1, end > start ? end : undefined);
}

function splitRecords(line: string, codeFirst: boolean): Array<{ qty: number; code: string; rest: string }> | null {
  if (codeFirst) {
    const hit = line.match(CODE_FIRST);
    return hit ? [{ code: hit[1], qty: Number(hit[2]), rest: (hit[3] ?? "").trim() }] : null;
  }
  const hits = [...line.matchAll(RECORD_START)];
  if (hits.length === 0 || (hits[0].index ?? 0) > 0) return null;
  return hits.map((hit, index) => {
    const start = (hit.index ?? 0) + hit[0].length;
    const end = index + 1 < hits.length ? hits[index + 1].index ?? line.length : line.length;
    return { qty: Number(hit[1]), code: hit[2], rest: line.slice(start, end).trim() };
  });
}

function finishLine(raw: { qty: number; code: string; rest: string; section: string }, lineNo: number): StudioLine {
  let code = raw.code;
  let rest = raw.rest.replace(/\s+/g, " ").trim();
  if (code === "Custom") {
    const tail = rest.match(CUSTOM_CODE);
    if (tail) {
      code = `Custom ${tail[1]}`;
      rest = rest.slice(tail[0].length);
    }
  }
  let dimensions: string | null = null;
  const dims = rest.match(TRAILING_DIMS);
  if (dims) {
    dimensions = ZERO_DIMS.test(dims[1]) ? null : dims[1];
    rest = rest.slice(0, dims.index).trim();
  }
  return {
    line_no: lineNo,
    item_code: code,
    description: rest || code,
    product_type: SECTION_TYPE[raw.section] ?? "",
    dimensions,
    finish: null,
    qty: Math.max(1, raw.qty),
    total_cents: 0,
  };
}

export function parseStudioPartsList(text: string, filename: string): ParsedStowSummary | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  const body = sectionLines(lines);
  if (body.length === 0) return null;

  const open: Array<{ qty: number; code: string; rest: string; section: string }> = [];
  let section = "";
  let previous: Array<(typeof open)[number]> = [];
  let codeFirst = false;
  for (const line of body) {
    if (COLUMN_HEADER.test(line)) {
      codeFirst = /ITEM # QUANTITY/.test(line);
      previous = [];
      continue;
    }
    if (PAGE_FOOTER.test(line) || line.startsWith("Project Parts List")) {
      previous = [];
      continue;
    }
    if (SECTION.test(line) || SKIP_SECTION.test(line)) {
      section = line;
      previous = [];
      continue;
    }
    if (SKIP_SECTION.test(section)) continue;
    const records = splitRecords(line, codeFirst);
    if (!records) {
      // A wrapped cell continues the record that was cut short: a bare "Custom" first, else the left column.
      const target = previous.find((row) => !row.rest) ?? previous[0];
      if (target) target.rest = `${target.rest} ${line}`;
      continue;
    }
    previous = records.map((record) => ({ ...record, section }));
    open.push(...previous);
  }

  const items = open.map((raw, index) => finishLine(raw, index + 1));
  if (items.length === 0) return null;
  const leaked = items.filter((line) => /Inspired Closets|ITEM #|\$\d/.test(line.description)).length;
  const name = projectName(lines);
  return {
    order_name: name,
    order_id: null,
    so_number: null,
    purchased_on: null,
    ship_date: null,
    item_count: items.length,
    total_cents: 0,
    lines: items,
    parse_quality: {
      source: "studio-parts-list",
      filename,
      line_count: items.length,
      leaked_lines: leaked,
    },
  };
}
