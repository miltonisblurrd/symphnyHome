/**
 * Packing-slip receiving — ModulusScan clone living inside Inspired Closets OS.
 * Scans write ic_stock_movements when a line is linked to a part, and match jobs
 * via the customer name Frank writes on the Stow order (cust_ref).
 */
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/db/client";
import { applyStockMovement } from "@/lib/inspired-closets-ops-inventory";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";

export const RECEIVING_VENDORS = ["stow", "richelieu", "hafele", "other"] as const;
export const PALLET_MISSING_THRESHOLD = 0.7;

export type ParsedSlipItem = {
  item_number: string;
  so_number?: string | null;
  cust_ref?: string | null;
  job_name?: string | null;
  project_number?: string | null;
  description?: string | null;
  qty: number;
  container_id?: string | null;
  source_page?: number | null;
  vendor_sku?: string | null;
};

export type ShipmentItemRow = {
  id: string;
  shipment_id: string;
  item_number: string;
  so_number: string | null;
  cust_ref: string | null;
  job_name: string | null;
  project_number: string | null;
  description: string | null;
  qty: number;
  received_qty: number;
  damaged_qty: number;
  container_id: string | null;
  source_page: number | null;
  status: string;
  vendor_sku: string | null;
  job_id: string | null;
  part_id: string | null;
  note: string | null;
  needs_credit?: boolean;
};

export const SHIPMENT_ITEM_SELECT =
  "id, shipment_id, item_number, so_number, cust_ref, job_name, project_number, description, qty, received_qty, damaged_qty, needs_credit, container_id, source_page, status, vendor_sku, job_id, part_id, note";

export const SHIPMENT_ITEM_SELECT_LEGACY =
  "id, shipment_id, item_number, so_number, cust_ref, job_name, project_number, description, qty, received_qty, damaged_qty, container_id, source_page, status, vendor_sku, job_id, part_id, note";

export function missingReceivingTable(message: string): boolean {
  return /relation|schema cache|does not exist|ic_shipment/i.test(message);
}

export function missingNeedsCreditColumn(message: string): boolean {
  return /needs_credit/i.test(message);
}

export async function loadShipmentItemRows(
  shipmentId: string,
  options?: { order?: boolean },
): Promise<ShipmentItemRow[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_shipment_items")
    .select(SHIPMENT_ITEM_SELECT)
    .eq("shipment_id", shipmentId);
  if (options?.order) {
    query = query.order("source_page").order("item_number");
  }
  const first = await query;
  if (first.error && missingNeedsCreditColumn(first.error.message)) {
    let retry = supabase
      .from("ic_shipment_items")
      .select(SHIPMENT_ITEM_SELECT_LEGACY)
      .eq("shipment_id", shipmentId);
    if (options?.order) {
      retry = retry.order("source_page").order("item_number");
    }
    const second = await retry;
    if (second.error) throw second.error;
    return ((second.data ?? []) as ShipmentItemRow[]).map((row) => ({
      ...row,
      needs_credit: false,
    }));
  }
  if (first.error) throw first.error;
  return (first.data ?? []) as ShipmentItemRow[];
}

export function normalizeCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

const SKIP_JOB_WORDS = new Set(["demo", "new", "cart", "the", "a", "and"]);

