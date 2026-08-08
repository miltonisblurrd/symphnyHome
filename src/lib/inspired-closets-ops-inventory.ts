/**
 * Inventory helpers for Frank's warehouse module.
 * qty_on_hand is updated with every stock movement (ledger + live balance).
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

export type StockMovementInput = {
  partId: string;
  movementType: IcStockMovementType;
  qty: number; // always positive from UI; sign applied by type
  jobId?: string | null;
  unitCostCents?: number | null;
  note?: string | null;
  actorId?: string | null;
};

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
    case "adjust":
      // adjust qty is signed: positive increases, negative decreases
      return qty;
    default:
      return 0;
  }
}

export async function applyStockMovement(input: StockMovementInput) {
  if (!input.partId) throw new Error("partId is required.");
  if (!Number.isFinite(input.qty) || input.qty === 0) {
    throw new Error("qty must be a non-zero number.");
  }
  if (
    (input.movementType === "allocate" || input.movementType === "return") &&
    !input.jobId
  ) {
    throw new Error("jobId is required for allocate/return movements.");
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

  const delta = qtyDelta(input.movementType, input.qty);
  const nextQty = (part.qty_on_hand as number) + delta;
  if (nextQty < 0) {
    throw new Error(
      `Not enough stock for ${part.sku}. On hand: ${part.qty_on_hand}, requested: ${Math.abs(delta)}.`,
    );
  }

  let nextReserved = part.qty_reserved as number;
  if (input.movementType === "allocate") {
    nextReserved += Math.abs(input.qty);
  } else if (input.movementType === "return") {
    nextReserved = Math.max(0, nextReserved - Math.abs(input.qty));
  }

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
  if (moveError) throw moveError;

  const { data: updatedPart, error: updateError } = await supabase
    .from("ic_parts")
    .update({
      qty_on_hand: nextQty,
      qty_reserved: nextReserved,
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
      qty: { from: part.qty_on_hand, to: nextQty },
      job_id: input.jobId ?? null,
      movement_id: movement.id,
    },
  });

  return { movement, part: updatedPart };
}
