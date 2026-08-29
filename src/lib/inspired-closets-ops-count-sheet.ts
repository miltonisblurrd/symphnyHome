/**
 * Parse warehouse count sheets: Excel paste (tabs), CSV, or .xlsx upload.
 */
import { inflateRawSync } from "node:zlib";
import type { ImportPartRow } from "@/lib/inspired-closets-ops-inventory";

export function dollarsToCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 1000 ? Math.round(value) : Math.round(value * 100);
  }
  if (typeof value === "string") {
    const n = Number(value.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }
  return 0;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter !== ",") {
    return line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim());
  }
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  if (tabs >= 2 && tabs >= commas) return "\t";
  if (semis > commas && semis >= 2) return ";";
  return ",";
}

function headerIndex(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((name, i) => {
    const key = name
      .trim()
      .toLowerCase()
      .replace(/#/g, " number")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    if (key) map[key] = i;
  });
  return map;
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.map((c) => c.trim().toLowerCase()).join(" ");
  const hasName = joined.includes("name");
  const hasKey =
    joined.includes("item") ||
    joined.includes("sku") ||
    joined.includes("qty") ||
    joined.includes("color") ||
    joined.includes("size");
  return hasName && hasKey;
}

function rowFromCells(idx: Record<string, number>, cells: string[]): ImportPartRow {
  const get = (...names: string[]) => {
    for (const name of names) {
      const i = idx[name];
      if (i != null && cells[i] != null && String(cells[i]).trim()) {
        return String(cells[i]).trim();
      }
    }
    return "";
  };
  const itemNumber = get("item_number", "item", "item_no", "itemno");
  return {
    sku: undefined,
    name: get("name"),
    color: get("color", "finish") || null,
    size: get("size") || null,
    category: get("category") || "hardware",
    location: get("location", "bin") || null,
    qty: Number(get("qty", "qty_on_hand", "count") || 0) || 0,
    unit_cost_cents: dollarsToCents(get("unit_cost", "unit_cost_cents", "cost") || "0"),
    reorder_point: Number(get("reorder_point", "reorder") || 0) || 0,
    vendor: get("vendor") || null,
    barcode: itemNumber || null,
    item_number: itemNumber || null,
    notes: get("notes") || null,
  };
}

function parseHtmlTable(text: string): string[][] | null {
  if (!/<table/i.test(text)) return null;
  const rows: string[][] = [];
  const trs = text.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trs) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      (m[1] ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim(),
    );
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows.length ? rows : null;
}

export function parseCountSheetText(text: string): ImportPartRow[] {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];

  const htmlRows = parseHtmlTable(cleaned);
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  const grid: string[][] = htmlRows ?? [];
  if (!htmlRows) {
    const headerLine =
      lines.find(
        (line) =>
          /name/i.test(line) &&
          (/,|\t|;/.test(line) || /item|sku|qty|color/i.test(line)),
      ) ??
      lines[0] ??
      "";
    const delimiter = detectDelimiter(headerLine);
    for (const line of lines) {
      grid.push(splitDelimitedLine(line, delimiter));
    }
  }

  const headerAt = grid.findIndex(looksLikeHeader);
  if (headerAt < 0) {
    throw new Error(
      "Need a header row with name (and optional item_number, color, size, qty). Upload the warehouse count CSV or Excel.",
    );
  }
  const idx = headerIndex(grid[headerAt] ?? []);
  const rows: ImportPartRow[] = [];
  for (const cells of grid.slice(headerAt + 1)) {
    const row = rowFromCells(idx, cells);
    if (!row.name) continue;
    rows.push(row);
  }
  return rows;
}

