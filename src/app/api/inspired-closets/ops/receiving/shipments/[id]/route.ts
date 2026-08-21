import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  missingReceivingTable,
  relinkShipmentItems,
  shipmentRollup,
  type ShipmentItemRow,
} from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

type Ctx = { params: Promise<{ id: string }> };

async function loadItems(shipmentId: string): Promise<ShipmentItemRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipment_items")
    .select(
      "id, shipment_id, item_number, so_number, cust_ref, job_name, project_number, description, qty, received_qty, damaged_qty, container_id, source_page, status, vendor_sku, job_id, part_id, note",
    )
    .eq("shipment_id", shipmentId)
    .order("source_page")
    .order("item_number");
  if (error) throw error;
  return (data ?? []) as ShipmentItemRow[];
}

export async function GET(_request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  const { data: ship, error } = await supabase
    .from("ic_shipments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (missingReceivingTable(error.message)) {
      return NextResponse.json(
        { ok: false, error: "Run drizzle/0013_ic_shipments.sql in Supabase first." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!ship) {
    return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
  }

  const items = await loadItems(id);
  const { data: scans } = await supabase
    .from("ic_shipment_scans")
    .select("*")
    .eq("shipment_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: claims } = await supabase
    .from("ic_shipment_claims")
    .select("*")
    .eq("shipment_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  const unknown = (scans ?? []).filter((s) => s.result === "unknown");
  return NextResponse.json({
    ok: true,
    shipment: ship,
    items,
    stats: shipmentRollup(items),
    unknown_scans: unknown,
    claims: claims ?? [],
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (body.action === "relink") {
    try {
      const result = await relinkShipmentItems(id);
      return NextResponse.json({ ok: true, relinked: result });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Relink failed." },
        { status: 400 },
      );
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.notice === "string") patch.notice = body.notice.trim() || null;
  if (typeof body.ship_date === "string") patch.ship_date = body.ship_date || null;
  if (typeof body.vendor === "string") patch.vendor = body.vendor;
  if (typeof body.status === "string") patch.status = body.status;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  void actorId();
  return NextResponse.json({ ok: true, shipment: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ic_shipments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
