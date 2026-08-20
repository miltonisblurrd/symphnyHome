/**
 * Inventory helpers for Frank's warehouse module.
 * qty_on_hand is physical stock. qty_reserved is promised to jobs, still on the shelf.
 * Available = on_hand - reserved.
 */
import { getSupabaseAdmin } from "@/db/client";
import type { IcStockMovementType } from "@/db/ops-schema";

export const PART_CATEGORIES = [
  "hardware",
  "drawer_slides",
  "pull_downs",
  "accessories",
  "panels",
  "finish",
  "other",
] as const;

export const IMPORT_TEMPLATE_CSV = [
  "sku,name,size,category,location,qty,unit_cost,reorder_point,vendor",
  "UM-21,Undermount slide,21 in,drawer_slides,A12,12,8.50,4,Stow",
  "UM-18,Undermount slide,18 in,drawer_slides,A12,0,8.50,4,Stow",
].join("\n");

export type StockMovementInput = {
  partId: string;
  movementType: IcStockMovementType;
  qty: number; // always positive from UI except adjust
  jobId?: string | null;
  unitCostCents?: number | null;
  note?: string | null;
  actorId?: string | null;
};

export function availableQty(onHand: number, reserved: number): number {
  return Math.max(0, (onHand ?? 0) - (reserved ?? 0));
}

/** Signed delta applied to qty_on_hand. */
export function qtyDelta(type: IcStockMovementType, qty: number): number {
  const absolute = Math.abs(qty);
  switch (type) {
    case "receive":
    case "return":
      return absolute;
    case "allocate":
    case "scrap":
    case "sell_excess":
      return -absolute;
    case "reserve":
    case "unreserve":
      return 0;
    case "adjust":
      return qty;
    default:
      return 0;
  }
}

function nextReserved(type: IcStockMovementType, qty: number, current: number): number {
  const absolute = Math.abs(qty);
  switch (type) {
    case "reserve":
      return current + absolute;
    case "unreserve":
    case "allocate":
      return Math.max(0, current - absolute);
    default:
      return current;
  }
}

export async function applyStockMovement(input: StockMovementInput) {
  if (!input.partId) throw new Error("partId is required.");
  if (!Number.isFinite(input.qty) || input.qty === 0) {
    throw new Error("qty must be a non-zero number.");
  }
  if (
    (input.movementType === "allocate" ||
      input.movementType === "return" ||
      input.movementType === "reserve" ||
      input.movementType === "unreserve") &&
    !input.jobId
  ) {
    throw new Error("jobId is required for this movement.");
  }

  const supabase = getSupabaseAdmin();
  const { data: part, error: partError } = await supabase
    .from("ic_parts")
    .select("*")
    .eq("id", input.partId)
    .is("deleted_at", null)
    .maybeSingle();
  if (partError) throw partError;
  if (!part) throw new Error("Part not found.");

  const onHand = part.qty_on_hand as number;
  const reserved = part.qty_reserved as number;
  const avail = availableQty(onHand, reserved);
  const absQty = Math.abs(input.qty);

  if (input.movementType === "reserve" && absQty > avail) {
    throw new Error(
      `Not enough available for ${part.sku}${part.size ? ` (${part.size})` : ""}. On hand ${onHand}, reserved ${reserved}, available ${avail}, requested ${absQty}. Order it.`,
    );
  }
  if (input.movementType === "unreserve" && absQty > reserved) {
    throw new Error(`Cannot unreserve ${absQty} of ${part.sku} — only ${reserved} reserved.`);
  }

  const delta = qtyDelta(input.movementType, input.qty);
  const nextQty = onHand + delta;
  if (nextQty < 0) {
    throw new Error(
      `Not enough stock for ${part.sku}. On hand: ${onHand}, requested: ${Math.abs(delta)}.`,
    );
  }

  const reservedAfter = nextReserved(input.movementType, input.qty, reserved);
  const ledgerQty =
    input.movementType === "adjust" ? input.qty : Math.abs(input.qty);

  const { data: movement, error: moveError } = await supabase
    .from("ic_stock_movements")
    .insert({
      part_id: input.partId,
      job_id: input.jobId ?? null,
      movement_type: input.movementType,
      qty: ledgerQty,
      unit_cost_cents: input.unitCostCents ?? part.unit_cost_cents,
      note: input.note ?? null,
      created_by: input.actorId ?? null,
    })
    .select("*")
    .single();
  if (moveError) {
    if (/invalid input value for enum|reserve|unreserve/i.test(moveError.message)) {
      throw new Error(
        "Run drizzle/0012_ic_inventory_schedule.sql in Supabase to enable reserve/unreserve.",
      );
    }
    throw moveError;
  }

  const { data: updatedPart, error: updateError } = await supabase
    .from("ic_parts")
    .update({
      qty_on_hand: nextQty,
      qty_reserved: reservedAfter,
      updated_at: new Date().toISOString(),
      ...(input.actorId ? { updated_by: input.actorId } : {}),
      ...(input.movementType === "sell_excess" ? { is_excess: false } : {}),
    })
    .eq("id", input.partId)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await supabase.from("ic_activity_log").insert({
    entity_type: "part",
    entity_id: input.partId,
    action: `stock_${input.movementType}`,
    actor_id: input.actorId ?? null,
    actor_label: input.actorId ? null : "ops-app",
    changes: {
      qty: { from: onHand, to: nextQty },
      qty_reserved: { from: reserved, to: reservedAfter },
      job_id: input.jobId ?? null,
      movement_id: movement.id,
    },
  });

  return { movement, part: updatedPart };
}

