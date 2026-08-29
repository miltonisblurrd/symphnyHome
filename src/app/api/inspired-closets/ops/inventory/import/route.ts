import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import { parseCountSheetText, parseXlsxBuffer } from "@/lib/inspired-closets-ops-count-sheet";
import {
  IMPORT_TEMPLATE_CSV,
  importParts,
  type ImportPartRow,
} from "@/lib/inspired-closets-ops-inventory";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

function asActorId(value: string | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

async function rowsFromRequest(request: Request): Promise<ImportPartRow[]> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const name = file.name.toLowerCase();
      const buf = Buffer.from(await file.arrayBuffer());
      if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) {
        return parseXlsxBuffer(buf);
      }
      return parseCountSheetText(buf.toString("utf8"));
    }
    const csv = form.get("csv");
    if (typeof csv === "string" && csv.trim()) return parseCountSheetText(csv);
  }

  if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    return parseCountSheetText(await request.text());
  }

  const body = (await request.json()) as { csv?: string; rows?: ImportPartRow[] };
  if (typeof body.csv === "string") return parseCountSheetText(body.csv);
  if (Array.isArray(body.rows)) return body.rows;
  return [];
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
  const actorId = asActorId(cookieStore.get(IC_STAFF_ID_COOKIE)?.value);

  let rows: ImportPartRow[] = [];
  try {
    rows = await rowsFromRequest(request);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not read that sheet.",
      },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No rows found. Paste the Warehouse count tab, or upload the .xlsx / .csv file.",
      },
      { status: 400 },
    );
  }

  const result = await importParts(rows, actorId);
  if (result.created + result.updated === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          result.errors[0] ??
          "Nothing imported. Need a header row with name (item_number and color optional).",
        ...result,
        total: rows.length,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, ...result, total: rows.length });
}
