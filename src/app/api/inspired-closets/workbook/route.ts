import { NextResponse } from "next/server";
import type { GavinPeriod } from "@/data/inspired-closets-gavin-demo";
import { gavinDemoMeta } from "@/data/inspired-closets-gavin-demo";
import { fetchOperationsSnapshot } from "@/lib/inspired-closets-google-sheets";
import { buildWorkbookHub } from "@/lib/inspired-closets-payroll-workbook";

export const runtime = "nodejs";

function isPeriod(value: string | null): value is GavinPeriod {
  return Boolean(value && (gavinDemoMeta.periodOptions as readonly string[]).includes(value));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const period: GavinPeriod = isPeriod(periodParam) ? periodParam : "This week";

  try {
    const snapshot = await fetchOperationsSnapshot();
    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "Google Sheets is not configured." },
        { status: 503 },
      );
    }

    const hub = buildWorkbookHub(snapshot, period);
    return NextResponse.json({ ok: true, hub });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Workbook sync failed.",
      },
      { status: 503 },
    );
  }
}
