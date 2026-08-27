import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  PALLET_MISSING_THRESHOLD,
  SHIPMENT_ITEM_SELECT,
  SHIPMENT_ITEM_SELECT_LEGACY,
  missingNeedsCreditColumn,
  missingReceivingTable,
  shipmentRollup,
  type ShipmentItemRow,
} from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const shipmentId = new URL(request.url).searchParams.get("shipmentId");
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("ic_shipment_items")
    .select(SHIPMENT_ITEM_SELECT)
    .in("status", ["expected", "missing"])
    .order("cust_ref");

  if (shipmentId) query = query.eq("shipment_id", shipmentId);

  let { data, error } = await query.limit(2000);
  if (error && missingNeedsCreditColumn(error.message)) {
    let retry = supabase
      .from("ic_shipment_items")
      .select(SHIPMENT_ITEM_SELECT_LEGACY)
      .in("status", ["expected", "missing"])
      .order("cust_ref");
    if (shipmentId) retry = retry.eq("shipment_id", shipmentId);
    const second = await retry.limit(2000);
    data = (second.data ?? []).map((row) => ({ ...row, needs_credit: false }));
    error = second.error;
  }
  if (error) {
    if (missingReceivingTable(error.message)) {
      return NextResponse.json({ ok: true, items: [], shipments: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const items = (data ?? []) as ShipmentItemRow[];
  const shipIds = [...new Set(items.map((i) => i.shipment_id))];
  const { data: ships } = shipIds.length
    ? await supabase
        .from("ic_shipments")
        .select("id, notice, ship_date, vendor, status")
        .in("id", shipIds)
        .is("deleted_at", null)
    : { data: [] };
  const shipById = new Map((ships ?? []).map((s) => [s.id, s]));
  type ShipRow = NonNullable<typeof ships>[number];

  if (shipmentId) {
    const { data: all } = await supabase
      .from("ic_shipment_items")
      .select(SHIPMENT_ITEM_SELECT)
      .eq("shipment_id", shipmentId);
    const stats = shipmentRollup((all ?? []) as ShipmentItemRow[]);
    return NextResponse.json({
      ok: true,
      items: stats.waiting_for_pallets ? [] : items.filter((i) => i.received_qty < i.qty),
      waiting_for_pallets: stats.waiting_for_pallets,
      pallets_scanned: stats.pallets_scanned,
      pallets_total: stats.pallets_total,
      threshold_pct: PALLET_MISSING_THRESHOLD,
    });
  }

  const byShip: Record<string, { shipment: ShipRow; items: ShipmentItemRow[] }> = {};
  for (const item of items) {
    if (item.received_qty >= item.qty && item.status !== "missing") continue;
    const ship = shipById.get(item.shipment_id);
    if (!ship) continue;
    if (!byShip[item.shipment_id]) byShip[item.shipment_id] = { shipment: ship, items: [] };
    byShip[item.shipment_id].items.push(item);
  }

  return NextResponse.json({
    ok: true,
    shipments: Object.values(byShip),
  });
}
