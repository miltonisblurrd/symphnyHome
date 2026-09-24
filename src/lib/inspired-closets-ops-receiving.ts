/**
 * Packing-slip receiving — ModulusScan clone living inside Inspired Closets OS.
 * Scans write ic_stock_movements when a line is linked to a part, and match jobs
 * via the customer name Frank writes on the Stow order (cust_ref).
 */
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/db/client";
import { clientIdentityKey, pickPrimaryJob } from "@/lib/inspired-closets-ops-clients";
import { applyStockMovement } from "@/lib/inspired-closets-ops-inventory";
import { extractPdfText } from "@/lib/inspired-closets-ops-pdf-text";
import {
  looksLikePackingSlip,
  looksLikeProductSummary,
  parseStowProductSummaryText,
} from "@/lib/inspired-closets-ops-product-summary-text";
import {
  looksLikeTruliteSlip,
  parseTruliteCuts,
  truliteOrderDate,
  trulitePurchaseOrder,
} from "@/lib/inspired-closets-ops-trulite-slip";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";
import { codeKeys, codesMatch } from "@/lib/inspired-closets-ops-scan-codes";
import {
  inferredShipmentShipDate,
  normalizeShipDate,
  resolveShipDate,
  shipDateFromFilename,
  shipDateFromSlipText,
} from "@/lib/inspired-closets-ops-ship-date";
import {
  isClientJobLabel,
  isShippingChargeLine,
  isUsableNotice,
} from "@/lib/inspired-closets-ops-shipment-display";

export {
  isClientJobLabel,
  isPlausibleJobLabel,
  isShippingChargeLine,
  isUsableNotice,
} from "@/lib/inspired-closets-ops-shipment-display";

export {
  inferredShipmentShipDate,
  normalizeShipDate,
  resolveShipDate,
  shipDateFromFilename,
  shipDateFromSlipText,
} from "@/lib/inspired-closets-ops-ship-date";

export { codeKeys, codesMatch, normalizeCode } from "@/lib/inspired-closets-ops-scan-codes";

export const RECEIVING_VENDORS = ["stow", "richelieu", "hafele", "trulite", "wurth", "other"] as const;
export const PALLET_MISSING_THRESHOLD = 0.7;

