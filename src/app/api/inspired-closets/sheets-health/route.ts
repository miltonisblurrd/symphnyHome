import { NextResponse } from "next/server";
import { probeOperationsSnapshot } from "@/lib/inspired-closets-google-sheets";

export const runtime = "nodejs";

export async function GET() {
  const probe = await probeOperationsSnapshot();
  return NextResponse.json(probe, { status: probe.ok ? 200 : 503 });
}
