import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncLiveSnapshot } from "@/lib/meta-ads/meta/store";

export const runtime = "nodejs";
export const maxDuration = 120;

function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function runSync() {
  const snapshot = await syncLiveSnapshot();
  const spend = snapshot.campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const leads = snapshot.campaigns.reduce((sum, campaign) => sum + campaign.leads, 0);
  return NextResponse.json({
    ok: true,
    syncedAt: snapshot.syncedAt,
    company: snapshot.company,
    campaigns: snapshot.campaigns.length,
    ads: snapshot.ads.length,
    currentSpend: Math.round(spend * 100) / 100,
    currentLeads: leads,
  });
}

/** A scheduler can call this once an hour. The ads page also refreshes itself when the saved snapshot is older than an hour. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    return await runSync();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error("Meta ads cron failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
