/** Codes Bryant may scan: Hafele 792.10.521, Stow 400005129, padded 000…400005129. */

export function normalizeCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function codeKeys(value: string | null | undefined): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const norm = normalizeCode(raw);
  const stripped = norm.replace(/^0+/, "") || "0";
  return [...new Set([raw, norm, stripped])];
}

export function codesMatch(scanned: string, candidate: string | null | undefined): boolean {
  const keys = new Set(codeKeys(scanned));
  return codeKeys(candidate).some((key) => keys.has(key));
}

const HAFELE_PART = /\d{3}\.\d{2}\.\d{3}/g;
const LONG_DIGITS = /\d{6,}/g;

/** Pull separate codes out of a busy Hafele label instead of gluing every digit together. */
export function extractScanCandidates(raw: string): string[] {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(HAFELE_PART)) found.push(match[0]);
  for (const match of text.matchAll(LONG_DIGITS)) found.push(match[0]);
  const unique: string[] = [];
  for (const code of found) {
    if (!unique.some((existing) => codesMatch(existing, code))) unique.push(code);
  }
  return unique.sort((a, b) => {
    const hafeleA = /^\d{3}\.\d{2}\.\d{3}$/.test(a) ? 0 : 1;
    const hafeleB = /^\d{3}\.\d{2}\.\d{3}$/.test(b) ? 0 : 1;
    return hafeleA - hafeleB || b.length - a.length;
  });
}

export function pickScanCode(
  candidates: string[],
  items: Array<{
    item_number: string;
    vendor_sku?: string | null;
    container_id?: string | null;
    qty: number;
    received_qty: number;
  }>,
): string | null {
  if (candidates.length === 0 || items.length === 0) return null;
  const open = items.filter((item) => (item.received_qty ?? 0) < (item.qty ?? 1));
  const pool = open.length > 0 ? open : items;
  for (const scanned of candidates) {
    const hit = pool.find((item) =>
      [item.item_number, item.vendor_sku, item.container_id].some((value) => codesMatch(scanned, value)),
    );
    if (hit) return scanned;
  }
  const blob = candidates.map((code) => normalizeCode(code)).join("");
  for (const item of pool) {
    for (const value of [item.item_number, item.vendor_sku, item.container_id]) {
      for (const key of codeKeys(value)) {
        if (key.length >= 6 && blob.includes(normalizeCode(key))) return item.item_number;
      }
    }
  }
  return null;
}

export type MatchableLine = {
  item_number: string;
  vendor_sku?: string | null;
  container_id?: string | null;
  qty: number;
  received_qty: number;
};

const MIN_CODE_LEN = 6;

export function shipmentHasVendorSkus(
  items: Array<{ vendor_sku?: string | null }>,
): boolean {
  return items.some((item) => String(item.vendor_sku ?? "").trim().length > 0);
}

/** Modulus extractAndMatch: tokens, neighbor joins, and windows of codes already on the slip. */
export function extractAndMatch(raw: string, items: MatchableLine[]): string | null {
  const tokens = (String(raw ?? "").toUpperCase().match(/[0-9A-Z]+/g) ?? [])
    .map((token) => normalizeCode(token))
    .filter(Boolean);
  if (tokens.length === 0 || items.length === 0) return null;

  const lengths = new Set<number>();
  for (const item of items) {
    for (const value of [item.item_number, item.vendor_sku]) {
      for (const key of codeKeys(value)) {
        if (key.length >= MIN_CODE_LEN) lengths.add(key.length);
      }
    }
  }

  const seen = new Set<string>();
  const candidates: string[] = [];
  const add = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };
  for (const token of tokens) add(token);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    add(tokens[i] + tokens[i + 1]);
    if (i + 2 < tokens.length) add(tokens[i] + tokens[i + 1] + tokens[i + 2]);
  }
  const windows = [...lengths].sort((a, b) => b - a);
  for (const token of tokens) {
    for (const length of windows) {
      if (token.length <= length) continue;
      for (let i = 0; i <= token.length - length; i += 1) add(token.slice(i, i + length));
    }
  }
  candidates.sort((a, b) => b.length - a.length);

  const open = items.filter((item) => (item.received_qty ?? 0) < (item.qty ?? 1));
  const pools = open.length > 0 ? [open, items] : [items];
  for (const pool of pools) {
    for (const code of candidates) {
      const hit = pool.find((item) =>
        [item.item_number, item.vendor_sku].some((value) => codesMatch(code, value)),
      );
      if (!hit) continue;
      if (pool === open && (hit.received_qty ?? 0) >= (hit.qty ?? 1)) continue;
      return code;
    }
  }
  return null;
}

export function isStowItemCode(value: string): boolean {
  return /^300\d{6}$/.test(value.replace(/\D/g, ""));
}

/** Wraps, bottoms, and scribe stay on Browse. They do not join the missing board. */
export function isBrowseOnlyLine(item: { item_number?: string | null; description?: string | null }): boolean {
  const digits = String(item.item_number ?? "").replace(/\D/g, "");
  if (/^(10000|20000)\d+/.test(digits)) return true;
  const text = `${item.description ?? ""} ${item.item_number ?? ""}`.toLowerCase();
  return /\b(wraps?|bottoms?|scribe)\b/.test(text);
}

export function isDropshipCatalogCode(code: string | null | undefined): boolean {
  const digits = String(code ?? "").replace(/\s+/g, "");
  return /^40000\d+$/.test(digits) && digits.length >= 8;
}

export function hafeleArticle(value: string | null | undefined): string | null {
  const match = String(value ?? "").match(/\d{3}\.\d{2}\.\d{3}/);
  return match?.[0] ?? null;
}
