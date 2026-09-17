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
