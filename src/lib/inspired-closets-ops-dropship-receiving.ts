/**
 * Studio orders stay on the job. The unnumbered 40000 block is copied onto
 * Receiving so Bryant can scan it. A packing-list line for the same SKU wins.
 */
import { getSupabaseAdmin } from "@/db/client";
import {
  codesMatch,
  findJobFromFilename,
  findJobId,
} from "@/lib/inspired-closets-ops-receiving";
import {
  hafeleArticle,
  isBrowseOnlyLine,
  isDropshipCatalogCode,
} from "@/lib/inspired-closets-ops-scan-codes";
import {
  persistJobProductSummary,
  parseProductSummary,
  type ParsedProductSummary,
} from "@/lib/inspired-closets-ops-product-summary";
import {
  existingRowFlags,
  type ExistingRowFlag,
} from "@/lib/inspired-closets-ops-shipment-display";

const STUDIO_SOURCE = "studio_order";

export function studioNotice(orderName: string | null, jobId: string | null): string {
  const slug =
    (orderName ?? "").trim().replace(/\s+/g, "-") ||
    (jobId ? `JOB-${jobId.slice(0, 8)}` : "UNMATCHED");
  return `STUDIO-${slug}`;
}

export type JobScanShipment = {
  id: string;
  notice: string | null;
  vendor: string;
  status: string;
  parse_quality: Record<string, unknown> | null;
  storage_path: string | null;
  public_url: string | null;
  source_filename: string | null;
  updated_at: string;
};

