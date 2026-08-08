import { NextResponse } from "next/server";
import { fetchOperationsSnapshot } from "@/lib/inspired-closets-google-sheets";
import { importWorkbookIntoOps } from "@/lib/inspired-closets-ops-import";
import { isDbConfigured } from "@/db/client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    const snapshot = await fetchOperationsSnapshot({ forceRefresh: true });
    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "Google Sheets is not configured." },
        { status: 503 },
      );
    }

    const result = await importWorkbookIntoOps(snapshot);
    return NextResponse.json({ ok: true, ...result, syncedAt: snapshot.syncedAt });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Workbook import failed.",
      },
      { status: 500 },
    );
  }
}
