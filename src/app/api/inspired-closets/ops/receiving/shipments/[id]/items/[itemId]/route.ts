import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { applyStockMovement } from "@/lib/inspired-closets-ops-inventory";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import { lineStatus, notifyReceiving } from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id, itemId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: item, error: findError } = await supabase
    .from("ic_shipment_items")
    .select("*")
    .eq("id", itemId)
    .eq("shipment_id", id)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ ok: false, error: "Line not found." }, { status: 404 });
  }

  const action = typeof body.action === "string" ? body.action : "edit";
  const actor = await actorId();
  const now = new Date().toISOString();

  if (action === "unreceive") {
    const next = Math.max(0, (item.received_qty as number) - Math.max(1, Number(body.qty) || 1));
    const status = lineStatus(next, item.qty as number, item.damaged_qty as number);
    const { data, error } = await supabase
      .from("ic_shipment_items")
      .update({ received_qty: next, status, updated_at: now })
      .eq("id", itemId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, item: data });
  }

  if (action === "missing" || action === "expected") {
    const { data, error } = await supabase
      .from("ic_shipment_items")
      .update({ status: action, updated_at: now })
      .eq("id", itemId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (action === "missing") {
      await notifyReceiving({
        title: `Missing: ${item.item_number}`,
        message: `${item.job_name || item.cust_ref || "Unassigned"} · ${item.description ?? item.item_number} still not on the truck.`,
        severity: "warning",
      });
    }
    return NextResponse.json({ ok: true, item: data });
  }

  if (action === "damage") {
    const damagedQty = Math.max(1, Number(body.damaged_qty) || 1);
    const nextDamaged = (item.damaged_qty as number) + damagedQty;
    const status = lineStatus(item.received_qty as number, item.qty as number, nextDamaged, "damaged");
    const { data, error } = await supabase
      .from("ic_shipment_items")
      .update({ damaged_qty: nextDamaged, status, updated_at: now })
      .eq("id", itemId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    if (item.part_id) {
      try {
        await applyStockMovement({
          partId: item.part_id as string,
          movementType: "scrap",
          qty: damagedQty,
          jobId: (item.job_id as string) || null,
          note: typeof body.description === "string" ? body.description : "Damaged on receive",
          actorId: actor,
        });
      } catch {
        /* ignore */
      }
    }

    const { data: claim } = await supabase
      .from("ic_shipment_claims")
      .insert({
        shipment_id: id,
        item_id: itemId,
        claim_type: typeof body.claim_type === "string" ? body.claim_type : "DAMAGED",
        description:
          typeof body.description === "string" && body.description.trim()
            ? body.description.trim()
            : "Damaged on receive",
        damaged_qty: damagedQty,
        photo_url: typeof body.photo_url === "string" ? body.photo_url : null,
        status: "draft",
        reorder: Boolean(body.reorder),
        created_by: actor,
      })
      .select("*")
      .single();

    return NextResponse.json({ ok: true, item: data, claim });
  }

  const patch: Record<string, unknown> = { updated_at: now };
  for (const key of [
    "item_number",
    "so_number",
    "cust_ref",
    "job_name",
    "description",
    "container_id",
    "vendor_sku",
    "note",
    "job_id",
    "part_id",
  ]) {
    if (key in body) patch[key] = body[key] ?? null;
  }
  if (typeof body.qty === "number") patch.qty = Math.max(1, Math.round(body.qty));
  const { data, error } = await supabase
    .from("ic_shipment_items")
    .update(patch)
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}
