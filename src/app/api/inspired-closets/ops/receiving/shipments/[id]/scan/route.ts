import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  applyScanToInventory,
  lineStatus,
  linkItemToOs,
  loadShipmentItemRows,
  matchItem,
  notifyReceiving,
  shipmentRollup,
  type ShipmentItemRow,
} from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

async function loadItems(shipmentId: string): Promise<ShipmentItemRow[]> {
  return loadShipmentItemRows(shipmentId);
}

export async function POST(request: Request, ctx: Ctx) {
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

  const events: Array<{ item_number?: string; scanned_value?: string; qty?: number; pallet?: string }> =
    Array.isArray(body.events)
      ? (body.events as typeof events)
      : [
          {
            item_number: typeof body.item_number === "string" ? body.item_number : undefined,
            scanned_value: typeof body.scanned_value === "string" ? body.scanned_value : undefined,
            qty: typeof body.qty === "number" ? body.qty : 1,
            pallet: typeof body.pallet === "string" ? body.pallet : undefined,
          },
        ];

  const actor = await actorId();
  const supabase = getSupabaseAdmin();
  const { data: ship } = await supabase
    .from("ic_shipments")
    .select("id, notice, status, parse_quality")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ship) {
    return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
  }

  let items = await loadItems(id);
  const results: Array<{
    scanned_value: string;
    result: string;
    item: ShipmentItemRow | null;
  }> = [];

  for (const event of events) {
    const scanned = String(event.item_number || event.scanned_value || "").trim();
    const qty = Math.max(1, Math.round(Number(event.qty) || 1));
    const pallet = event.pallet || (typeof body.pallet === "string" ? body.pallet : null);
    const match = matchItem(items, scanned, pallet);
    const now = new Date().toISOString();

    await supabase.from("ic_shipment_scans").insert({
      shipment_id: id,
      item_id: match.item?.id ?? null,
      scanned_value: scanned,
      result: match.result,
      qty,
      actor_id: actor,
    });

    if (match.item && (match.result === "matched" || match.result === "pallet_mismatch")) {
      const nextReceived = Math.min(match.item.qty, match.item.received_qty + qty);
      const delta = nextReceived - match.item.received_qty;
      const status = lineStatus(nextReceived, match.item.qty, match.item.damaged_qty);
      await supabase
        .from("ic_shipment_items")
        .update({
          received_qty: nextReceived,
          status,
          updated_at: now,
        })
        .eq("id", match.item.id);
      if (delta > 0) {
        if (!match.item.part_id || !match.item.job_id) {
          const links = await linkItemToOs(match.item, { createPart: true });
          const repair: Record<string, unknown> = {};
          if (!match.item.part_id && links.part_id) {
            match.item.part_id = links.part_id;
            repair.part_id = links.part_id;
          }
          if (!match.item.job_id && links.job_id) {
            match.item.job_id = links.job_id;
            repair.job_id = links.job_id;
          }
          if (Object.keys(repair).length) {
            await supabase.from("ic_shipment_items").update(repair).eq("id", match.item.id);
          }
        }
        try {
          await applyScanToInventory({
            item: match.item,
            qty: delta,
            actorId: actor,
            notice: ship.notice,
          });
        } catch {
          // Part-linked receive is best-effort; the slip line still counts.
        }
      }
      match.item.received_qty = nextReceived;
      match.item.status = status;
      items = items.map((row) => (row.id === match.item?.id ? match.item : row));
    }

    results.push({ scanned_value: scanned, result: match.result, item: match.item });
  }

  const stats = shipmentRollup(items);
  const nextStatus =
    stats.total_qty > 0 && stats.total_received_qty >= stats.total_qty
      ? "complete"
      : stats.total_received_qty > 0
        ? "in_progress"
        : ship.status === "parsing"
          ? "ready"
          : ship.status;
  if (nextStatus !== ship.status) {
    await supabase
      .from("ic_shipments")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  const quality =
    ship.parse_quality && typeof ship.parse_quality === "object"
      ? (ship.parse_quality as Record<string, unknown>)
      : {};
  if (!stats.waiting_for_pallets && !quality.shortage_notified) {
    const shortJobs = stats.by_job.filter((job) => job.total_received_qty < job.total_qty);
    if (shortJobs.length > 0) {
      await notifyReceiving({
        title: `Shortage on ${ship.notice ?? "this truck"}`,
        message: `Most pallets are scanned and these jobs are still short: ${shortJobs
          .map((job) => `${job.job_name} ${job.total_received_qty}/${job.total_qty}`)
          .join(", ")}.`,
        severity: "warning",
      });
      await supabase
        .from("ic_shipments")
        .update({
          parse_quality: { ...quality, shortage_notified: true },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
  }

  if (nextStatus === "complete" && ship.status !== "complete") {
    const missingJobs = stats.by_job.filter((j) => j.total_received_qty < j.total_qty);
    await notifyReceiving({
      title: `Shipment ${ship.notice ?? id.slice(0, 8)} complete`,
      message:
        missingJobs.length > 0
          ? `Truck is closed. Short jobs: ${missingJobs
              .map((j) => `${j.job_name} ${j.total_received_qty}/${j.total_qty}`)
              .join(", ")}.`
          : `All ${stats.total_qty} pieces received.`,
      severity: missingJobs.length > 0 ? "warning" : "info",
    });
  } else {
    for (const job of stats.by_job) {
      if (job.total_qty > 0 && job.total_received_qty >= job.total_qty) {
        const justCompleted = results.some(
          (r) => r.item?.cust_ref === job.cust_ref && r.result === "matched",
        );
        if (justCompleted) {
          await notifyReceiving({
            title: `${job.job_name} 100% received`,
            message: `${job.cust_ref}: ${job.total_received_qty}/${job.total_qty} on ${ship.notice ?? "this truck"}.`,
          });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    results,
    last: results[results.length - 1] ?? null,
    stats,
    status: nextStatus,
  });
}
