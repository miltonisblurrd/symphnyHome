import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";

export const runtime = "nodejs";

/** Gavin / Frank money-leak attention for Inventory desk. */
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekIso = weekAgo.toISOString();

  const [partsResult, jobsResult, movesResult] = await Promise.all([
    supabase
      .from("ic_parts")
      .select(
        "id, sku, name, qty_on_hand, qty_reserved, reorder_point, unit_cost_cents, is_excess",
      )
      .is("deleted_at", null)
      .eq("active", true)
      .limit(3000),
    supabase
      .from("ic_jobs")
      .select("id, stage, install_date, client_id, contract_cents")
      .is("deleted_at", null)
      .in("stage", ["install_scheduled", "install_in_progress", "install_complete"])
      .limit(500),
    supabase
      .from("ic_stock_movements")
      .select("id, part_id, job_id, movement_type, qty, unit_cost_cents, created_at")
      .gte("created_at", weekIso)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  if (partsResult.error) {
    return NextResponse.json({ ok: false, error: partsResult.error.message }, { status: 500 });
  }

  const parts = partsResult.data ?? [];
  const lowStock = parts
    .filter((p) => p.qty_on_hand <= p.reorder_point)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      qty_on_hand: p.qty_on_hand,
      reorder_point: p.reorder_point,
      value_cents: p.qty_on_hand * p.unit_cost_cents,
    }))
    .sort((a, b) => a.qty_on_hand - b.qty_on_hand)
    .slice(0, 25);

  const excessParts = parts.filter((p) => p.is_excess);
  const excessValueCents = excessParts.reduce(
    (sum, p) => sum + p.qty_on_hand * p.unit_cost_cents,
    0,
  );

  const clientIds = [
    ...new Set((jobsResult.data ?? []).map((j) => j.client_id).filter(Boolean)),
  ] as string[];
  const { data: clients } = clientIds.length
    ? await supabase.from("ic_clients").select("id, name").in("id", clientIds)
    : { data: [] };
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const materialByJob = new Map<string, number>();
  const { data: allAlloc } = await supabase
    .from("ic_stock_movements")
    .select("job_id, movement_type, qty, unit_cost_cents")
    .not("job_id", "is", null)
    .in("movement_type", ["allocate", "return"])
    .limit(8000);
  for (const m of allAlloc ?? []) {
    if (!m.job_id) continue;
    const unit = m.unit_cost_cents ?? 0;
    const qty = Math.abs(m.qty ?? 0);
    const delta = m.movement_type === "allocate" ? qty * unit : -(qty * unit);
    materialByJob.set(m.job_id, (materialByJob.get(m.job_id) ?? 0) + delta);
  }

  const missingMaterials = (jobsResult.data ?? [])
    .filter((j) => (materialByJob.get(j.id) ?? 0) <= 0)
    .map((j) => ({
      id: j.id,
      stage: j.stage,
      install_date: j.install_date,
      contract_cents: j.contract_cents,
      client_name: j.client_id ? clientName.get(j.client_id) ?? "Client" : "Client",
    }))
    .slice(0, 30);

  // Receives this week with no allocate on that part afterward.
  const recentReceives = (movesResult.data ?? []).filter((m) => m.movement_type === "receive");
  const unallocatedReceives: Array<{
    part_id: string;
    sku: string;
    name: string;
    qty: number;
    created_at: string;
  }> = [];
  for (const recv of recentReceives) {
    const laterAllocate = (movesResult.data ?? []).some(
      (m) =>
        m.part_id === recv.part_id &&
        m.movement_type === "allocate" &&
        m.created_at >= recv.created_at,
    );
    if (laterAllocate) continue;
    const part = parts.find((p) => p.id === recv.part_id);
    if (!part) continue;
    unallocatedReceives.push({
      part_id: part.id,
      sku: part.sku,
      name: part.name,
      qty: recv.qty,
      created_at: recv.created_at,
    });
    if (unallocatedReceives.length >= 20) break;
  }

  const inThreeDays = new Date();
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  const todayIso = new Date().toISOString().slice(0, 10);
  const soonIso = inThreeDays.toISOString().slice(0, 10);
  const soonJobs = (jobsResult.data ?? []).filter(
    (j) => j.install_date && j.install_date >= todayIso && j.install_date <= soonIso,
  );
  let unstagedInstalls: Array<{
    id: string;
    client_name: string;
    install_date: string | null;
    unstaged: number;
  }> = [];
  if (soonJobs.length > 0) {
    const { data: matLines, error: matError } = await supabase
      .from("ic_job_materials")
      .select("job_id, status")
      .in(
        "job_id",
        soonJobs.map((j) => j.id),
      );
    if (!matError) {
      const unstagedByJob = new Map<string, number>();
      for (const line of matLines ?? []) {
        if (line.status === "reserved") {
          unstagedByJob.set(line.job_id, (unstagedByJob.get(line.job_id) ?? 0) + 1);
        }
      }
      unstagedInstalls = soonJobs
        .map((j) => ({
          id: j.id,
          client_name: j.client_id ? clientName.get(j.client_id) ?? "Client" : "Client",
          install_date: j.install_date,
          unstaged: unstagedByJob.get(j.id) ?? 0,
        }))
        .filter((j) => j.unstaged > 0)
        .slice(0, 20);
    }
  }

  return NextResponse.json({
    ok: true,
    attention: {
      lowStock,
      excessCount: excessParts.length,
      excessValueCents,
      unallocatedReceives,
      missingMaterials,
      unstagedInstalls,
    },
  });
}
