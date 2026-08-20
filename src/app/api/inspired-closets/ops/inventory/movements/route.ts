import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  applyStockMovement,
  type StockMovementInput,
} from "@/lib/inspired-closets-ops-inventory";
import type { IcStockMovementType } from "@/db/ops-schema";

export const runtime = "nodejs";

const VALID_TYPES = new Set<IcStockMovementType>([
  "receive",
  "allocate",
  "return",
  "adjust",
  "scrap",
  "sell_excess",
  "reserve",
  "unreserve",
]);

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const partId = searchParams.get("partId");
  const jobId = searchParams.get("jobId");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_stock_movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (partId) query = query.eq("part_id", partId);
  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let movements = data ?? [];
  if (jobId && movements.length > 0) {
    const partIds = [...new Set(movements.map((m) => m.part_id).filter(Boolean))];
    const { data: parts } = await supabase
      .from("ic_parts")
      .select("id, sku, name, unit_cost_cents")
      .in("id", partIds);
    const byId = new Map((parts ?? []).map((p) => [p.id, p]));
    movements = movements.map((m) => ({
      ...m,
      part: byId.get(m.part_id) ?? null,
    }));
  }

  return NextResponse.json({ ok: true, movements });
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

  const partId = typeof body.part_id === "string" ? body.part_id : null;
  const movementType = body.movement_type as IcStockMovementType;
  const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);

  if (!partId || !VALID_TYPES.has(movementType) || !Number.isFinite(qty)) {
    return NextResponse.json(
      { ok: false, error: "part_id, movement_type, and qty are required." },
      { status: 400 },
    );
  }

  const input: StockMovementInput = {
    partId,
    movementType,
    qty,
    jobId: typeof body.job_id === "string" ? body.job_id : null,
    unitCostCents: typeof body.unit_cost_cents === "number" ? body.unit_cost_cents : null,
    note: typeof body.note === "string" ? body.note : null,
    actorId: typeof body.actor_id === "string" ? body.actor_id : null,
  };

  try {
    const result = await applyStockMovement(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Stock movement failed.",
      },
      { status: 400 },
    );
  }
}