/** FOX_071526 / CAVANAUGH-072126 / CRISOLOGO #2 → searchable client name. */
export function jobNameFromCustRef(custRef: string | null | undefined): string {
  if (!custRef) return "";
  return custRef
    .replace(/[_-]/g, " ")
    .replace(/\b\d{5,8}\b/g, "")
    .replace(/#\s*\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Last meaningful name on the slip (Wright from Wright_072426 or DEMO_Wright). */
export function clientHintFromSlip(custRef?: string | null, jobName?: string | null): string {
  const words = `${jobNameFromCustRef(custRef)} ${jobName ?? ""}`
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !SKIP_JOB_WORDS.has(word.toLowerCase()) && !/^\d+$/.test(word));
  return words[words.length - 1] || words[0] || "";
}

export function lineStatus(received: number, qty: number, damaged = 0, forced?: string): string {
  if (forced === "missing" || forced === "damaged") return forced;
  if (damaged > 0 && received + damaged >= qty) return "damaged";
  if (received >= qty) return "received";
  return "expected";
}

export function shipmentRollup(items: ShipmentItemRow[]) {
  const totalQty = items.reduce((sum, row) => sum + (row.qty ?? 0), 0);
  const receivedQty = items.reduce((sum, row) => sum + (row.received_qty ?? 0), 0);
  const receivedLines = items.filter((row) => row.status === "received").length;
  const damagedLines = items.filter((row) => row.status === "damaged").length;
  const missingLines = items.filter((row) => row.status === "missing").length;
  const pendingLines = items.filter((row) => row.status === "expected").length;
  const creditLines = items.filter((row) => Boolean(row.needs_credit)).length;
  const pct = totalQty > 0 ? Math.round((receivedQty / totalQty) * 100) : 0;

  const byJob = new Map<
    string,
    {
      job_name: string;
      cust_ref: string;
      job_id: string | null;
      items: number;
      total_qty: number;
      total_received_qty: number;
      received: number;
      damaged: number;
      missing: number;
    }
  >();
  const byContainer = new Map<
    string,
    {
      container_id: string;
      items: number;
      total_qty: number;
      total_received_qty: number;
      received: number;
      damaged: number;
      missing: number;
    }
  >();

  for (const row of items) {
    const jobKey = row.cust_ref || row.job_name || "Unassigned";
    const job = byJob.get(jobKey) ?? {
      job_name: row.job_name || jobNameFromCustRef(row.cust_ref) || "Unassigned",
      cust_ref: row.cust_ref || jobKey,
      job_id: row.job_id,
      items: 0,
      total_qty: 0,
      total_received_qty: 0,
      received: 0,
      damaged: 0,
      missing: 0,
    };
    job.items += 1;
    job.total_qty += row.qty ?? 0;
    job.total_received_qty += row.received_qty ?? 0;
    if (row.status === "received") job.received += 1;
    if (row.status === "damaged") job.damaged += 1;
    if (row.status === "missing") job.missing += 1;
    if (row.job_id) job.job_id = row.job_id;
    byJob.set(jobKey, job);

    const palletKey = row.container_id || "no-pallet";
    const pallet = byContainer.get(palletKey) ?? {
      container_id: row.container_id || "no-pallet",
      items: 0,
      total_qty: 0,
      total_received_qty: 0,
      received: 0,
      damaged: 0,
      missing: 0,
    };
    pallet.items += 1;
    pallet.total_qty += row.qty ?? 0;
    pallet.total_received_qty += row.received_qty ?? 0;
    if (row.status === "received") pallet.received += 1;
    if (row.status === "damaged") pallet.damaged += 1;
    if (row.status === "missing") pallet.missing += 1;
    byContainer.set(palletKey, pallet);
  }

  const pallets = [...byContainer.values()];
  const palletsScanned = pallets.filter((p) => p.total_received_qty > 0).length;
  const palletsTotal = pallets.length;
  const palletPct = palletsTotal > 0 ? palletsScanned / palletsTotal : 0;

  return {
    total_items: items.length,
    total_qty: totalQty,
    total_received_qty: receivedQty,
    received_items: receivedLines,
    pending: pendingLines,
    damaged: damagedLines,
    missing: missingLines,
    credit: creditLines,
    pct,
    by_job: [...byJob.values()].sort((a, b) => a.job_name.localeCompare(b.job_name)),
    by_container: pallets,
    pallets_total: palletsTotal,
    pallets_scanned: palletsScanned,
    waiting_for_pallets: palletPct < PALLET_MISSING_THRESHOLD,
  };
}

export function matchItem(
  items: ShipmentItemRow[],
  scanned: string,
  palletId?: string | null,
): { item: ShipmentItemRow | null; result: "matched" | "already_received" | "unknown" | "pallet_mismatch" } {
  const raw = scanned.trim();
  const norm = normalizeCode(raw);
  if (!raw) return { item: null, result: "unknown" };

  const matches = items.filter((row) => {
    const numbers = [row.item_number, row.vendor_sku].filter(Boolean) as string[];
    return numbers.some((n) => n === raw || normalizeCode(n) === norm);
  });
  if (matches.length === 0) return { item: null, result: "unknown" };

  const open = matches.filter((row) => (row.received_qty ?? 0) < (row.qty ?? 1));
  if (open.length === 0) return { item: matches[0], result: "already_received" };

  if (palletId) {
    const onPallet = open.find((row) => row.container_id === palletId);
    if (onPallet) return { item: onPallet, result: "matched" };
    return { item: open[0], result: "pallet_mismatch" };
  }
  return { item: open[0], result: "matched" };
}

function partCategoryFromDescription(description?: string | null): string {
  const prefix = (description ?? "").trim().slice(0, 2).toUpperCase();
  if (["DF", "SH", "DB", "VT", "DR", "TV", "WD"].includes(prefix)) return "panels";
  return "hardware";
}

async function findPartId(codes: string[]): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  for (const code of unique) {
    const { data } = await supabase
      .from("ic_parts")
      .select("id, barcode")
      .is("deleted_at", null)
      .or(`sku.eq.${code},sku.ilike.${code},barcode.eq.${code}`)
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      if (!data.barcode && /^\d{6,}$/.test(code)) {
        await supabase.from("ic_parts").update({ barcode: code }).eq("id", data.id);
      }
      return data.id as string;
    }
  }
  return null;
}

