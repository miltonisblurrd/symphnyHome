import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { PART_CATEGORIES } from "@/lib/inspired-closets-ops-inventory";

export const runtime = "nodejs";

const EDITABLE = new Set([
  "sku",
  "name",
  "size",
  "category",
  "location",
  "barcode",
  "unit_cost_cents",
  "reorder_point",
  "is_excess",
  "vendor",
  "notes",
  "active",
]);

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const filter = searchParams.get("filter"); // low | excess | all
  const category = searchParams.get("category");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_parts")
    .select("*")
    .is("deleted_at", null)
    .order("name")
    .limit(2000);

  if (category) query = query.eq("category", category);
  if (filter === "excess") query = query.eq("is_excess", true);
  if (filter === "active") query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let parts = data ?? [];
  if (q) {
    parts = parts.filter((part) => {
      const hay = `${part.sku} ${part.name} ${part.size ?? ""} ${part.location ?? ""} ${part.barcode ?? ""} ${part.vendor ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (filter === "low") {
    parts = parts.filter((part) => part.qty_on_hand <= part.reorder_point);
  }

  const lowStock = parts.filter((part) => part.qty_on_hand <= part.reorder_point).length;
  const excess = (data ?? []).filter((part) => part.is_excess).length;
  const valueCents = parts.reduce(
    (sum, part) => sum + part.qty_on_hand * part.unit_cost_cents,
    0,
  );

  return NextResponse.json({
    ok: true,
    categories: PART_CATEGORIES,
    parts,
    summary: {
      totalParts: parts.length,
      lowStock,
      excess,
      valueCents,
    },
  });
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

  const sku = typeof body.sku === "string" ? body.sku.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!sku || !name) {
    return NextResponse.json({ ok: false, error: "sku and name are required." }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    sku,
    name,
    size: typeof body.size === "string" ? body.size.trim() || null : null,
    category: typeof body.category === "string" ? body.category : "hardware",
    location: typeof body.location === "string" ? body.location.trim() || null : null,
    barcode: typeof body.barcode === "string" ? body.barcode.trim() || null : null,
    unit_cost_cents: typeof body.unit_cost_cents === "number" ? body.unit_cost_cents : 0,
    qty_on_hand: typeof body.qty_on_hand === "number" ? Math.max(0, body.qty_on_hand) : 0,
    reorder_point: typeof body.reorder_point === "number" ? body.reorder_point : 0,
    is_excess: Boolean(body.is_excess),
    vendor: typeof body.vendor === "string" ? body.vendor.trim() || null : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  const actorId = typeof body.actor_id === "string" ? body.actor_id : null;
  if (actorId) {
    insert.created_by = actorId;
    insert.updated_by = actorId;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("ic_parts").insert(insert).select("*").single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // If starting with on-hand qty, write an opening receive movement.
  if ((insert.qty_on_hand as number) > 0) {
    await supabase.from("ic_stock_movements").insert({
      part_id: data.id,
      movement_type: "receive",
      qty: insert.qty_on_hand,
      unit_cost_cents: insert.unit_cost_cents,
      note: "Opening balance",
      created_by: actorId,
    });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "part",
    entity_id: data.id,
    action: "created",
    actor_id: actorId,
    actor_label: actorId ? null : "ops-app",
    changes: { sku, name },
  });

  return NextResponse.json({ ok: true, part: data });
}

export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: findError } = await supabase
    .from("ic_parts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ ok: false, error: "Part not found." }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE.has(key)) continue;
    const next = key === "sku" && typeof value === "string" ? value.trim().toUpperCase() : value;
    if (current[key] === next) continue;
    update[key] = next;
    changes[key] = { from: current[key], to: next };
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, part: current, unchanged: true });
  }

  const actorId = typeof body.actor_id === "string" ? body.actor_id : null;
  update.updated_at = new Date().toISOString();
  if (actorId) update.updated_by = actorId;

  const { data: updated, error: updateError } = await supabase
    .from("ic_parts")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "part",
    entity_id: id,
    action: "updated",
    actor_id: actorId,
    actor_label: actorId ? null : "ops-app",
    changes,
  });

  return NextResponse.json({ ok: true, part: updated });
}
