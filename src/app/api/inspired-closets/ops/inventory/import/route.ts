import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import {
  IMPORT_TEMPLATE_CSV,
  importParts,
  type ImportPartRow,
} from "@/lib/inspired-closets-ops-inventory";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

function dollarsToCents(value: unknown): number {
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

function parseCsv(text: string): ImportPartRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const rows: ImportPartRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? (cols[i] ?? "").trim() : "";
    };
    rows.push({
      sku: get("sku"),
      name: get("name"),
      size: get("size") || null,
      category: get("category") || "hardware",
      location: get("location") || get("bin") || null,
      qty: Number(get("qty") || get("qty_on_hand") || 0) || 0,
      unit_cost_cents: dollarsToCents(get("unit_cost") || get("unit_cost_cents") || "0"),
      reorder_point: Number(get("reorder_point") || get("reorder") || 0) || 0,
      vendor: get("vendor") || null,
      barcode: get("barcode") || null,
      notes: get("notes") || null,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
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
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export async function GET() {
  return new NextResponse(IMPORT_TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inspired-closets-inventory-count.csv"',
    },
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const actorId = cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null;

  const contentType = request.headers.get("content-type") ?? "";
  let rows: ImportPartRow[] = [];

  try {
    if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
      rows = parseCsv(await request.text());
    } else {
      const body = (await request.json()) as { csv?: string; rows?: ImportPartRow[] };
      if (typeof body.csv === "string") rows = parseCsv(body.csv);
      else if (Array.isArray(body.rows)) rows = body.rows;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read import payload." }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No rows. Use the count-sheet template (sku, name, size, qty…)." },
      { status: 400 },
    );
  }

  const result = await importParts(rows, actorId);
  return NextResponse.json({ ok: true, ...result, total: rows.length });
}