async function ensurePartForSlipItem(item: ParsedSlipItem): Promise<string | null> {
  const sku = item.item_number.trim();
  if (!sku) return null;
  const existing = await findPartId([sku, item.vendor_sku ?? ""]);
  if (existing) return existing;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_parts")
    .insert({
      sku,
      name: (item.description || sku).trim(),
      category: partCategoryFromDescription(item.description),
      barcode: sku,
      vendor: "Stow",
      qty_on_hand: 0,
      qty_reserved: 0,
      notes: `Created from packing slip${item.cust_ref ? ` · ${item.cust_ref}` : ""}.`,
    })
    .select("id")
    .single();
  if (error) {
    const raced = await findPartId([sku]);
    return raced;
  }
  return (data?.id as string) ?? null;
}

async function findJobId(item: ParsedSlipItem): Promise<string | null> {
  const hint = clientHintFromSlip(item.cust_ref, item.job_name);
  if (!hint) return null;
  const supabase = getSupabaseAdmin();
  const { data: clients } = await supabase
    .from("ic_clients")
    .select("id, name")
    .is("deleted_at", null)
    .ilike("name", `%${hint}%`)
    .limit(40);
  const needle = hint.toLowerCase();
  const client = (clients ?? []).find((row) => {
    const tokens = String(row.name ?? "")
      .toLowerCase()
      .split(/[\s,/]+/)
      .filter(Boolean);
    return tokens.includes(needle) || String(row.name ?? "").toLowerCase() === needle;
  });
  if (!client?.id) return null;

  const { data: jobs } = await supabase
    .from("ic_jobs")
    .select("id, stage, install_date")
    .eq("client_id", client.id)
    .is("deleted_at", null)
    .order("install_date", { ascending: false, nullsFirst: false })
    .limit(12);
  const open = (jobs ?? []).filter((job) => !["closed", "cancelled"].includes(String(job.stage)));
  const preferred = open.find((job) =>
    ["ordered", "job_check", "deposit_received", "install_scheduled"].includes(String(job.stage)),
  );
  return preferred?.id ?? open[0]?.id ?? null;
}

export async function linkItemToOs(
  item: ParsedSlipItem,
  options: { createPart?: boolean } = {},
): Promise<{
  job_id: string | null;
  part_id: string | null;
}> {
  const partId = options.createPart === false
    ? await findPartId([item.item_number, item.vendor_sku ?? ""])
    : await ensurePartForSlipItem(item);
  const jobId = await findJobId(item);
  return { job_id: jobId, part_id: partId };
}