function findZipEocd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/** Central directory sizes are reliable; Community xlsx local headers often have ZIP flag 0x8 (sizes live after the file). */
function unzipXml(buf: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const eocd = findZipEocd(buf);
  if (eocd >= 0) {
    const entries = buf.readUInt16LE(eocd + 10);
    let i = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < entries && i + 46 <= buf.length; n += 1) {
      if (buf.readUInt32LE(i) !== 0x02014b50) break;
      const method = buf.readUInt16LE(i + 10);
      const compSize = buf.readUInt32LE(i + 20);
      const nameLen = buf.readUInt16LE(i + 28);
      const extraLen = buf.readUInt16LE(i + 30);
      const commentLen = buf.readUInt16LE(i + 32);
      const localOff = buf.readUInt32LE(i + 42);
      const name = buf
        .subarray(i + 46, i + 46 + nameLen)
        .toString("utf8")
        .replace(/^\//, "");
      if (localOff + 30 <= buf.length) {
        const locNameLen = buf.readUInt16LE(localOff + 26);
        const locExtraLen = buf.readUInt16LE(localOff + 28);
        const dataStart = localOff + 30 + locNameLen + locExtraLen;
        const data = buf.subarray(dataStart, dataStart + compSize);
        const content = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
        if (content) files.set(name, content.toString("utf8"));
      }
      i += 46 + nameLen + extraLen + commentLen;
    }
    if (files.size) return files;
  }

  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = buf.readUInt32LE(i);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8").replace(/^\//, "");
    const dataStart = i + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    const content = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
    if (!content) {
      throw new Error("Could not read this Excel file. Save it as CSV and upload that.");
    }
    files.set(name, content.toString("utf8"));
    i = dataStart + compSize;
  }
  return files;
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1] ?? "";
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const blocks = xml.match(/<si\b[\s\S]*?<\/si>/g) ?? [];
  for (const block of blocks) {
    const texts = [...block.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) =>
      decodeXml(m[1] ?? ""),
    );
    out.push(texts.join(""));
  }
  return out;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function colIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] ?? "A").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetToGrid(xml: string, shared: string[]): string[][] {
  const grid: string[][] = [];
  const rows = xml.match(/<row\b[\s\S]*?<\/row>/g) ?? [];
  for (const rowXml of rows) {
    const rAttr = attr(rowXml.slice(0, 80), "r");
    const rowNum = Number(rAttr) || grid.length + 1;
    const cells: string[] = [];
    const cellTags = [...rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)];
    for (const match of cellTags) {
      const attrs = match[1] || match[3] || "";
      const inner = match[2] ?? "";
      const ref = attr(`c ${attrs}`, "r");
      const type = attr(`c ${attrs}`, "t");
      let value = "";
      if (type === "inlineStr") {
        const t = inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
        value = decodeXml(t?.[1] ?? "");
      } else if (type === "s") {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        value = shared[Number(v?.[1] ?? 0)] ?? "";
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        value = decodeXml(v?.[1] ?? "");
      }
      const col = colIndex(ref || "A");
      cells[col] = value;
    }
    const dense: string[] = [];
    for (let i = 0; i < cells.length; i += 1) dense.push(cells[i] ?? "");
    grid[rowNum - 1] = dense;
  }
  return grid.filter((row) => row && row.some((c) => String(c ?? "").trim()));
}

function gridToRows(grid: string[][]): ImportPartRow[] {
  const headerAt = grid.findIndex(looksLikeHeader);
  if (headerAt < 0) return [];
  const idx = headerIndex((grid[headerAt] ?? []).map((c) => String(c ?? "")));
  const rows: ImportPartRow[] = [];
  for (const cells of grid.slice(headerAt + 1)) {
    const row = rowFromCells(
      idx,
      (cells ?? []).map((c) => String(c ?? "")),
    );
    if (!row.name) continue;
    rows.push(row);
  }
  return rows;
}

export type XlsxSheetGrid = { name: string; grid: string[][] };

export function parseXlsxToSheets(buf: Buffer): XlsxSheetGrid[] {
  const files = unzipXml(buf);
  const workbook = files.get("xl/workbook.xml");
  if (!workbook) throw new Error("Not a valid Excel workbook.");
  const relsXml = files.get("xl/_rels/workbook.xml.rels") ?? "";
  const rels = new Map<string, string>();
  for (const tag of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attr(tag, "Id");
    let target = attr(tag, "Target").replace(/^\//, "");
    if (target && !target.startsWith("xl/")) target = `xl/${target.replace(/^\.\//, "")}`;
    if (id) rels.set(id, target);
  }
  const sheets: { name: string; path: string }[] = [];
  for (const tag of workbook.match(/<sheet\b[^>]*>/g) ?? []) {
    const name = attr(tag, "name");
    const rid = attr(tag, "r:id") || attr(tag, "id");
    const path = rels.get(rid);
    if (name && path) sheets.push({ name, path });
  }
  const shared = parseSharedStrings(files.get("xl/sharedStrings.xml") ?? "");
  const out: XlsxSheetGrid[] = [];
  for (const sheet of sheets) {
    const xml = files.get(sheet.path);
    if (!xml) continue;
    out.push({ name: sheet.name, grid: sheetToGrid(xml, shared) });
  }
  if (!out.length) throw new Error("Not a valid Excel workbook.");
  return out;
}

export function parseXlsxBuffer(buf: Buffer): ImportPartRow[] {
  const sheets = parseXlsxToSheets(buf);
  const preferred = sheets.find((s) => /warehouse count|inventory|count/i.test(s.name));
  const order = preferred
    ? [preferred, ...sheets.filter((s) => s.name !== preferred.name)]
    : sheets;
  for (const sheet of order) {
    const rows = gridToRows(sheet.grid);
    if (rows.length) return rows;
  }
  throw new Error(
    "No parts found in that Excel file. Use a header row with name, and optional item_number, color, size, qty.",
  );
}
