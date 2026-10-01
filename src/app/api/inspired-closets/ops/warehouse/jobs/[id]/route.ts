import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE, IC_STAFF_ROLE_COOKIE } from "@/lib/inspired-closets-ops-field";
import { isInventoryRole } from "@/lib/inspired-closets-ops-roles";
import { isGatherStatus } from "@/lib/inspired-closets-ops-warehouse";
import {
  loadWarehouseKit,
  markKitHold,
  markKitLine,
  markKitReady,
  savePileSpot,
} from "@/lib/inspired-closets-ops-warehouse-data";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function actor(): Promise<{ staffId: string } | NextResponse> {
  const jar = await cookies();
  const role = jar.get(IC_STAFF_ROLE_COOKIE)?.value ?? null;
  if (isInventoryRole(role)) {
    return NextResponse.json(
      { ok: false, error: "Your login is limited to Inventory and Receiving." },
      { status: 403 },
    );
  }
  const staffId = jar.get(IC_STAFF_ID_COOKIE)?.value ?? "";
  if (!staffId) {
    return NextResponse.json({ ok: false, error: "Sign in to use the warehouse." }, { status: 401 });
  }
  return { staffId };
}

function jsonResult(result: { ok: true; job: unknown } | { ok: false; status: number; error: string; hint?: string }) {
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, hint: result.hint },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}

export async function GET(_request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await actor();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  return jsonResult(await loadWarehouseKit(id));
}

export async function PATCH(request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await actor();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (action === "mark") {
    const lineId = typeof body.line_id === "string" ? body.line_id : "";
    const gatherStatus = typeof body.gather_status === "string" ? body.gather_status : "";
    if (!lineId || !isGatherStatus(gatherStatus)) {
      return NextResponse.json({ ok: false, error: "line_id and gather_status are required." }, { status: 400 });
    }
    const problemNote =
      typeof body.problem_note === "string" && body.problem_note.trim() ? body.problem_note.trim() : null;
    return jsonResult(
      await markKitLine({
        jobId: id,
        lineId,
        gatherStatus,
        problemNote,
        actorId: auth.staffId,
      }),
    );
  }

  if (action === "spot") {
    const pileLocation =
      typeof body.pile_location === "string" && body.pile_location.trim() ? body.pile_location.trim() : null;
    return jsonResult(await savePileSpot({ jobId: id, pileLocation }));
  }

  if (action === "ready") {
    return jsonResult(await markKitReady({ jobId: id, actorId: auth.staffId }));
  }

  if (action === "hold") {
    return jsonResult(await markKitHold(id));
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
