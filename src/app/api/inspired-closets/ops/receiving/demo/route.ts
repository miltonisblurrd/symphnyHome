import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { importParts } from "@/lib/inspired-closets-ops-inventory";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  DEMO_NOTICE,
  DEMO_SHIP_DATE,
  DEMO_SLIP_ITEMS,
  DEMO_VENDOR,
  demoPartsFromSlip,
} from "@/lib/inspired-closets-ops-receiving-demo";
import {
  linkItemToOs,
  missingReceivingTable,
} from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

function toIsoDate(value: string): string {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return value;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const actor = (await cookies()).get(IC_STAFF_ID_COOKIE)?.value ?? null;
  const supabase = getSupabaseAdmin();

  try {
    const parts = await importParts(demoPartsFromSlip(), actor);

    const { data: existing, error: existingError } = await supabase
      .from("ic_shipments")
      .select("id, notice, status")
      .eq("notice", DEMO_NOTICE)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError && missingReceivingTable(existingError.message)) {
      return NextResponse.json(
        { ok: false, error: "Run drizzle/0013_ic_shipments.sql in Supabase first." },
        { status: 400 },
      );
    }
    if (existingError) throw existingError;

    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        reused: true,
        shipment: existing,
        parts,
        scan_url: `/inspired-closets/ops/inventory/receiving/${existing.id}/scan`,
        slip_url: "/inspired-closets/ops/inventory/receiving/demo-slip",
      });
    }

    const { data: ship, error } = await supabase
      .from("ic_shipments")
      .insert({
        notice: DEMO_NOTICE,
        ship_date: toIsoDate(DEMO_SHIP_DATE),
        vendor: DEMO_VENDOR,
        status: "ready",
        source_filename: "demo-slip.html",
        total_pages: 1,
        parse_quality: { total_items: DEMO_SLIP_ITEMS.length, source: "demo" },
        created_by: actor,
      })
      .select("id, notice, status")
      .single();
    if (error) {
      if (missingReceivingTable(error.message)) {
        return NextResponse.json(
          { ok: false, error: "Run drizzle/0013_ic_shipments.sql in Supabase first." },
          { status: 400 },
        );
      }
      throw error;
    }

    const rows = [];
    for (const item of DEMO_SLIP_ITEMS) {
      const links = await linkItemToOs(item);
      rows.push({
        shipment_id: ship.id,
        item_number: item.item_number,
        so_number: item.so_number,
        cust_ref: item.cust_ref,
        job_name: item.job_name,
        project_number: item.project_number,
        description: item.description,
        qty: item.qty,
        received_qty: 0,
        damaged_qty: 0,
        container_id: item.container_id,
        source_page: item.source_page,
        status: "expected",
        job_id: links.job_id,
        part_id: links.part_id,
      });
    }
    const { error: itemError } = await supabase.from("ic_shipment_items").insert(rows);
    if (itemError) throw itemError;

    return NextResponse.json({
      ok: true,
      reused: false,
      shipment: ship,
      imported: rows.length,
      parts,
      scan_url: `/inspired-closets/ops/inventory/receiving/${ship.id}/scan`,
      slip_url: "/inspired-closets/ops/inventory/receiving/demo-slip",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load demo truck." },
      { status: 400 },
    );
  }
}