export async function relinkShipmentItems(shipmentId: string): Promise<{
  linked_parts: number;
  linked_jobs: number;
  unassigned: number;
}> {
  const supabase = getSupabaseAdmin();
  const { data: items, error } = await supabase
    .from("ic_shipment_items")
    .select(
      "id, item_number, vendor_sku, cust_ref, job_name, description, qty, received_qty, job_id, part_id",
    )
    .eq("shipment_id", shipmentId);
  if (error) throw error;

  let linkedParts = 0;
  let linkedJobs = 0;
  let unassigned = 0;
  for (const row of items ?? []) {
    const links = await linkItemToOs({
      item_number: String(row.item_number ?? ""),
      vendor_sku: row.vendor_sku ? String(row.vendor_sku) : null,
      cust_ref: row.cust_ref ? String(row.cust_ref) : null,
      job_name: row.job_name ? String(row.job_name) : null,
      description: row.description ? String(row.description) : null,
      qty: Number(row.qty) || 1,
    });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (links.part_id && links.part_id !== row.part_id) {
      patch.part_id = links.part_id;
      linkedParts += 1;
    }
    if (links.job_id && links.job_id !== row.job_id) {
      patch.job_id = links.job_id;
      linkedJobs += 1;
    }
    if (!links.job_id) unassigned += 1;
    if (Object.keys(patch).length > 1) {
      await supabase.from("ic_shipment_items").update(patch).eq("id", row.id);
    }
    const nextPart = (patch.part_id as string | undefined) ?? (row.part_id as string | null);
    if (nextPart && !row.part_id && Number(row.received_qty) > 0) {
      try {
        await applyScanToInventory({
          item: {
            id: String(row.id),
            shipment_id: shipmentId,
            item_number: String(row.item_number),
            so_number: null,
            cust_ref: row.cust_ref ? String(row.cust_ref) : null,
            job_name: row.job_name ? String(row.job_name) : null,
            project_number: null,
            description: row.description ? String(row.description) : null,
            qty: Number(row.qty) || 1,
            received_qty: Number(row.received_qty) || 0,
            damaged_qty: 0,
            container_id: null,
            source_page: null,
            status: "received",
            vendor_sku: row.vendor_sku ? String(row.vendor_sku) : null,
            job_id: (patch.job_id as string | undefined) ?? (row.job_id as string | null),
            part_id: nextPart,
            note: null,
          },
          qty: Number(row.received_qty) || 0,
          actorId: null,
        });
      } catch {
        /* best-effort backfill */
      }
    }
  }
  return { linked_parts: linkedParts, linked_jobs: linkedJobs, unassigned };
}

export async function installBlockedByReceiving(jobId: string): Promise<{
  blocked: boolean;
  message?: string;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipment_items")
    .select("qty, received_qty, status, cust_ref, job_name")
    .eq("job_id", jobId)
    .in("status", ["expected", "missing"]);
  if (error && missingReceivingTable(error.message)) return { blocked: false };
  if (error) return { blocked: false };
  const open = (data ?? []).filter((row) => (row.received_qty ?? 0) < (row.qty ?? 1));
  if (open.length === 0) return { blocked: false };
  const pieces = open.reduce((sum, row) => sum + Math.max(0, (row.qty ?? 1) - (row.received_qty ?? 0)), 0);
  const name = String(open[0]?.job_name || open[0]?.cust_ref || "This job");
  return {
    blocked: true,
    message: `${name} still has ${pieces} piece${pieces === 1 ? "" : "s"} not received. Finish Receiving or mark the line missing before install can be scheduled.`,
  };
}

export async function applyScanToInventory(input: {
  item: ShipmentItemRow;
  qty: number;
  actorId: string | null;
  notice?: string | null;
}) {
  if (!input.item.part_id) return;
  await applyStockMovement({
    partId: input.item.part_id,
    movementType: "receive",
    qty: input.qty,
    jobId: input.item.job_id,
    note: `Receive scan${input.notice ? ` · ${input.notice}` : ""}${
      input.item.cust_ref ? ` · ${input.item.cust_ref}` : ""
    }`,
    actorId: input.actorId,
  });
}

export async function notifyReceiving(input: {
  title: string;
  message: string;
  severity?: string;
  assignee?: string;
}) {
  const assignees = input.assignee
    ? [input.assignee]
    : ["Frank", "Bryant", "Craig"];
  for (const assignee of assignees) {
    try {
      await postInspiredClosetsSlackNotification({
        assignee,
        title: input.title,
        severity: input.severity ?? "info",
        todoLabel: "Receiving",
        notifyMessage: input.message,
        requestedBy: "Warehouse",
      });
    } catch {
      // Slack is optional — receiving still succeeds.
    }
  }
}

