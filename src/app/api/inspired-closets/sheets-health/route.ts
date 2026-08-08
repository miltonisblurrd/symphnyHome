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
    const sampleTab = snapshot.tabs[0];
    return NextResponse.json({
      ...probe,
      workbook: {
        jobCount: hub.jobCount,
        attentionCount: hub.attentionItems.length,
        designerCount: hub.pulse.designerCount,
        salesThisWeek: hub.pulse.sales,
        outstanding: hub.pulse.outstandingBalances,
        avgMarginStarting: hub.pulse.avgMarginStarting,
        avgMarginCurrent: hub.pulse.avgMarginFinal,
        marginSampleStarting: hub.pulse.marginSampleStarting,
        marginSampleCurrent: hub.pulse.marginSampleCurrent,
        belowGate: hub.pulse.jobsBelowMarginGate,
        missingMargin: hub.pulse.jobsMissingMargin,
        sampleHeaders: sampleTab?.headers.slice(0, 16) ?? [],
      },
    });
  } catch {
    return NextResponse.json(probe, { status: 200 });
  }
}
