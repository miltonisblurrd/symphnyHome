import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { applyStockMovement } from "@/lib/inspired-closets-ops-inventory";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import { lineStatus, linkItemToOs, notifyReceiving, reverseReceiveScan } from "@/lib/inspired-closets-ops-receiving";

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
    const qty = Math.max(1, Number(body.qty) || 1);
    const previous = item.received_qty as number;
    const next = Math.max(0, previous - qty);
    const reversed = previous - next;
    const status = lineStatus(next, item.qty as number, item.damaged_qty as number);
    const { data, error } = await supabase
      .from("ic_shipment_items")
      .update({ received_qty: next, status, updated_at: now })
      .eq("id", itemId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    let stockWarning: string | null = null;
    if (reversed > 0 && item.part_id) {
      try {
        await reverseReceiveScan({
          partId: item.part_id as string,
          qty: reversed,
          jobId: (item.job_id as string) || null,
          actorId: actor,
          note: `Undo receive scan · ${item.item_number}`,
        });
      } catch (stockError) {
        stockWarning =
          stockError instanceof Error
            ? stockError.message
            : "Slip undone; inventory could not reverse.";
      }
    }
    return NextResponse.json({ ok: true, item: data, stock_warning: stockWarning });
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

  if (action === "credit" || action === "clear_credit") {
    const needsCredit = action === "credit";
    const { data, error } = await supabase
      .from("ic_shipment_items")
      .update({ needs_credit: needsCredit, updated_at: now })
      .eq("id", itemId)
      .select("*")
      .single();
    if (error) {
      if (/needs_credit/i.test(error.message)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Run drizzle/0014_ic_job_kind_credit.sql so Bryant can mark credits without scrapping stock.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (needsCredit) {
      const { data: existing } = await supabase
        .from("ic_shipment_claims")
        .select("id")
        .eq("item_id", itemId)
        .eq("claim_type", "CREDIT")
        .in("status", ["draft", "submitted"])
        .maybeSingle();
      if (!existing) {
        await supabase.from("ic_shipment_claims").insert({
          shipment_id: id,
          item_id: itemId,
          claim_type: "CREDIT",
          description:
            typeof body.description === "string" && body.description.trim()
              ? body.description.trim()
              : "Vendor credit — still using the piece",
          damaged_qty: Math.max(1, Number(body.qty) || 1),
          status: "draft",
          reorder: false,
          created_by: actor,
        });
      }
    } else {
      await supabase
        .from("ic_shipment_claims")
        .update({ status: "cancelled", updated_at: now })
        .eq("item_id", itemId)
        .eq("claim_type", "CREDIT")
        .eq("status", "draft");
    }

    return NextResponse.json({ ok: true, item: data });
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

  const shouldRelink =
    "cust_ref" in body || "job_name" in body || "item_number" in body || "vendor_sku" in body;
  if (shouldRelink && data) {
    try {
      const links = await linkItemToOs({
        item_number: String(data.item_number ?? ""),
        vendor_sku: data.vendor_sku ? String(data.vendor_sku) : null,
        cust_ref: data.cust_ref ? String(data.cust_ref) : null,
        job_name: data.job_name ? String(data.job_name) : null,
        description: data.description ? String(data.description) : null,
        qty: Number(data.qty) || 1,
      });
      const repair: Record<string, unknown> = {};
      if (links.job_id && links.job_id !== data.job_id) repair.job_id = links.job_id;
      if (links.part_id && links.part_id !== data.part_id) repair.part_id = links.part_id;
      if (Object.keys(repair).length) {
        const { data: relinked } = await supabase
          .from("ic_shipment_items")
          .update({ ...repair, updated_at: new Date().toISOString() })
          .eq("id", itemId)
          .select("*")
          .single();
        return NextResponse.json({ ok: true, item: relinked ?? data });
      }
    } catch {
      /* keep the edited line even if match fails */
    }
  }
  return NextResponse.json({ ok: true, item: data });
}