const PARSE_SYSTEM = `You extract line items from Inspired Closets / Stow packing slips.
Return ONLY JSON: {"notice": string|null, "ship_date": "MM/DD/YYYY"|null, "vendor": "stow"|"richelieu"|"hafele"|"other", "total_pages": number, "items": [...]}.
Each item: item_number (SKU / barcode digits), so_number, cust_ref (client name as printed, often NAME_MMDDYY), job_name (client last name), project_number, description, qty (integer), container_id (pallet), source_page, vendor_sku.
Do not invent SKUs. Qty defaults to 1 if missing. cust_ref is the client label Frank wrote on the order.`;

export async function parsePackingSlip(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{
  notice: string | null;
  ship_date: string | null;
  vendor: string;
  total_pages: number;
  items: ParsedSlipItem[];
  parse_quality: Record<string, unknown>;
}> {
  const apiKey =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Packing-slip parse needs INSPIRED_CLOSETS_ANTHROPIC_API_KEY.");
  }

  const client = new Anthropic({ apiKey });
  const model =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-5";
  const isPdf = input.mimeType.includes("pdf") || /\.pdf$/i.test(input.filename);
  const mediaType = isPdf
    ? "application/pdf"
    : input.mimeType.startsWith("image/")
      ? input.mimeType
      : "application/pdf";

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [
    isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: input.bytes.toString("base64"),
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: input.bytes.toString("base64"),
          },
        },
    {
      type: "text",
      text: `Extract every line from this packing slip (${input.filename}). JSON only.`,
    },
  ];

  const message = await client.messages.create({
    model,
    max_tokens: 16000,
    system: PARSE_SYSTEM,
    messages: [{ role: "user", content }],
  });
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(jsonText) as {
    notice?: string | null;
    ship_date?: string | null;
    vendor?: string;
    total_pages?: number;
    items?: ParsedSlipItem[];
  };
  const items = (parsed.items ?? [])
    .map((row) => ({
      item_number: String(row.item_number ?? "").trim(),
      so_number: row.so_number ? String(row.so_number) : null,
      cust_ref: row.cust_ref ? String(row.cust_ref) : null,
      job_name: row.job_name ? String(row.job_name) : jobNameFromCustRef(String(row.cust_ref ?? "")),
      project_number: row.project_number ? String(row.project_number) : null,
      description: row.description ? String(row.description) : null,
      qty: Math.max(1, Math.round(Number(row.qty) || 1)),
      container_id: row.container_id ? String(row.container_id) : null,
      source_page: row.source_page ? Number(row.source_page) : null,
      vendor_sku: row.vendor_sku ? String(row.vendor_sku) : null,
    }))
    .filter((row) => row.item_number);
  if (items.length === 0) {
    throw new Error("Parser found no line items. Use the original PDF, not a photo.");
  }
  return {
    notice: parsed.notice ? String(parsed.notice) : null,
    ship_date: parsed.ship_date ? String(parsed.ship_date) : null,
    vendor: parsed.vendor || "stow",
    total_pages: Number(parsed.total_pages) || 0,
    items,
    parse_quality: {
      total_items: items.length,
      missing_cust_ref: items.filter((i) => !i.cust_ref).length,
      missing_description: items.filter((i) => !i.description).length,
    },
  };
}

export function fixtureItemsToParsed(
  rows: Array<Record<string, unknown>>,
): ParsedSlipItem[] {
  return rows
    .map((row) => ({
      item_number: String(row.item_number ?? "").trim(),
      so_number: row.so_number ? String(row.so_number) : null,
      cust_ref: row.cust_ref ? String(row.cust_ref) : null,
      job_name: row.job_name ? String(row.job_name) : jobNameFromCustRef(String(row.cust_ref ?? "")),
      project_number: row.project_number ? String(row.project_number) : null,
      description: row.description ? String(row.description) : null,
      qty: Math.max(1, Math.round(Number(row.qty) || 1)),
      container_id: row.container_id ? String(row.container_id) : null,
      source_page: row.source_page ? Number(row.source_page) : null,
      vendor_sku: row.vendor_sku ? String(row.vendor_sku) : null,
    }))
    .filter((row) => row.item_number);
}