function asQuality(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function noticeIsStudio(notice: string | null | undefined): boolean {
  return Boolean(notice && /^(STUDIO|DROP)-/i.test(notice));
}

export function isStudioReceivingShipment(input: {
  notice?: string | null;
  parse_quality?: unknown;
}): boolean {
  const quality = asQuality(input.parse_quality);
  const source = String(quality.source ?? "");
  if (source === "studio_order" || source === "studio-order-table") return true;
  return noticeIsStudio(input.notice);
}

export function receivingLinesMatch(
  a: { item_number: string; vendor_sku?: string | null },
  b: { item_number: string; vendor_sku?: string | null },
): boolean {
  if (codesMatch(a.item_number, b.item_number)) return true;
  if (a.vendor_sku && codesMatch(a.vendor_sku, b.item_number)) return true;
  if (b.vendor_sku && codesMatch(a.item_number, b.vendor_sku)) return true;
  if (a.vendor_sku && b.vendor_sku && codesMatch(a.vendor_sku, b.vendor_sku)) return true;
  return false;
}

export async function findJobScanShipment(input: {
  jobId?: string | null;
  orderName?: string | null;
}): Promise<JobScanShipment | null> {
  const listed = await listJobScanShipments(input);
  return listed[0] ?? null;
}

async function listJobScanShipments(input: {
  jobId?: string | null;
  orderName?: string | null;
}): Promise<JobScanShipment[]> {
  const supabase = getSupabaseAdmin();
  const ids = new Set<string>();
  const jobId = input.jobId ?? null;

  if (jobId) {
    const { data: itemRows } = await supabase
      .from("ic_shipment_items")
      .select("shipment_id")
      .eq("job_id", jobId);
    for (const row of itemRows ?? []) {
      if (row.shipment_id) ids.add(String(row.shipment_id));
    }
    const { data: byQuality } = await supabase
      .from("ic_shipments")
      .select("id")
      .is("deleted_at", null)
      .eq("parse_quality->>job_id", jobId);
    for (const row of byQuality ?? []) ids.add(String(row.id));
  }

  const notices: string[] = [];
  if (input.orderName) {
    notices.push(studioNotice(input.orderName, jobId));
    const slug = input.orderName.trim().replace(/\s+/g, "-");
    if (slug) notices.push(`DROP-${slug}`);
  }
  if (notices.length > 0) {
    const { data } = await supabase
      .from("ic_shipments")
      .select("id")
      .in("notice", notices)
      .is("deleted_at", null);
    for (const row of data ?? []) ids.add(String(row.id));
  }

  if (ids.size === 0) return [];

  const { data: ships } = await supabase
    .from("ic_shipments")
    .select(
      "id, notice, vendor, status, parse_quality, storage_path, public_url, source_filename, updated_at",
    )
    .in("id", [...ids])
    .is("deleted_at", null);
  const shipIds = (ships ?? []).map((row) => String(row.id));
  const jobIdsByShip = new Map<string, Set<string>>();
  if (shipIds.length > 0) {
    const { data: items } = await supabase
      .from("ic_shipment_items")
      .select("shipment_id, job_id")
      .in("shipment_id", shipIds);
    for (const row of items ?? []) {
      const set = jobIdsByShip.get(String(row.shipment_id)) ?? new Set<string>();
      if (row.job_id) set.add(String(row.job_id));
      jobIdsByShip.set(String(row.shipment_id), set);
    }
  }

  return (ships ?? [])
    .filter((ship) => !isStudioReceivingShipment(ship))
    .map((ship) => {
      const quality = asQuality(ship.parse_quality);
      const jobIds = jobIdsByShip.get(String(ship.id)) ?? new Set<string>();
      let score = 0;
      if (quality.source === STUDIO_SOURCE && (!jobId || quality.job_id === jobId)) score = 100;
      else if (noticeIsStudio(ship.notice as string | null)) score = 90;
      else if (jobId && jobIds.size === 1 && jobIds.has(jobId)) score = 60;
      else if (jobId && jobIds.size === 0 && quality.job_id === jobId) score = 70;
      return {
        id: String(ship.id),
        notice: (ship.notice as string | null) ?? null,
        vendor: String(ship.vendor ?? "stow"),
        status: String(ship.status ?? "ready"),
        parse_quality: quality,
        storage_path: (ship.storage_path as string | null) ?? null,
        public_url: (ship.public_url as string | null) ?? null,
        source_filename: (ship.source_filename as string | null) ?? null,
        updated_at: String(ship.updated_at ?? ""),
        score,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.updated_at.localeCompare(a.updated_at))
    .map((row) => ({
      id: row.id,
      notice: row.notice,
      vendor: row.vendor,
      status: row.status,
      parse_quality: row.parse_quality,
      storage_path: row.storage_path,
      public_url: row.public_url,
      source_filename: row.source_filename,
      updated_at: row.updated_at,
    }));
}

export async function absorbJobItemsOntoShipment(
  jobId: string,
  destShipmentId: string,
): Promise<{ moved: number; merged: number }> {
  const supabase = getSupabaseAdmin();
  const { data: destRows } = await supabase
    .from("ic_shipment_items")
    .select(
      "id, item_number, vendor_sku, received_qty, damaged_qty, qty, container_id, so_number, status, note, needs_credit",
    )
    .eq("shipment_id", destShipmentId);
  const destLines = [...(destRows ?? [])];

  const { data: sourceRows } = await supabase
    .from("ic_shipment_items")
    .select(
      "id, shipment_id, item_number, vendor_sku, qty, received_qty, damaged_qty, container_id, so_number, status, note, needs_credit",
    )
    .eq("job_id", jobId)
    .neq("shipment_id", destShipmentId);

  let moved = 0;
  let merged = 0;
  const now = new Date().toISOString();
  const sourceShipments = new Set<string>();

  for (const source of sourceRows ?? []) {
    sourceShipments.add(String(source.shipment_id));
    const match = destLines.find((row) =>
      receivingLinesMatch(
        { item_number: String(source.item_number), vendor_sku: source.vendor_sku as string | null },
        { item_number: String(row.item_number), vendor_sku: row.vendor_sku as string | null },
      ),
    );
    if (match) {
      const destReceived = Number(match.received_qty) || 0;
      const sourceReceived = Number(source.received_qty) || 0;
      await supabase
        .from("ic_shipment_items")
        .update({
          container_id: match.container_id || source.container_id || null,
          so_number: match.so_number || source.so_number || null,
          received_qty: destReceived > 0 ? destReceived : sourceReceived,
          damaged_qty: Math.max(Number(match.damaged_qty) || 0, Number(source.damaged_qty) || 0),
          status: destReceived > 0 ? match.status : source.status || match.status,
          needs_credit: Boolean(match.needs_credit) || Boolean(source.needs_credit),
          note: match.note || source.note || null,
          updated_at: now,
        })
        .eq("id", match.id);
      await supabase
        .from("ic_shipment_scans")
        .update({ shipment_id: destShipmentId, item_id: match.id })
        .eq("item_id", source.id);
      await supabase
        .from("ic_shipment_claims")
        .update({ shipment_id: destShipmentId, item_id: match.id })
        .eq("item_id", source.id);
      await supabase.from("ic_shipment_items").delete().eq("id", source.id);
      merged += 1;
      continue;
    }

    await supabase
      .from("ic_shipment_scans")
      .update({ shipment_id: destShipmentId })
      .eq("item_id", source.id);
    await supabase
      .from("ic_shipment_claims")
      .update({ shipment_id: destShipmentId })
      .eq("item_id", source.id);
    await supabase
      .from("ic_shipment_items")
      .update({ shipment_id: destShipmentId, updated_at: now })
      .eq("id", source.id);
    destLines.push({
      id: source.id,
      item_number: source.item_number,
      vendor_sku: source.vendor_sku,
      received_qty: source.received_qty,
      damaged_qty: source.damaged_qty,
      qty: source.qty,
      container_id: source.container_id,
      so_number: source.so_number,
      status: source.status,
      note: source.note,
      needs_credit: source.needs_credit,
    });
    moved += 1;
  }

  for (const shipmentId of sourceShipments) {
    await pruneEmptyShipment(shipmentId);
  }
  return { moved, merged };
}

export async function pruneEmptyShipment(shipmentId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("ic_shipment_items")
    .select("id", { count: "exact", head: true })
    .eq("shipment_id", shipmentId);
  if ((count ?? 0) > 0) return false;
  await supabase
    .from("ic_shipments")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", shipmentId)
    .is("deleted_at", null);
  return true;
}

export async function appendPackingListMeta(
  shipmentIds: string[],
  packing: {
    notice: string | null;
    ship_date?: string | null;
    source_filename: string | null;
    storage_path: string | null;
    public_url: string | null;
  },
): Promise<void> {
  if (shipmentIds.length === 0) return;
  const supabase = getSupabaseAdmin();
  const { data: ships } = await supabase
    .from("ic_shipments")
    .select("id, vendor, ship_date, parse_quality")
    .in("id", shipmentIds)
    .is("deleted_at", null);
  const now = new Date().toISOString();
  const key = packing.storage_path || packing.public_url || packing.source_filename;
  for (const ship of ships ?? []) {
    const quality = asQuality(ship.parse_quality);
    const lists = Array.isArray(quality.packing_lists)
      ? [...(quality.packing_lists as Array<Record<string, unknown>>)]
      : [];
    const already = key
      ? lists.some((row) => String(row.storage_path || row.public_url || row.source_filename) === key)
      : false;
    if (!already) lists.push(packing);
    quality.packing_lists = lists;
    const vendor = String(ship.vendor ?? "stow");
    const patch: Record<string, unknown> = {
      parse_quality: quality,
      vendor: vendor === "hafele" || vendor === "richelieu" ? "other" : vendor,
      updated_at: now,
    };
    if (!ship.ship_date && packing.ship_date) {
      patch.ship_date = packing.ship_date;
    }
    await supabase.from("ic_shipments").update(patch).eq("id", ship.id);
  }
}

export async function findJobForStudioOrder(input: {
  orderName: string | null;
  soNumber: string | null;
  filename?: string | null;
}): Promise<string | null> {
  if (input.filename) {
    const fromFile = await findJobFromFilename(input.filename);
    if (fromFile) return fromFile;
  }
  const supabase = getSupabaseAdmin();
  if (input.soNumber) {
    const { data } = await supabase
      .from("ic_stow_sales_orders")
      .select("job_id")
      .eq("so_number", input.soNumber)
      .not("job_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.job_id) return data.job_id as string;
  }
  if (input.orderName) {
    const { data } = await supabase
      .from("ic_stow_sales_orders")
      .select("job_id")
      .ilike("order_name", input.orderName)
      .not("job_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.job_id) return data.job_id as string;
    const { data: byRef } = await supabase
      .from("ic_jobs")
      .select("id")
      .eq("studio_ref", input.orderName)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (byRef?.id) return byRef.id as string;
  }
  return findJobId({
    item_number: "",
    qty: 1,
    cust_ref: input.orderName,
    job_name: input.orderName?.split(/[-_]/)[0] ?? null,
  });
}

export async function ingestStudioOrderFromReceiving(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  actorId: string | null;
}): Promise<{
  kind: "studio_order";
  order_name: string | null;
  so_number: string | null;
  job_id: string | null;
  summary_id: string | null;
  imported: number;
  message: string;
}> {
  const supabase = getSupabaseAdmin();
  const path = `summaries/uploads/${Date.now()}-${input.filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, input.bytes, {
    contentType: input.mimeType || "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`Could not store the project summary: ${uploadError.message}`);
  }
  const publicUrl = supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl;

  let parsed: ParsedProductSummary;
  try {
    parsed = await parseProductSummary({
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      allowPartial: true,
    });
  } catch {
    parsed = {
      order_name: input.filename.replace(/\.[^.]+$/, "") || null,
      order_id: null,
      so_number: null,
      purchased_on: null,
      ship_date: null,
      item_count: 0,
      total_cents: 0,
      lines: [],
      parse_quality: { source: STUDIO_SOURCE, filename: input.filename, error: "parse_failed" },
    };
  }
  if (!parsed.order_name) {
    parsed = {
      ...parsed,
      order_name: input.filename.replace(/\.[^.]+$/, "") || null,
    };
  }
  const jobId = await findJobForStudioOrder({
    orderName: parsed.order_name,
    soNumber: parsed.so_number,
    filename: input.filename,
  });

  const saved = await persistJobProductSummary({
    jobId,
    filename: input.filename,
    storagePath: path,
    publicUrl,
    parsed,
    actorId: input.actorId,
  });
  const copied = await publishDropshipLines({
    jobId,
    orderName: parsed.order_name,
    soNumber: parsed.so_number,
    lines: parsed.lines,
  });
  const lineCount = saved.lines.length;
  const orderLabel = parsed.order_name ?? parsed.so_number ?? input.filename;
  const matchNote = jobId
    ? `Attached to the job from ${input.filename}. ${copied} vendor lines are on Receiving.`
    : `No job matched ${input.filename} yet. It is on the Project summaries tab.`;

  return {
    kind: "studio_order",
    order_name: parsed.order_name,
    so_number: parsed.so_number,
    job_id: jobId,
    summary_id: String(saved.summary.id),
    imported: lineCount,
    message: `Project summary ${orderLabel}: ${lineCount} lines read. ${matchNote}`,
  };
}

export async function publishDropshipLines(input: {
  jobId: string | null;
  orderName: string | null;
  soNumber: string | null;
  lines: Array<{
    item_code: string;
    description: string;
    product_type: string;
    finish: string | null;
    qty: number;
  }>;
}): Promise<number> {
  if (!input.jobId) return 0;
  const wanted = input.lines.filter((line) => {
    if (!isDropshipCatalogCode(line.item_code)) return false;
    return !isBrowseOnlyLine({
      item_number: line.item_code,
      description: `${line.description} ${line.product_type} ${line.finish ?? ""}`,
    });
  });
  if (wanted.length === 0) return 0;

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("ic_shipment_items")
    .select("item_number, vendor_sku")
    .eq("job_id", input.jobId);

  const ships = await listJobScanShipments({
    jobId: input.jobId,
    orderName: input.orderName,
  });
  let shipmentId = ships[0]?.id ?? null;
  if (!shipmentId) {
    const slug = (input.orderName ?? "order").trim().replace(/\s+/g, "-").slice(0, 40) || "order";
    const { data: created, error } = await supabase
      .from("ic_shipments")
      .insert({
        notice: `3P-${slug}`,
        vendor: "other",
        status: "ready",
        source_filename: "studio-dropship",
        total_pages: 0,
        parse_quality: { source: "dropship", job_id: input.jobId },
      })
      .select("id")
      .single();
    if (error || !created) return 0;
    shipmentId = String(created.id);
  }

  const rows = [];
  for (const line of wanted) {
    const article = hafeleArticle(`${line.description} ${line.finish ?? ""} ${line.product_type}`);
    const catalog = line.item_code.replace(/\s+/g, "");
    const itemNumber = article ?? catalog;
    const vendorSku = article ? catalog : null;
    const already = (existing ?? []).some(
      (row) =>
        codesMatch(itemNumber, row.item_number as string) ||
        codesMatch(itemNumber, row.vendor_sku as string | null) ||
        (vendorSku &&
          (codesMatch(vendorSku, row.item_number as string) ||
            codesMatch(vendorSku, row.vendor_sku as string | null))),
    );
    if (already) continue;
    rows.push({
      shipment_id: shipmentId,
      item_number: itemNumber,
      vendor_sku: vendorSku,
      so_number: input.soNumber,
      cust_ref: input.orderName,
      job_name: input.orderName,
      description: line.description || line.product_type || null,
      qty: Math.max(1, Number(line.qty) || 1),
      received_qty: 0,
      damaged_qty: 0,
      status: "expected",
      job_id: input.jobId,
      note: "Studio 40000",
    });
  }
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("ic_shipment_items").insert(rows);
  if (error) throw error;
  return rows.length;
}

function shipmentRowLabel(ship: {
  source_filename?: string | null;
  notice?: string | null;
}): string {
  const file = String(ship.source_filename ?? "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .trim();
  const notice = String(ship.notice ?? "").trim();
  return file || notice || "Existing row";
}

/** Other live receiving rows that already list these jobs. Studio placeholders are not rows Bryant scans. */
export async function findExistingReceivingRows(shipmentId: string): Promise<ExistingRowFlag[]> {
  const supabase = getSupabaseAdmin();
  const { data: mine } = await supabase
    .from("ic_shipment_items")
    .select("job_id, job_name, cust_ref")
    .eq("shipment_id", shipmentId)
    .not("job_id", "is", null);
  const jobNames = new Map<string, string>();
  for (const row of mine ?? []) {
    if (!row.job_id || jobNames.has(String(row.job_id))) continue;
    jobNames.set(String(row.job_id), String(row.job_name || row.cust_ref || "Client"));
  }
  const jobIds = [...jobNames.keys()];
  if (jobIds.length === 0) return [];

  const { data: others } = await supabase
    .from("ic_shipment_items")
    .select("shipment_id, job_id")
    .in("job_id", jobIds)
    .neq("shipment_id", shipmentId);
  const pairs = new Map<string, { shipmentId: string; jobId: string }>();
  for (const row of others ?? []) {
    if (!row.shipment_id || !row.job_id) continue;
    const shipment = String(row.shipment_id);
    const jobId = String(row.job_id);
    pairs.set(`${jobId}:${shipment}`, { shipmentId: shipment, jobId });
  }
  if (pairs.size === 0) return [];

  const { data: ships } = await supabase
    .from("ic_shipments")
    .select("id, notice, source_filename, parse_quality")
    .in("id", [...new Set([...pairs.values()].map((pair) => pair.shipmentId))])
    .is("deleted_at", null);
  const live = new Map(
    (ships ?? [])
      .filter((ship) => !isStudioReceivingShipment(ship))
      .map((ship) => [String(ship.id), ship]),
  );
  const flags: ExistingRowFlag[] = [];
  for (const pair of pairs.values()) {
    const ship = live.get(pair.shipmentId);
    if (!ship) continue;
    flags.push({
      job_id: pair.jobId,
      job_name: jobNames.get(pair.jobId) || "Client",
      shipment_id: pair.shipmentId,
      label: shipmentRowLabel(ship),
    });
  }
  flags.sort((a, b) => a.job_name.localeCompare(b.job_name) || a.label.localeCompare(b.label));
  return flags.slice(0, 24);
}

async function writeExistingRowFlags(shipmentId: string, flags: ExistingRowFlag[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ic_shipments")
    .select("parse_quality")
    .eq("id", shipmentId)
    .maybeSingle();
  const quality = asQuality(data?.parse_quality);
  quality.existing_rows = flags;
  await supabase
    .from("ic_shipments")
    .update({ parse_quality: quality, updated_at: new Date().toISOString() })
    .eq("id", shipmentId);
}

export async function dismissExistingRowFlag(input: {
  shipmentId: string;
  jobId?: string;
  destShipmentId?: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ic_shipments")
    .select("parse_quality")
    .eq("id", input.shipmentId)
    .maybeSingle();
  const remaining = existingRowFlags(data?.parse_quality).filter((flag) => {
    if (input.jobId && flag.job_id !== input.jobId) return true;
    if (input.destShipmentId && flag.shipment_id !== input.destShipmentId) return true;
    return false;
  });
  await writeExistingRowFlags(input.shipmentId, remaining);
}

/** Move one client's lines from this slip onto a row Frank already has. */
export async function mergeJobOntoExistingRow(input: {
  sourceShipmentId: string;
  destShipmentId: string;
  jobId: string;
}): Promise<{ moved: number; merged: number; pruned: boolean }> {
  if (input.sourceShipmentId === input.destShipmentId) {
    throw new Error("Pick a different row to merge into.");
  }
  const supabase = getSupabaseAdmin();
  const { data: destShip } = await supabase
    .from("ic_shipments")
    .select("id, status")
    .eq("id", input.destShipmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!destShip) throw new Error("That row is no longer on the list.");

  const { data: destRows } = await supabase
    .from("ic_shipment_items")
    .select("id, item_number, vendor_sku, received_qty, damaged_qty, qty, status, needs_credit")
    .eq("shipment_id", input.destShipmentId);
  const destLines = [...(destRows ?? [])];
  const { data: sourceRows } = await supabase
    .from("ic_shipment_items")
    .select("id, item_number, vendor_sku, qty, received_qty, damaged_qty, status, needs_credit")
    .eq("shipment_id", input.sourceShipmentId)
    .eq("job_id", input.jobId);
  if ((sourceRows ?? []).length === 0) throw new Error("Those products are no longer on this slip.");

  let moved = 0;
  let merged = 0;
  let hasOpen = false;
  const now = new Date().toISOString();
  for (const source of sourceRows ?? []) {
    if ((Number(source.received_qty) || 0) < (Number(source.qty) || 1)) hasOpen = true;
    const match = destLines.find((row) =>
      receivingLinesMatch(
        { item_number: String(source.item_number), vendor_sku: source.vendor_sku as string | null },
        { item_number: String(row.item_number), vendor_sku: row.vendor_sku as string | null },
      ),
    );
    if (match) {
      const destReceived = Number(match.received_qty) || 0;
      const sourceReceived = Number(source.received_qty) || 0;
      await supabase
        .from("ic_shipment_items")
        .update({
          received_qty: Math.max(destReceived, sourceReceived),
          damaged_qty: Math.max(Number(match.damaged_qty) || 0, Number(source.damaged_qty) || 0),
          needs_credit: Boolean(match.needs_credit) || Boolean(source.needs_credit),
          updated_at: now,
        })
        .eq("id", match.id);
      await supabase
        .from("ic_shipment_scans")
        .update({ shipment_id: input.destShipmentId, item_id: match.id })
        .eq("item_id", source.id);
      await supabase
        .from("ic_shipment_claims")
        .update({ shipment_id: input.destShipmentId, item_id: match.id })
        .eq("item_id", source.id);
      await supabase.from("ic_shipment_items").delete().eq("id", source.id);
      merged += 1;
      continue;
    }
    await supabase
      .from("ic_shipment_scans")
      .update({ shipment_id: input.destShipmentId })
      .eq("item_id", source.id);
    await supabase
      .from("ic_shipment_claims")
      .update({ shipment_id: input.destShipmentId })
      .eq("item_id", source.id);
    await supabase
      .from("ic_shipment_items")
      .update({ shipment_id: input.destShipmentId, note: "From packaging slip", updated_at: now })
      .eq("id", source.id);
    moved += 1;
  }

  if (hasOpen && destShip.status === "complete") {
    await supabase
      .from("ic_shipments")
      .update({ status: "in_progress", updated_at: now })
      .eq("id", input.destShipmentId);
  }

  const { data: sourceShip } = await supabase
    .from("ic_shipments")
    .select("notice, ship_date, source_filename, storage_path, public_url, parse_quality")
    .eq("id", input.sourceShipmentId)
    .maybeSingle();
  if (sourceShip?.storage_path || sourceShip?.public_url || sourceShip?.source_filename) {
    const { data: destQualityRow } = await supabase
      .from("ic_shipments")
      .select("parse_quality")
      .eq("id", input.destShipmentId)
      .maybeSingle();
    const quality = asQuality(destQualityRow?.parse_quality);
    const lists = Array.isArray(quality.packing_lists)
      ? [...(quality.packing_lists as Array<Record<string, unknown>>)]
      : [];
    const key = sourceShip.storage_path || sourceShip.public_url || sourceShip.source_filename;
    const already = key
      ? lists.some((row) => String(row.storage_path || row.public_url || row.source_filename) === key)
      : false;
    if (!already) {
      lists.push({
        notice: sourceShip.notice,
        ship_date: sourceShip.ship_date,
        source_filename: sourceShip.source_filename,
        storage_path: sourceShip.storage_path,
        public_url: sourceShip.public_url,
      });
      quality.packing_lists = lists;
      await supabase
        .from("ic_shipments")
        .update({ parse_quality: quality, updated_at: now })
        .eq("id", input.destShipmentId);
    }
  }

  const pruned = await pruneEmptyShipment(input.sourceShipmentId);
  if (!pruned) {
    const remaining = existingRowFlags(sourceShip?.parse_quality).filter(
      (flag) => !(flag.job_id === input.jobId && flag.shipment_id === input.destShipmentId),
    );
    await writeExistingRowFlags(input.sourceShipmentId, remaining);
  }
  return { moved, merged, pruned };
}