export type ParsedSlipItem = {
  item_number: string;
  so_number?: string | null;
  cust_ref?: string | null;
  job_name?: string | null;
  job_id?: string | null;
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

/** Same scan code on a different cut, page, or pallet is a separate piece. */
export function sameSlipLine(
  a: {
    item_number: string;
    vendor_sku?: string | null;
    description?: string | null;
    container_id?: string | null;
    source_page?: number | null;
  },
  b: {
    item_number: string;
    vendor_sku?: string | null;
    description?: string | null;
    container_id?: string | null;
    source_page?: number | null;
  },
): boolean {
  if (
    !codesMatch(a.item_number, b.item_number) &&
    !(a.vendor_sku && codesMatch(a.vendor_sku, b.item_number)) &&
    !(b.vendor_sku && codesMatch(a.item_number, b.vendor_sku)) &&
    !(a.vendor_sku && b.vendor_sku && codesMatch(a.vendor_sku, b.vendor_sku))
  ) {
    return false;
  }
  if ((a.container_id ?? "") !== (b.container_id ?? "")) return false;
  if ((a.source_page ?? null) !== (b.source_page ?? null)) return false;
  const left = (a.description ?? "").trim().toLowerCase();
  const right = (b.description ?? "").trim().toLowerCase();
  if (left && right && left !== right) return false;
  return true;
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

/**
 * Frank names files after the client: SKINNER-090426.pdf, STOW-JOHNSON.pdf, Wright_072426.pdf.
 */
export function clientHintFromFilename(filename: string | null | undefined): string {
  const base = String(filename ?? "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[=]+/g, "-")
    .trim();
  if (!base) return "";
  const withoutStamp = base.replace(/^\d{8}[_-]?\d{0,6}[_-]*/, "");
  const stripped = withoutStamp.replace(
    /^(stow|studio|summary|product|packing|pack|slip|order|so|trulite|w[uü]rth)[_-\s]+/i,
    "",
  );
  const hint = clientHintFromSlip(stripped, stripped.split(/[-_\s]/)[0] ?? stripped);
  if (hint && hint.length >= 2 && !/^\d+$/.test(hint)) return hint;
  return clientHintFromSlip(withoutStamp, withoutStamp.split(/[-_\s]/)[0] ?? withoutStamp);
}

export function packingSlipClientNames(
  items: Array<{ job_name?: string | null; cust_ref?: string | null }>,
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of items) {
    const fromJob = isClientJobLabel(item.job_name) ? String(item.job_name).trim() : "";
    const fromRef = isClientJobLabel(jobNameFromCustRef(item.cust_ref))
      ? jobNameFromCustRef(item.cust_ref)
      : "";
    const name = fromJob || fromRef;
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function joinClientNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function packingSlipUploadMessage(input: {
  imported: number;
  clientNames: string[];
  overlapNames: string[];
  unassigned: string[];
}): string {
  const lineWord = input.imported === 1 ? "line" : "lines";
  const base = `Read ${input.imported} packing-list ${lineWord}`;
  const who =
    input.clientNames.length === 0
      ? base
      : input.clientNames.length === 1
        ? `${base} for ${input.clientNames[0]}`
        : `${base} for ${input.clientNames.length} clients`;
  const overlap = [...new Set(input.overlapNames.map((name) => name.trim()).filter(Boolean))];
  const flag =
    overlap.length === 0
      ? ""
      : ` ${joinClientNames(overlap)} already ${overlap.length === 1 ? "has" : "have"} a row. Open this slip to merge or keep ${overlap.length === 1 ? "it" : "them"} separate.`;
  const missing = [
    ...new Set(input.unassigned.map((name) => name.trim()).filter((name) => name && !overlap.includes(name))),
  ].slice(0, 4);
  const missingNote =
    missing.length === 0
      ? ""
      : ` ${joinClientNames(missing)} ${missing.length === 1 ? "has" : "have"} no open job yet.`;
  return `${who}.${flag}${missingNote}`.replace(/\s+/g, " ").trim();
}

export async function findJobFromFilename(filename: string | null | undefined): Promise<string | null> {
  const hint = clientHintFromFilename(filename);
  if (!hint) return null;
  return findJobId({
    item_number: "",
    qty: 1,
    cust_ref: hint,
    job_name: hint,
  });
}

export function lineStatus(received: number, qty: number, damaged = 0, forced?: string): string {
  if (forced === "missing" || forced === "damaged") return forced;
  if (damaged > 0 && received + damaged >= qty) return "damaged";
  if (received >= qty) return "received";
  return "expected";
}

export function shipmentRollup(items: ShipmentItemRow[]) {
  const countable = items.filter((row) => !isShippingChargeLine(row));
  const totalQty = countable.reduce((sum, row) => sum + (row.qty ?? 0), 0);
  const receivedQty = countable.reduce((sum, row) => sum + (row.received_qty ?? 0), 0);
  const receivedLines = countable.filter((row) => row.status === "received").length;
  const damagedLines = countable.filter((row) => row.status === "damaged").length;
  const missingLines = countable.filter((row) => row.status === "missing").length;
  const pendingLines = countable.filter((row) => row.status === "expected").length;
  const creditLines = countable.filter((row) => Boolean(row.needs_credit)).length;
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

  for (const row of countable) {
    const jobName =
      (isClientJobLabel(row.job_name) ? row.job_name : null) ||
      (isClientJobLabel(jobNameFromCustRef(row.cust_ref))
        ? jobNameFromCustRef(row.cust_ref)
        : null);
    if (jobName) {
      const jobKey = jobName.toLowerCase();
      const job = byJob.get(jobKey) ?? {
        job_name: jobName,
        cust_ref: row.cust_ref || jobName,
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
    }

    const palletId = (row.container_id ?? "").trim();
    if (palletId && palletId !== "no-pallet") {
      const pallet = byContainer.get(palletId) ?? {
        container_id: palletId,
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
      byContainer.set(palletId, pallet);
    }
  }

  const pallets = [...byContainer.values()];
  const palletsScanned = pallets.filter((p) => p.total_received_qty > 0).length;
  const palletsTotal = pallets.length;
  const palletPct = palletsTotal > 0 ? palletsScanned / palletsTotal : 0;

  const soNumbers = [
    ...new Set(
      items
        .map((row) => (row.so_number ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  ];

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
    so_numbers: soNumbers,
    by_job: [...byJob.values()].sort((a, b) => a.job_name.localeCompare(b.job_name)),
    by_container: pallets,
    pallets_total: palletsTotal,
    pallets_scanned: palletsScanned,
    waiting_for_pallets: palletsTotal > 0 && palletPct < PALLET_MISSING_THRESHOLD,
  };
}

export function matchItem(
  items: ShipmentItemRow[],
  scanned: string,
  palletId?: string | null,
): { item: ShipmentItemRow | null; result: "matched" | "already_received" | "unknown" | "pallet_mismatch" } {
  const raw = scanned.trim();
  if (!raw) return { item: null, result: "unknown" };

  const matches = items.filter((row) =>
    [row.item_number, row.vendor_sku, row.container_id].some((n) => codesMatch(raw, n)),
  );
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
  const unique = [
    ...new Set(codes.flatMap((code) => codeKeys(code)).filter((code) => code.length >= 4)),
  ];
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

function isCutSizeCode(sku: string): boolean {
  return /\d/.test(sku) && /\sx\s/i.test(sku) && /\d\/\d/.test(sku);
}

async function ensurePartForSlipItem(item: ParsedSlipItem): Promise<string | null> {
  const sku = item.item_number.trim();
  if (!sku || isCutSizeCode(sku)) return null;
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
      vendor: /^\d{3}\.\d{2}\.\d{3}$/.test(sku) ? "Hafele" : "Stow",
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

export async function findJobId(item: ParsedSlipItem): Promise<string | null> {
  const hint = clientHintFromSlip(item.cust_ref, item.job_name);
  if (!hint) return null;
  const supabase = getSupabaseAdmin();
  const identityKey = clientIdentityKey(hint);

  // Prefer identity_key match (canonical clients after merge).
  let clientIds: string[] = [];
  const { data: byKey } = await supabase
    .from("ic_clients")
    .select("id, name, identity_key, merged_into_client_id")
    .is("deleted_at", null)
    .eq("identity_key", identityKey)
    .limit(40);

  if (byKey && byKey.length > 0) {
    clientIds = byKey.map((row) => row.merged_into_client_id || row.id);
  } else {
    const { data: clients } = await supabase
      .from("ic_clients")
      .select("id, name, merged_into_client_id")
      .is("deleted_at", null)
      .ilike("name", `%${hint}%`)
      .limit(40);
    const needle = hint.toLowerCase();
    clientIds = (clients ?? [])
      .filter((row) => {
        const tokens = String(row.name ?? "")
          .toLowerCase()
          .split(/[\s,/]+/)
          .filter(Boolean);
        return (
          tokens.includes(needle) ||
          String(row.name ?? "").toLowerCase() === needle ||
          clientIdentityKey(String(row.name ?? "")) === identityKey
        );
      })
      .map((row) => row.merged_into_client_id || row.id);
  }

  clientIds = [...new Set(clientIds)];
  if (clientIds.length === 0) return null;

  const { data: jobs } = await supabase
    .from("ic_jobs")
    .select("id, stage, install_date, sold_date, created_at, duplicate_of_job_id")
    .in("client_id", clientIds)
    .is("deleted_at", null)
    .is("duplicate_of_job_id", null)
    .order("install_date", { ascending: false, nullsFirst: false })
    .limit(40);

  const list = jobs ?? [];
  const preferred = list.find((job) =>
    ["ordered", "job_check", "deposit_received", "install_scheduled", "install_in_progress"].includes(
      String(job.stage),
    ),
  );
  if (preferred?.id) return preferred.id;
  const primary = pickPrimaryJob(list);
  return primary?.id ?? null;
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
  const jobId = item.job_id || (await findJobId(item));
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
    blocked: false,
    message: `${name} still has ${pieces} piece${pieces === 1 ? "" : "s"} not received. Date stays tentative until receiving is done.`,
  };
}

export async function receivingRollupByJobIds(
  jobIds: string[],
): Promise<Map<string, { open_qty: number; received_qty: number; total_qty: number }>> {
  const out = new Map<string, { open_qty: number; received_qty: number; total_qty: number }>();
  if (jobIds.length === 0) return out;
  const supabase = getSupabaseAdmin();
  for (let i = 0; i < jobIds.length; i += 200) {
    const slice = jobIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("ic_shipment_items")
      .select("job_id, qty, received_qty")
      .in("job_id", slice);
    if (error) {
      if (missingReceivingTable(error.message)) return out;
      return out;
    }
    for (const row of data ?? []) {
      if (!row.job_id) continue;
      const current = out.get(row.job_id) ?? { open_qty: 0, received_qty: 0, total_qty: 0 };
      const qty = Number(row.qty) || 0;
      const received = Number(row.received_qty) || 0;
      current.total_qty += qty;
      current.received_qty += received;
      current.open_qty += Math.max(0, qty - received);
      out.set(row.job_id, current);
    }
  }
  return out;
}

export async function reverseReceiveScan(input: {
  partId: string | null;
  qty: number;
  jobId: string | null;
  actorId: string | null;
  note?: string | null;
}): Promise<void> {
  if (!input.partId || input.qty <= 0) return;
  await applyStockMovement({
    partId: input.partId,
    movementType: "adjust",
    qty: -input.qty,
    jobId: input.jobId,
    note: input.note ?? "Undo receive scan",
    actorId: input.actorId,
  });
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

export type ReceivingPdfKind = "studio_order" | "packing_list" | "unknown";

/** Frank drops both PDFs in Receiving. Detect Studio vs Stow packing list from the printed text. */
export async function classifyReceivingPdf(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ReceivingPdfKind> {
  const isPdf = input.mimeType.includes("pdf") || /\.pdf$/i.test(input.filename);
  if (!isPdf) return "unknown";
  try {
    const { text } = await extractPdfText(input.bytes);
    if (looksLikeProductSummary(text) && !looksLikePackingSlip(text)) return "studio_order";
    if (looksLikePackingSlip(text)) return "packing_list";
  } catch {
    // Photos / unreadable PDFs fall through to the packing-slip reader.
  }
  return "unknown";
}

const PARSE_SYSTEM = `You extract line items from Inspired Closets packing slips and vendor order receipts (Stow, Richelieu, Häfele, Hardware Resources, Würth, Trulite, and any other 3rd party).
Return ONLY JSON: {"notice": string|null, "ship_date": "YYYY-MM-DD", "vendor": "stow"|"richelieu"|"hafele"|"wurth"|"trulite"|"other", "total_pages": number, "order_number": string|null, "po_number": string|null, "order_total": number|null, "weight_lbs": number|null, "items": [...]}.
notice is a SHORT identity only: shipment notice number, order number, or PO (e.g. 80133562, D804518, BLACKHAWK / POHLMAN, STOCK). Never a sentence, disclaimer, tariff paragraph, or filename.
ship_date is REQUIRED. Read the printed ship / delivery / requested ship / Lieferdatum / Date d'expédition / invoice date. Accept any format (MM/DD/YY, DD.MM.YYYY, 18 Sep 2026, YYYY-MM-DD) and return YYYY-MM-DD. Never leave ship_date empty if any date is visible.
order_total is dollars if printed. weight_lbs if printed. vendor "wurth" when the document or filename says Würth. vendor "other" for Hardware Resources and any unknown 3rd party. STOCK is Frank's shop label, not a reason to drop the vendor or the lines.
Each item: item_number (SKU / barcode), so_number, cust_ref (client name as printed, often NAME_MMDDYY; STOCK when Frank labeled it stock), job_name (client last name — not the vendor name), project_number, description, qty (integer), container_id (pallet ID only when printed), source_page, vendor_sku (manufacturer # if different from item_number).
Skip shipping / handling charge rows (item SH, Estimated Shipping Charges, freight fees).
Do not invent SKUs. Qty defaults to 1 if missing. cust_ref is the client label Frank wrote on the order.`;

function vendorFromDocument(filename: string, text: string, parsed: string | undefined): string {
  if (/w[uü]rth/i.test(`${filename}\n${text}`)) return "wurth";
  const value = (parsed || "").toLowerCase();
  if (value === "richelieu" || value === "hafele" || value === "trulite" || value === "wurth" || value === "stow" || value === "other") {
    return value;
  }
  return "stow";
}

function requiredShipDate(input: {
  parsed?: string | null;
  text?: string | null;
  filename?: string | null;
  uploadedAt?: string | null;
}): string {
  return (
    resolveShipDate(input) ||
    new Date().toISOString().slice(0, 10)
  );
}

async function readShipDateFromModel(
  bytes: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  const apiKey =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const model =
      process.env.INSPIRED_CLOSETS_ANTHROPIC_MODEL?.trim() ||
      process.env.ANTHROPIC_MODEL?.trim() ||
      "claude-sonnet-5";
    const isPdf = mimeType.includes("pdf") || /\.pdf$/i.test(filename);
    const message = await client.messages.create({
      model,
      max_tokens: 200,
      system:
        "Read the packing slip and return ONLY JSON {\"ship_date\":\"YYYY-MM-DD\"}. Use ship, delivery, requested ship, Lieferdatum, Date d'expédition, or invoice date. Any printed format is fine. Never invent a date that is not on the document.",
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: bytes.toString("base64"),
                  },
                }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: (mimeType.startsWith("image/")
                      ? mimeType
                      : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                    data: bytes.toString("base64"),
                  },
                },
            { type: "text", text: `What is the ship date on ${filename}? JSON only.` },
          ],
        },
      ],
    });
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const parsed = JSON.parse(text) as { ship_date?: string | null };
    return normalizeShipDate(parsed.ship_date);
  } catch {
    return null;
  }
}

async function downloadShipmentPdf(ship: {
  storage_path?: string | null;
  public_url?: string | null;
}): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  if (ship.storage_path) {
    const { data, error } = await supabase.storage.from("ic-field-media").download(ship.storage_path);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }
  if (ship.public_url) {
    try {
      const response = await fetch(ship.public_url);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

/** Fill a blank ship_date from the stored PDF, filename, or upload day. Always returns a date. */
export async function ensureShipmentHasShipDate(ship: {
  id: string;
  ship_date?: string | null;
  source_filename?: string | null;
  storage_path?: string | null;
  public_url?: string | null;
  created_at?: string | null;
  parse_quality?: unknown;
}): Promise<string> {
  const already = inferredShipmentShipDate(ship);
  if (ship.ship_date && already) return already;

  let fromPdf: string | null = null;
  const bytes = await downloadShipmentPdf(ship);
  if (bytes) {
    try {
      const extracted = await extractPdfText(bytes);
      fromPdf = resolveShipDate({
        text: extracted.text,
        filename: ship.source_filename,
      });
    } catch {
      fromPdf = null;
    }
    if (!fromPdf) {
      fromPdf = await readShipDateFromModel(
        bytes,
        ship.source_filename || "slip.pdf",
        "application/pdf",
      );
    }
  }

  const iso =
    fromPdf ||
    already ||
    (ship.created_at ? ship.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10));

  if (iso !== ship.ship_date) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from("ic_shipments")
      .update({ ship_date: iso, updated_at: new Date().toISOString() })
      .eq("id", ship.id);
  }
  return iso;
}

function weightLbsFromText(text: string): number | null {
  const match = text.match(/app(?:roximate|oximate)?\s+weight\s*([\d,.]+)/i);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sanitizeParsedNotice(
  raw: string | null | undefined,
  input: { filename: string; so?: string | null; po?: string | null; fileHint?: string | null },
): string | null {
  const notice = raw ? String(raw).replace(/\s+/g, " ").trim() : "";
  if (isUsableNotice(notice) && !/^(stock|wurth|hafele|häfele|richelieu|stow)$/i.test(notice)) {
    return notice;
  }
  if (input.so) return String(input.so).trim();
  if (input.po && isUsableNotice(input.po)) return input.po.trim();
  if (input.fileHint && isClientJobLabel(input.fileHint)) return input.fileHint;
  return null;
}

function stampSlipItems(
  items: ParsedSlipItem[],
  filename: string,
  jobId: string | null,
): ParsedSlipItem[] {
  const hint = clientHintFromFilename(filename);
  const usableHint = isClientJobLabel(hint) ? hint : null;
  return items.map((item) => {
    const jobName = isClientJobLabel(item.job_name) ? item.job_name : usableHint;
    const custRef = isClientJobLabel(item.cust_ref) || isClientJobLabel(jobNameFromCustRef(item.cust_ref))
      ? item.cust_ref
      : usableHint;
    const hasOwnJob = Boolean(custRef || jobName);
    return {
      ...item,
      cust_ref: custRef || null,
      job_name: jobName || null,
      job_id: item.job_id || (hasOwnJob ? null : jobId) || null,
    };
  });
}

function slipFromTrulite(
  filename: string,
  text: string,
  pages: number,
): {
  notice: string | null;
  ship_date: string | null;
  vendor: string;
  total_pages: number;
  items: ParsedSlipItem[];
  parse_quality: Record<string, unknown>;
} | null {
  const cuts = parseTruliteCuts(text);
  if (cuts.length === 0) return null;
  const po = trulitePurchaseOrder(text);
  const hint = po || clientHintFromFilename(filename) || null;
  return {
    notice: hint,
    ship_date: requiredShipDate({
      parsed: truliteOrderDate(text),
      text,
      filename,
    }),
    vendor: "trulite",
    total_pages: pages,
    items: cuts.map((cut, index) => ({
      item_number: cut.item_number,
      cust_ref: hint,
      job_name: hint,
      description: cut.description,
      qty: cut.qty,
      source_page: index + 1,
      vendor_sku: null,
    })),
    parse_quality: {
      source: "trulite",
      total_items: cuts.length,
      filename,
      po_number: po,
      client_hint: hint,
      order_number: null,
      order_total: null,
      weight_lbs: null,
    },
  };
}

function slipFromStudioSummary(
  filename: string,
  text: string,
  pages: number,
): {
  notice: string | null;
  ship_date: string | null;
  vendor: string;
  total_pages: number;
  items: ParsedSlipItem[];
  parse_quality: Record<string, unknown>;
} | null {
  if (!looksLikeProductSummary(text)) return null;
  const summary = parseStowProductSummaryText(text, filename);
  if (!summary || summary.lines.length === 0) return null;
  const hint = clientHintFromFilename(filename) || jobNameFromCustRef(summary.order_name);
  return {
    notice: summary.order_name || summary.so_number,
    ship_date: requiredShipDate({
      parsed: summary.ship_date,
      text,
      filename,
    }),
    vendor: "stow",
    total_pages: pages,
    items: summary.lines.map((line) => ({
      item_number: line.item_code,
      so_number: summary.so_number,
      cust_ref: hint || summary.order_name,
      job_name: hint || jobNameFromCustRef(summary.order_name),
      description:
        [line.description, line.dimensions, line.product_type, line.finish].filter(Boolean).join(" ") ||
        null,
      qty: line.qty,
      source_page: line.line_no,
      vendor_sku: /^\d{6,}$/.test(line.item_code) ? line.item_code : null,
    })),
    parse_quality: {
      source: "order-lines",
      total_items: summary.lines.length,
      filename,
      so_number: summary.so_number,
      order_name: summary.order_name,
      order_number: summary.so_number,
      order_total: summary.total_cents ? summary.total_cents / 100 : null,
      weight_lbs: weightLbsFromText(text),
    },
  };
}

export async function reparseShipment(id: string): Promise<{ added: number; kept: number }> {
  const supabase = getSupabaseAdmin();
  const { data: ship, error } = await supabase
    .from("ic_shipments")
    .select("source_filename, storage_path, public_url, parse_quality, notice, vendor, ship_date")
    .eq("id", id)
    .maybeSingle();
  if (error || !ship) throw new Error(error?.message ?? "Shipment not found.");
  let bytes: Buffer | null = null;
  if (ship.storage_path) {
    const downloaded = await supabase.storage.from("ic-field-media").download(ship.storage_path);
    if (!downloaded.error && downloaded.data) bytes = Buffer.from(await downloaded.data.arrayBuffer());
  }
  if (!bytes && ship.public_url) {
    const response = await fetch(ship.public_url);
    if (response.ok) bytes = Buffer.from(await response.arrayBuffer());
  }
  if (!bytes) throw new Error("No PDF on this shipment.");
  const parsed = await parsePackingSlip({
    filename: ship.source_filename || "slip.pdf",
    mimeType: "application/pdf",
    bytes,
  });
  const existing = await loadShipmentItemRows(id);
  let added = 0;
  let kept = 0;
  const now = new Date().toISOString();
  for (const item of parsed.items) {
    const match = existing.find((row) => sameSlipLine(row, item));
    if (!match) {
      const links = await linkItemToOs(item, { createPart: false });
      const { error: insertError } = await supabase.from("ic_shipment_items").insert({
        shipment_id: id,
        item_number: item.item_number,
        so_number: item.so_number ?? null,
        cust_ref: item.cust_ref ?? null,
        job_name: item.job_name ?? null,
        description: item.description ?? null,
        qty: item.qty,
        received_qty: 0,
        damaged_qty: 0,
        container_id: item.container_id ?? null,
        source_page: item.source_page ?? null,
        status: "expected",
        vendor_sku: item.vendor_sku ?? null,
        job_id: item.job_id || links.job_id || null,
      });
      if (!insertError) added += 1;
      continue;
    }
    kept += 1;
    if ((match.received_qty ?? 0) > 0) continue;
    await supabase
      .from("ic_shipment_items")
      .update({
        qty: item.qty,
        vendor_sku: item.vendor_sku ?? match.vendor_sku,
        description: item.description ?? match.description,
        container_id: item.container_id ?? match.container_id,
        so_number: item.so_number ?? match.so_number,
        cust_ref: item.cust_ref ?? match.cust_ref,
        job_name: item.job_name ?? match.job_name,
        source_page: item.source_page ?? match.source_page,
        updated_at: now,
      })
      .eq("id", match.id);
  }
  if (parsed.items.length > 0) {
    const prior =
      ship.parse_quality && typeof ship.parse_quality === "object" && !Array.isArray(ship.parse_quality)
        ? (ship.parse_quality as Record<string, unknown>)
        : {};
    await supabase
      .from("ic_shipments")
      .update({
        notice: parsed.notice || ship.notice,
        vendor: parsed.vendor || ship.vendor,
        ship_date: parsed.ship_date || ship.ship_date,
        parse_error: null,
        parse_quality: { ...prior, ...parsed.parse_quality },
        total_pages: parsed.total_pages,
        updated_at: now,
      })
      .eq("id", id);
  }
  return { added, kept };
}

export async function parsePackingSlip(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  jobId?: string | null;
}): Promise<{
  notice: string | null;
  ship_date: string | null;
  vendor: string;
  total_pages: number;
  items: ParsedSlipItem[];
  parse_quality: Record<string, unknown>;
}> {
  const fileHint = clientHintFromFilename(input.filename);
  let pages = 0;
  let extractedText = "";
  try {
    const extracted = await extractPdfText(input.bytes);
    extractedText = extracted.text;
    pages = extracted.pages;
  } catch {
    // Photos / locked PDFs go to the model.
  }

  const fromStudio = extractedText ? slipFromStudioSummary(input.filename, extractedText, pages) : null;
  if (fromStudio) {
    return {
      ...fromStudio,
      items: stampSlipItems(fromStudio.items, input.filename, input.jobId ?? null),
    };
  }

  const fromTrulite =
    extractedText && looksLikeTruliteSlip(extractedText, input.filename)
      ? slipFromTrulite(input.filename, extractedText, pages)
      : null;
  if (fromTrulite) {
    return {
      ...fromTrulite,
      items: stampSlipItems(fromTrulite.items, input.filename, input.jobId ?? null),
    };
  }

  const empty = {
    notice: fileHint || null,
    ship_date: requiredShipDate({ text: extractedText, filename: input.filename }),
    vendor: "stow",
    total_pages: pages,
    items: [] as ParsedSlipItem[],
    parse_quality: {
      total_items: 0,
      filename: input.filename,
      client_hint: fileHint || null,
    } as Record<string, unknown>,
  };

  const apiKey =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return empty;

  try {
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
        text: `Extract every line from this packing slip (${input.filename}). Client on the filename is ${fileHint || "unknown"}. JSON only.`,
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
      order_number?: string | null;
      po_number?: string | null;
      order_total?: number | null;
      weight_lbs?: number | null;
      items?: ParsedSlipItem[];
    };
    const items = stampSlipItems(
      (parsed.items ?? [])
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
        .filter((row) => row.item_number && !isShippingChargeLine(row)),
      input.filename,
      input.jobId ?? null,
    );
    let shipDate = resolveShipDate({
      parsed: parsed.ship_date,
      text: extractedText,
      filename: input.filename,
    });
    if (!shipDate) {
      shipDate = await readShipDateFromModel(input.bytes, input.filename, input.mimeType);
    }
    const soNumbers = [
      ...new Set(items.map((item) => (item.so_number ?? "").trim()).filter(Boolean)),
    ];
    const notice = sanitizeParsedNotice(parsed.notice, {
      filename: input.filename,
      so: parsed.order_number || soNumbers[0] || null,
      po: parsed.po_number || null,
      fileHint,
    });
    return {
      notice,
      ship_date: shipDate || requiredShipDate({ filename: input.filename }),
      vendor: vendorFromDocument(input.filename, extractedText, parsed.vendor),
      total_pages: Number(parsed.total_pages) || pages,
      items,
      parse_quality: {
        total_items: items.length,
        missing_cust_ref: items.filter((item) => !item.cust_ref).length,
        missing_description: items.filter((item) => !item.description).length,
        client_hint: fileHint || null,
        order_number: parsed.order_number ? String(parsed.order_number) : soNumbers[0] || null,
        po_number: parsed.po_number ? String(parsed.po_number) : null,
        order_total:
          typeof parsed.order_total === "number" && Number.isFinite(parsed.order_total)
            ? parsed.order_total
            : null,
        weight_lbs:
          typeof parsed.weight_lbs === "number" && Number.isFinite(parsed.weight_lbs)
            ? parsed.weight_lbs
            : null,
        ship_date_source: parsed.ship_date
          ? "slip"
          : shipDateFromSlipText(extractedText)
            ? "slip-text"
            : shipDateFromFilename(input.filename)
              ? "filename"
              : "upload",
      },
    };
  } catch (error) {
    return {
      ...empty,
      parse_quality: {
        ...empty.parse_quality,
        error: error instanceof Error ? error.message : "parse_failed",
      },
    };
  }
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
      job_id: typeof row.job_id === "string" && row.job_id ? row.job_id : null,
      project_number: row.project_number ? String(row.project_number) : null,
      description: row.description ? String(row.description) : null,
      qty: Math.max(1, Math.round(Number(row.qty) || 1)),
      container_id: row.container_id ? String(row.container_id) : null,
      source_page: row.source_page ? Number(row.source_page) : null,
      vendor_sku: row.vendor_sku ? String(row.vendor_sku) : null,
    }))
    .filter((row) => row.item_number);
}