export type ImportPartRow = {
  sku: string;
  name: string;
  size?: string | null;
  category?: string | null;
  location?: string | null;
  qty?: number;
  unit_cost_cents?: number;
  reorder_point?: number;
  vendor?: string | null;
  barcode?: string | null;
  notes?: string | null;
};

export async function importParts(
  rows: ImportPartRow[],
  actorId?: string | null,
): Promise<{ created: number; updated: number; errors: string[] }> {
  const supabase = getSupabaseAdmin();
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const raw of rows) {
    const sku = String(raw.sku ?? "").trim().toUpperCase();
    const name = String(raw.name ?? "").trim();
    if (!sku || !name) {
      errors.push(`Skipped a row without sku/name.`);
      continue;
    }
    try {
      const { data: existing } = await supabase
        .from("ic_parts")
        .select("*")
        .eq("sku", sku)
        .is("deleted_at", null)
        .maybeSingle();

      const qty = Math.max(0, Math.round(raw.qty ?? 0));
      const patch = {
        name,
        size: raw.size?.trim() || null,
        category: raw.category?.trim() || "hardware",
        location: raw.location?.trim() || null,
        unit_cost_cents: raw.unit_cost_cents ?? 0,
        reorder_point: raw.reorder_point ?? 0,
        vendor: raw.vendor?.trim() || null,
        barcode: raw.barcode?.trim() || null,
        notes: raw.notes?.trim() || null,
        updated_at: new Date().toISOString(),
        ...(actorId ? { updated_by: actorId } : {}),
      };

      if (!existing) {
        const insertPayload = {
          sku,
          ...patch,
          qty_on_hand: qty,
          qty_reserved: 0,
          created_by: actorId ?? null,
        };
        let { data: part, error } = await supabase
          .from("ic_parts")
          .insert(insertPayload)
          .select("*")
          .single();
        if (error && /column.*size/i.test(error.message)) {
          const { size: _size, ...withoutSize } = insertPayload;
          void _size;
          const retry = await supabase.from("ic_parts").insert(withoutSize).select("*").single();
          part = retry.data;
          error = retry.error;
        }
        if (error) throw error;
        if (!part) throw new Error("Insert returned no part.");
        if (qty > 0) {
          await supabase.from("ic_stock_movements").insert({
            part_id: part.id,
            movement_type: "receive",
            qty,
            unit_cost_cents: patch.unit_cost_cents,
            note: "Opening count (import)",
            created_by: actorId ?? null,
          });
        }
        created += 1;
      } else {
        const onHand = existing.qty_on_hand as number;
        const delta = qty - onHand;
        const { error } = await supabase.from("ic_parts").update(patch).eq("id", existing.id);
        if (error) {
          if (/column.*size/i.test(error.message)) {
            const { size, ...withoutSize } = patch;
            void size;
            const retry = await supabase.from("ic_parts").update(withoutSize).eq("id", existing.id);
            if (retry.error) throw retry.error;
          } else {
            throw error;
          }
        }
        if (delta !== 0) {
          await applyStockMovement({
            partId: existing.id,
            movementType: "adjust",
            qty: delta,
            note: "Count true-up (import)",
            actorId: actorId ?? null,
          });
        }
        updated += 1;
      }
    } catch (error) {
      errors.push(
        `${sku}: ${error instanceof Error ? error.message : "import failed"}`,
      );
    }
  }

  return { created, updated, errors };
}
