import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import {
  listPendingMergeCandidates,
  resolveMergeCandidate,
} from "@/lib/inspired-closets-ops-clients";
import { IC_STAFF_ID_COOKIE, IC_STAFF_NAME_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

async function actor(): Promise<{ id: string | null; name: string | null }> {
  const cookieStore = await cookies();
  return {
    id: cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null,
    name: cookieStore.get(IC_STAFF_NAME_COOKIE)?.value ?? null,
  };
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  try {
    const candidates = await listPendingMergeCandidates();
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load merge reviews." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const candidateId = typeof body.candidate_id === "string" ? body.candidate_id : null;
  const action = body.action === "merge" || body.action === "keep_separate" ? body.action : null;
  const intoClientId = typeof body.into_client_id === "string" ? body.into_client_id : null;

  if (!candidateId || !action) {
    return NextResponse.json(
      { ok: false, error: "candidate_id and action (merge | keep_separate) are required." },
      { status: 400 },
    );
  }

  if (action === "merge" && !intoClientId) {
    return NextResponse.json(
      { ok: false, error: "into_client_id is required when merging." },
      { status: 400 },
    );
  }

  const who = await actor();

  try {
    const result = await resolveMergeCandidate({
      candidateId,
      action,
      intoClientId,
      actorId: who.id,
      actorLabel: who.name,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve merge.";
    const status = /not found|already resolved|required/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
