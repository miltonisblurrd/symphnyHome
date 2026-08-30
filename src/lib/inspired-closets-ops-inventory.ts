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
  "name,color,size,vendor,item_number,qty",
  "Jewelry tray,BLACK,22W X 16-5/8D,STOW,,1",
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
      `Not enough available for ${partLabel(part)}. On hand ${onHand}, reserved ${reserved}, available ${avail}, requested ${absQty}. Order it.`,
    );
  }
  if (input.movementType === "unreserve" && absQty > reserved) {
    throw new Error(`Cannot unreserve ${absQty} of ${partLabel(part)} — only ${reserved} reserved.`);
  }

  const delta = qtyDelta(input.movementType, input.qty);
  const nextQty = onHand + delta;
  if (nextQty < 0) {
    throw new Error(
      `Not enough stock for ${partLabel(part)}. On hand: ${onHand}, requested: ${Math.abs(delta)}.`,
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
  sku?: string;
  name: string;
  color?: string | null;
  size?: string | null;
  category?: string | null;
  location?: string | null;
  qty?: number;
  qty_reserved?: number;
  unit_cost_cents?: number;
  reorder_point?: number;
  vendor?: string | null;
  barcode?: string | null;
  item_number?: string | null;
  notes?: string | null;
};

export function splitNameAndColor(name: string): { name: string; color: string | null } {
  const trimmed = name.trim();
  const sep = trimmed.indexOf(" · ");
  if (sep < 0) return { name: trimmed, color: null };
  return {
    name: trimmed.slice(0, sep).trim(),
    color: trimmed.slice(sep + 3).trim() || null,
  };
}

/** Item # is exactly what the sheet has. Blank stays blank. Never show a hidden UUID or IC- slug. */
export function realItemNumber(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return null;
  }
  if (/^IC-/i.test(raw)) return null;
  return raw;
}

export function itemNumberOf(row: ImportPartRow): string | null {
  return realItemNumber(row.item_number) ?? realItemNumber(row.barcode);
}

/** Hidden unique key for the database. Never show this in Name or Item #. */
export function hiddenPartSku(): string {
  return crypto.randomUUID();
}

export function partLabel(part: {
  name?: string | null;
  color?: string | null;
  size?: string | null;
}): string {
  return [part.name, part.color, part.size]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

function sameText(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

async function findExistingPart(
  supabase: AdminClient,
  input: {
    sku: string;
    itemNumber: string | null;
    name: string;
    color: string | null;
    size: string | null;
    vendor: string | null;
  },
) {
  const { data: bySku } = await supabase
    .from("ic_parts")
    .select("*")
    .is("deleted_at", null)
    .eq("sku", input.sku)
    .maybeSingle();
  if (bySku) return bySku;

  const { data: matches } = await supabase
    .from("ic_parts")
    .select("*")
    .is("deleted_at", null)
    .eq("name", input.name)
    .limit(80);
  const pool = (matches ?? []).filter((part) => {
    const color = (part.color ?? part.location ?? null) as string | null;
    return (
      sameText(color, input.color) &&
      sameText(part.size, input.size) &&
      sameText(part.vendor, input.vendor) &&
      sameText(part.barcode, input.itemNumber)
    );
  });
  return pool.length === 1 ? pool[0] : null;
}

async function writePartRow(
  supabase: AdminClient,
  mode: "insert" | "update",
  payload: Record<string, unknown>,
  id?: string,
) {
  const attempts: Record<string, unknown>[] = [payload];
  const { color: droppedColor, ...withoutColor } = payload;
  const { size: _size, ...withoutSize } = payload;
  const { color: _c2, size: _s2, ...withoutBoth } = payload;
  void _size;
  void _c2;
  void _s2;
  attempts.push(
    { ...withoutColor, location: payload.location || droppedColor || null },
    withoutSize,
    { ...withoutBoth, location: payload.location || droppedColor || null },
  );

  let lastError: { message: string } | null = null;
  for (const attempt of attempts) {
    const result =
      mode === "insert"
        ? await supabase.from("ic_parts").insert(attempt).select("*").single()
        : await supabase.from("ic_parts").update(attempt).eq("id", id).select("*").single();
    if (!result.error) return result;
    lastError = result.error;
    if (!/column.*(color|size)/i.test(result.error.message)) break;
  }
  return { data: null, error: lastError };
}

export async function importParts(
  rows: ImportPartRow[],
  actorId?: string | null,
): Promise<{ created: number; updated: number; errors: string[] }> {
  const supabase = getSupabaseAdmin();
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const raw of rows) {
    const rawName = String(raw.name ?? "").trim();
    const colorFromColumn = String(raw.color ?? "").trim();
    const split = colorFromColumn ? { name: rawName, color: colorFromColumn } : splitNameAndColor(rawName);
    const name = split.name;
    const color = colorFromColumn || split.color;
    const itemNumber = itemNumberOf(raw);
    const sku = hiddenPartSku();
    if (!name) {
      errors.push(`Skipped a row without a name.`);
      continue;
    }
    try {
      const size = raw.size?.trim() || null;
      const vendor = raw.vendor?.trim() || null;
      const existing = await findExistingPart(supabase, {
        sku,
        itemNumber,
        name,
        color,
        size,
        vendor,
      });

      const qty = Math.max(0, Math.round(raw.qty ?? 0));
      const patch = {
        name,
        color,
        size,
        category: raw.category?.trim() || "hardware",
        location: raw.location?.trim() || null,
        unit_cost_cents: raw.unit_cost_cents ?? 0,
        reorder_point: raw.reorder_point ?? 0,
        vendor,
        barcode: itemNumber,
        notes: raw.notes?.trim() || null,
        updated_at: new Date().toISOString(),
        ...(actorId ? { updated_by: actorId } : {}),
      };

      if (!existing) {
        const insertPayload = {
          sku,
          ...patch,
          qty_on_hand: qty,
          qty_reserved: Math.max(0, Math.round(raw.qty_reserved ?? 0)),
          created_by: actorId ?? null,
        };
        const { data: part, error } = await writePartRow(supabase, "insert", insertPayload);
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
        const reserved = Math.max(0, Math.round(raw.qty_reserved ?? (existing.qty_reserved as number) ?? 0));
        const { error } = await writePartRow(
          supabase,
          "update",
          { ...patch, qty_reserved: reserved },
          existing.id,
        );
        if (error) throw error;
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
