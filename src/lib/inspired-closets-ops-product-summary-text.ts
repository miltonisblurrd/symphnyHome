/**
 * Deterministic reader for Stow / Studio product-summary PDFs.
 * Frank uploads the Studio export; we read the printed table instead of sending
 * the whole file to a model (those calls time out on 100+ line orders).
 */

type ParsedSummaryLine = {
  line_no: number | null;
  item_code: string;
  description: string;
  product_type: string;
  dimensions: string | null;
  finish: string | null;
  qty: number;
  total_cents: number;
};

export type ParsedStowSummary = {
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

const PRODUCT_TYPES = [
  "hardware",
  "components",
  "cabinet",
  "trim",
  "accents",
  "accessories",
  "slatwall",
  "front",
  "shelf",
  "cleat",
  "deck",
  "door",
  "filler",
  "rod",
  "rail",
  "wrap",
  "bottom",
];

const NUMBERED_RE = /^(\d+)\s*[-–]\s*([A-Za-z]{1,4}|\d{6,})(?:\s+(.*))?$/;
const CATALOG_RE = /^(10000\d+|20000\d+|40000\d+)(?:\s+(.*))?$/;
const SKIP = /^(LINE\s*\/\s*ITEM|Items|Details|Shipping|Ship To:)/i;
const DIM_RE =
  /\d+(?:\.\d+)?"(?:\s*[HWD])?(?:\s*x\s*\d+(?:\.\d+)?"(?:\s*[HWD])?)*/;

