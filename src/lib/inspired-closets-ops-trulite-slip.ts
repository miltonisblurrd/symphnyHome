/**
 * Trulite cut-size orders. No SKU — thickness, size, type, style, qty.
 * The size is the scan stand-in so Browse can confirm the piece.
 */

const THICKNESS = String.raw`\d+(?:\s+\d+/\d+|/\d+|\.\d+)?`;

export type TruliteCut = {
  thickness: string;
  height: string;
  width: string;
  type: string;
  style: string;
  qty: number;
  note: string | null;
  item_number: string;
  description: string;
};

export function looksLikeTruliteSlip(text: string, filename?: string | null): boolean {
  const hay = `${filename ?? ""}\n${text}`;
  if (!/trulite/i.test(hay)) return false;
  return /purchase\s+order/i.test(text) && /thickness/i.test(text) && /\bquan/i.test(text);
}

function titleWords(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cutFromLine(line: string): Omit<TruliteCut, "note" | "description"> | null {
  const qtyMatch = line.match(/^(.*\S)\s+(\d+)\s*$/);
  if (!qtyMatch) return null;
  const qty = Number(qtyMatch[2]);
  if (!Number.isFinite(qty) || qty < 1) return null;
  const sized = qtyMatch[1]!.match(new RegExp(`^(${THICKNESS})\\s+(.+?)\\s+[xX]\\s+(.+)$`));
  if (!sized) return null;
  const thickness = sized[1]!.replace(/\s+/g, " ").trim();
  const height = sized[2]!.replace(/\s+/g, " ").trim();
  const right = sized[3]!.replace(/\s+/g, " ").trim().split(/\s+/);
  const words: string[] = [];
  while (right.length > 0 && /^[A-Za-z][A-Za-z-]*$/.test(right[right.length - 1]!)) {
    words.unshift(right.pop()!);
  }
  if (right.length === 0 || words.length === 0) return null;
  const width = right.join(" ");
  const style = words[words.length - 1]!;
  const type = words.length > 1 ? words.slice(0, -1).join(" ") : "";
  return {
    thickness,
    height,
    width,
    type,
    style,
    qty,
    item_number: `${thickness} ${height} x ${width}`,
  };
}

function isNote(line: string): boolean {
  return /^(please|plase|note)\b/i.test(line) || /\b(no logo|seam edges|polish)\b/i.test(line);
}

export function parseTruliteCuts(text: string): TruliteCut[] {
  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const cuts: TruliteCut[] = [];
  for (const line of lines) {
    const cut = cutFromLine(line);
    if (cut) {
      const glass = titleWords([cut.type, cut.style].filter(Boolean).join(" "));
      cuts.push({
        ...cut,
        note: null,
        description: glass || "Glass",
      });
      continue;
    }
    if (cuts.length > 0 && isNote(line)) {
      const last = cuts[cuts.length - 1]!;
      const note = titleWords(line.replace(/^(please|plase)\s+/i, ""));
      last.note = last.note ? `${last.note}. ${note}` : note;
      last.description = `${last.description}. ${note}`;
    }
  }
  return cuts;
}

export function trulitePurchaseOrder(text: string): string | null {
  const match = text.match(/purchase\s+order\s+([^\n]+)/i);
  const po = (match?.[1] ?? "").replace(/\s+/g, " ").trim();
  if (!po || /^install\b/i.test(po)) return null;
  return po;
}

export function truliteOrderDate(text: string): string | null {
  const match = text.match(/date\s+ordered\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  return match?.[1] ?? null;
}
