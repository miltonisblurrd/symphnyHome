import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import {
  parseLeadSheetText,
  parseLeadXlsxBuffer,
  type ImportedLeadRow,
} from "@/lib/inspired-closets-ops-lead-import";
import { saveImportedLeadRows } from "@/lib/inspired-closets-ops-lead-save";
import { IC_STAFF_ID_COOKIE, IC_STAFF_NAME_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

const MAX_ROWS = 500;

async function rowsFromRequest(request: Request): Promise<ImportedLeadRow[]> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const name = file.name.toLowerCase();
      const buf = Buffer.from(await file.arrayBuffer());
      if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
        return parseLeadXlsxBuffer(buf);
      }
      if (name.endsWith(".xls")) {
        throw new Error("Save the Community export as .xlsx or .csv, then upload that.");
      }
      return parseLeadSheetText(buf.toString("utf8"));
    }
  }
  if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    return parseLeadSheetText(await request.text());
  }
  throw new Error("Upload a Community CSV or Excel file.");
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let rows: ImportedLeadRow[] = [];
  try {
    rows = await rowsFromRequest(request);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not read that file." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No lead rows found in that file." },
      { status: 400 },
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `That file has ${rows.length} rows. Import ${MAX_ROWS} or fewer at a time.` },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const actorId = cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null;
  const actorName = cookieStore.get(IC_STAFF_NAME_COOKIE)?.value ?? null;
  const { created, skipped, errors, updated } = await saveImportedLeadRows({
    rows,
    actorId,
    actorName,
  });

  if (created === 0 && (updated ?? 0) === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          errors[0] ??
          (skipped
            ? `Nothing new — ${skipped} already in the OS.`
            : "Nothing imported from that file."),
        created,
        skipped,
        updated: updated ?? 0,
        errors: errors.slice(0, 8),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    created,
    updated: updated ?? 0,
    skipped,
    errors: errors.slice(0, 8),
  });
}
