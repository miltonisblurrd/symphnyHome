import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import { syncInstallersFromJobs } from "@/lib/inspired-closets-ops-installer-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  try {
    const result = await syncInstallersFromJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not sync installers." },
      { status: 500 },
    );
  }
}
