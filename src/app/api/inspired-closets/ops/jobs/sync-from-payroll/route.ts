import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import { syncJobsFromPayroll } from "@/lib/inspired-closets-ops-jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  try {
    const result = await syncJobsFromPayroll();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Jobs sync failed.",
      },
      { status: 500 },
    );
  }
}
