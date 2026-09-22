import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { missingReceivingTable } from "@/lib/inspired-closets-ops-receiving";
import { codesMatch } from "@/lib/inspired-closets-ops-scan-codes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const code = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (code.length < 4) {
    return NextResponse.json({ ok: true, hits: [] });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipment_items")
    .select(
      "id, shipment_id, item_number, vendor_sku, container_id, job_name, cust_ref, so_number, description, qty, received_qty, job_id",
    )
    .order("created_at", { ascending: false })
    .limit(4000);
  if (error) {
    if (missingReceivingTable(error.message)) return NextResponse.json({ ok: true, hits: [] });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const matched = (data ?? []).filter((row) =>
    [row.item_number, row.vendor_sku, row.container_id].some((value) => codesMatch(code, value as string | null)),
  );
  const shipIds = [...new Set(matched.map((row) => String(row.shipment_id)))];
  const { data: ships } = shipIds.length
    ? await supabase
        .from("ic_shipments")
        .select("id, notice, ship_date, vendor")
        .in("id", shipIds)
        .is("deleted_at", null)
    : { data: [] };
  const shipById = new Map((ships ?? []).map((ship) => [String(ship.id), ship]));
  return NextResponse.json({
    ok: true,
    hits: matched.slice(0, 40).map((row) => ({
      ...row,
      shipment: shipById.get(String(row.shipment_id)) ?? null,
    })),
  });
}