function moneyToCents(value: string): number {
  const raw = value.replace(/[$,\s]/g, "");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
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

function clean(value: string | null | undefined): string | null {
  const next = (value ?? "").trim();
  if (!next || next === "-") return null;
  return next;
}

function headerPrefixed(lines: string[], label: string, skip?: RegExp): string | null {
  const hit = lines.find((line) => {
    if (!(line.startsWith(`${label} `) || line.startsWith(`${label}:`))) return false;
    const value = line.slice(label.length).replace(/^[:\s]+/, "");
    return skip ? !skip.test(value) : true;
  });
  if (hit) return hit.slice(label.length).replace(/^[:\s]+/, "").trim() || null;
  const index = lines.findIndex((line) => line === label);
  if (index >= 0) return lines[index + 1] ?? null;
  return null;
}

function embeddedValue(text: string, label: string): string | null {
  const match = text.match(new RegExp(`${label}\\s*[:]?\\s*(\\S+)`, "i"));
  return match?.[1] ?? null;
}

function isCompleteRest(rest: string): boolean {
  return /(?:\d+\s+(?:\$[\d,]+(?:\.\d{2})?|-)|(?:\$[\d,]+(?:\.\d{2})?|-))\s*$/.test(rest);
}

function splitRest(rest: string): Omit<ParsedSummaryLine, "line_no" | "item_code"> {
  let working = rest.trim();
  let totalCents = 0;
  const money = working.match(/^(.*)\s+(\$[\d,]+(?:\.\d{2})?|-)$/);
  if (money) {
    if (money[2].startsWith("$")) totalCents = moneyToCents(money[2]);
    working = money[1].trim();
  }
  let qty = 1;
  const qtyMatch = working.match(/^(.*)\s+(\d+)$/);
  if (qtyMatch) {
    qty = Math.max(1, Number(qtyMatch[2]));
    working = qtyMatch[1].trim();
  }

  const types = [...working.matchAll(new RegExp(`\\b(${PRODUCT_TYPES.join("|")})\\b`, "gi"))];
  const typeHit =
    types.find((hit) => {
      if (hit.index === undefined) return false;
      const after = working.slice(hit.index + hit[0].length).trim();
      const dimAtStart = after.match(DIM_RE);
      return !after || after.startsWith("-") || dimAtStart?.index === 0;
    }) ?? types.at(-1);
  let description = working;
  let productType = "";
  let afterType = "";
  if (typeHit && typeHit.index !== undefined) {
    productType = typeHit[0];
    description = working.slice(0, typeHit.index).trim();
    afterType = working.slice(typeHit.index + typeHit[0].length).trim();
  }

  let dimensions: string | null = null;
  let finish: string | null = null;
  if (!afterType || afterType === "-") {
    finish = null;
  } else if (afterType.startsWith("-")) {
    finish = clean(afterType.replace(/^-\s*/, ""));
  } else {
    const dim = afterType.match(DIM_RE);
    if (dim && dim.index !== undefined) {
      dimensions = dim[0];
      finish = clean(afterType.slice(dim.index + dim[0].length));
    } else {
      finish = clean(afterType);
    }
  }

  return {
    description,
    product_type: productType,
    dimensions,
    finish,
    qty,
    total_cents: totalCents,
  };
}

function parseOneLine(
  lineNo: number | null,
  itemCode: string,
  rest: string,
): ParsedSummaryLine {
  return { line_no: lineNo, item_code: itemCode, ...splitRest(rest) };
}

export function looksLikeProductSummary(text: string): boolean {
  return /Sales Order Number/i.test(text) && /LINE\s*\/\s*ITEM/i.test(text);
}

/** Stow truck PDF: palettes + shipment notice, not a Studio order table. */
export function looksLikePackingSlip(text: string): boolean {
  const packingList = /packing list/i.test(text) && /shipment notice/i.test(text);
  const palletTable = /container id/i.test(text) && /cust ref/i.test(text);
  return packingList || palletTable;
}

export function parseStowProductSummaryText(
  text: string,
  filename: string,
): ParsedStowSummary | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const start = lines.findIndex((line) => NUMBERED_RE.test(line) || CATALOG_RE.test(line));
  const end = lines.findIndex((line, index) => index > start && /^Shipping$/.test(line));
  if (start < 0) return null;
  const body = lines.slice(start, end > start ? end : undefined);

  const items: ParsedSummaryLine[] = [];
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    if (SKIP.test(line)) {
      i += 1;
      continue;
    }
    const numbered = line.match(NUMBERED_RE);
    if (numbered) {
      const rest = (numbered[3] ?? "").trim();
      if (rest && isCompleteRest(rest)) {
        items.push(parseOneLine(Number(numbered[1]), numbered[2], rest));
        i += 1;
        continue;
      }
      const fields: string[] = rest ? [rest] : [];
      i += 1;
      while (
        i < body.length &&
        !NUMBERED_RE.test(body[i]) &&
        !CATALOG_RE.test(body[i]) &&
        !SKIP.test(body[i])
      ) {
        fields.push(body[i]);
        i += 1;
      }
      items.push(parseOneLine(Number(numbered[1]), numbered[2], fields.join(" ")));
      continue;
    }
    const catalog = line.match(CATALOG_RE);
    if (catalog) {
      const rest = (catalog[2] ?? "").trim();
      if (rest && isCompleteRest(rest)) {
        items.push(parseOneLine(items.length + 1, catalog[1], rest));
        i += 1;
        continue;
      }
      const fields: string[] = rest ? [rest] : [];
      i += 1;
      while (
        i < body.length &&
        !NUMBERED_RE.test(body[i]) &&
        !CATALOG_RE.test(body[i]) &&
        !SKIP.test(body[i])
      ) {
        fields.push(body[i]);
        i += 1;
      }
      items.push(parseOneLine(items.length + 1, catalog[1], fields.join(" ")));
      continue;
    }
    i += 1;
  }

  if (items.length === 0) return null;

  const joined = lines.join("\n");
  const itemCount = Number(headerPrefixed(lines, "Number of Items")) || items.length;
  const orderName = headerPrefixed(lines, "Order", /^(ID|Purchased|Total|Created)\b/i);

  return {
    order_name: orderName,
    order_id: headerPrefixed(lines, "Order ID"),
    so_number: headerPrefixed(lines, "Sales Order Number"),
    purchased_on: toIsoDate(headerPrefixed(lines, "Order Purchased") ?? headerPrefixed(lines, "Cart Created")),
    ship_date: toIsoDate(
      embeddedValue(joined, "Requested Ship Date") ?? headerPrefixed(lines, "Requested Ship Date:"),
    ),
    item_count: itemCount,
    total_cents: moneyToCents(headerPrefixed(lines, "Order Total") ?? ""),
    lines: items,
    parse_quality: {
      source: "stow-text",
      filename,
      line_count: items.length,
      header_item_count: itemCount,
      line_gap: itemCount - items.length,
    },
  };
}

export function summaryParseIsUsable(parsed: ParsedStowSummary): boolean {
  if (parsed.lines.length === 0) return false;
  if (!parsed.order_name && !parsed.so_number) return false;
  const expected = parsed.item_count || parsed.lines.length;
  return parsed.lines.length >= Math.max(1, Math.floor(expected * 0.9));
}
