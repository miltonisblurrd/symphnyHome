import { NextResponse } from "next/server";
import { fetchOperationsSnapshot, probeOperationsSnapshot } from "@/lib/inspired-closets-google-sheets";
import { buildWorkbookHub } from "@/lib/inspired-closets-payroll-workbook";

export const runtime = "nodejs";

export async function GET() {
  const probe = await probeOperationsSnapshot();
  if (!probe.ok) {
    return NextResponse.json(probe, { status: 503 });
  }

  try {
    const snapshot = await fetchOperationsSnapshot();
    if (!snapshot) {
      return NextResponse.json(probe, { status: 200 });
    }
    const hub = buildWorkbookHub(snapshot, "This week");
    return NextResponse.json({
      ...probe,
      workbook: {
        jobCount: hub.jobCount,
        attentionCount: hub.attentionItems.length,
        designerCount: hub.pulse.designerCount,
        salesThisWeek: hub.pulse.sales,
        outstanding: hub.pulse.outstandingBalances,
      },
    });
  } catch {
    return NextResponse.json(probe, { status: 200 });
  }
}
