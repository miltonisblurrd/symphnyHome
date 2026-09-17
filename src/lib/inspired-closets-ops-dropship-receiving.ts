/**
 * Studio catalog lines Bryant scans: Stow wraps/bottoms (10000…/20000…) plus
 * 40000… hardware (Stow catalog and Häfele / Richelieu). Numbered Stow pieces
 * (300… / 16-VT) come from the packing list onto the same job shipment.
 */
import { getSupabaseAdmin } from "@/db/client";
import {
  codesMatch,
  findJobFromFilename,
  findJobId,
  linkItemToOs,
  notifyReceiving,
  type ParsedSlipItem,
} from "@/lib/inspired-closets-ops-receiving";
import {
  persistJobProductSummary,
  parseProductSummary,
  type ParsedProductSummary,
} from "@/lib/inspired-closets-ops-product-summary";

export type DropshipSummaryLine = {
  item_code: string;
  description?: string | null;
  product_type?: string | null;
  qty: number;
};

export type DropshipSyncResult = {
  shipment_id: string | null;
  imported: number;
  updated: number;
  skipped: number;
};

const STUDIO_SOURCE = "studio_order";

export function catalogSkuDigits(code: string): string {
  return String(code ?? "").replace(/\s+/g, "");
}

/** Scannable catalog SKUs — numbered Stow pieces stay on the packing list. */
export function isDropshipCatalogLine(line: DropshipSummaryLine): boolean {
  const code = catalogSkuDigits(line.item_code);
  if (/^(10000|20000|40000)\d+$/.test(code) && code.length >= 8) return true;
  const hay = `${line.product_type ?? ""} ${line.description ?? ""}`;
  return /slatwall/i.test(hay);
}

export function guessDropshipVendor(
  line: DropshipSummaryLine,
): "stow" | "hafele" | "richelieu" | "other" {
  const code = catalogSkuDigits(line.item_code);
  const hay = `${line.product_type ?? ""} ${line.description ?? ""} ${line.item_code}`;
  if (/richelieu|\brich\b/i.test(hay)) return "richelieu";
  if (/slatwall|h[äa]fele|hafele/i.test(hay)) return "hafele";
  if (/^(10000|20000)\d+$/.test(code)) return "stow";
  if (/^40000\d+$/.test(code)) return "stow";
  return "other";
}

function lastName(full: string | null | undefined): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] ?? full;
}

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
    source_filename: string | null;
    storage_path: string | null;
    public_url: string | null;
  },
): Promise<void> {
  if (shipmentIds.length === 0) return;
  const supabase = getSupabaseAdmin();
  const { data: ships } = await supabase
    .from("ic_shipments")
    .select("id, vendor, parse_quality")
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
    await supabase
      .from("ic_shipments")
      .update({
        parse_quality: quality,
        vendor: vendor === "hafele" || vendor === "richelieu" ? "other" : vendor,
        updated_at: now,
      })
      .eq("id", ship.id);
  }
}

export function dropshipLinesFromSummary(lines: DropshipSummaryLine[]): DropshipSummaryLine[] {
  const bySku = new Map<string, DropshipSummaryLine>();
  for (const line of lines) {
    if (!isDropshipCatalogLine(line)) continue;
    const sku = catalogSkuDigits(line.item_code);
    if (!sku) continue;
    const qty = Math.max(1, Math.round(Number(line.qty) || 1));
    const existing = bySku.get(sku);
    if (existing) {
      existing.qty += qty;
      continue;
    }
    bySku.set(sku, {
      item_code: sku,
      description: line.description,
      product_type: line.product_type,
      qty,
    });
  }
  return [...bySku.values()];
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

export async function syncDropshipReceivingFromSummary(input: {
  jobId: string | null;
  summaryId: string | null;
  orderName: string | null;
  soNumber: string | null;
  shipDate: string | null;
  lines: DropshipSummaryLine[];
  actorId: string | null;
  sourceFilename?: string | null;
  storagePath?: string | null;
  publicUrl?: string | null;
}): Promise<DropshipSyncResult> {
  const dropship = dropshipLinesFromSummary(input.lines);
  if (dropship.length === 0) {
    return { shipment_id: null, imported: 0, updated: 0, skipped: 0 };
  }

  const supabase = getSupabaseAdmin();
  const { data: job } = input.jobId
    ? await supabase
        .from("ic_jobs")
        .select("id, client_id, studio_ref")
        .eq("id", input.jobId)
        .maybeSingle()
    : { data: null };
  const { data: client } = job?.client_id
    ? await supabase.from("ic_clients").select("id, name").eq("id", job.client_id).maybeSingle()
    : { data: null };

  const jobName = lastName(client?.name) || (input.orderName ?? "").split(/[-_]/)[0] || "Job";
  const custRef = input.orderName || job?.studio_ref || jobName;
  const notice = studioNotice(input.orderName, input.jobId);

  const vendors = [...new Set(dropship.map(guessDropshipVendor))];
  const vendor = vendors.length === 1 ? vendors[0] : "other";

  const existing = await findJobScanShipment({
    jobId: input.jobId,
    orderName: input.orderName,
  });

  const now = new Date().toISOString();
  const parseQuality: Record<string, unknown> = {
    ...asQuality(existing?.parse_quality),
    source: STUDIO_SOURCE,
    job_id: input.jobId,
    summary_id: input.summaryId,
    line_count: dropship.length,
  };
  if (existing?.storage_path && input.storagePath && existing.storage_path !== input.storagePath) {
    parseQuality.studio_order = {
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      source_filename: input.sourceFilename,
    };
  }
  let shipmentId = existing?.id;
  if (!shipmentId) {
    const { data: ship, error } = await supabase
      .from("ic_shipments")
      .insert({
        notice,
        ship_date: input.shipDate,
        vendor,
        status: "ready",
        source_filename: input.sourceFilename ?? "studio-order",
        storage_path: input.storagePath ?? null,
        public_url: input.publicUrl ?? null,
        total_pages: 0,
        parse_quality: parseQuality,
        created_by: input.actorId,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (error || !ship) {
      throw new Error(error?.message ?? "Could not create Studio receiving list.");
    }
    shipmentId = ship.id as string;
  } else {
    if (!existing) {
      throw new Error("Could not update Studio receiving list.");
    }
    const patch: Record<string, unknown> = {
      notice,
      vendor,
      ship_date: input.shipDate,
      parse_quality: parseQuality,
      parse_error: null,
      updated_at: now,
    };
    if (!existing.storage_path && input.storagePath) {
      patch.source_filename = input.sourceFilename ?? "studio-order";
      patch.storage_path = input.storagePath;
      patch.public_url = input.publicUrl;
    } else if (!existing.source_filename && input.sourceFilename) {
      patch.source_filename = input.sourceFilename;
    }
    await supabase.from("ic_shipments").update(patch).eq("id", shipmentId);
  }

  if (!shipmentId) {
    throw new Error("Could not create Studio receiving list.");
  }

  const { data: current } = await supabase
    .from("ic_shipment_items")
    .select("id, item_number, vendor_sku, qty, received_qty")
    .eq("shipment_id", shipmentId);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const line of dropship) {
    const sku = catalogSkuDigits(line.item_code);
    const existingLine = (current ?? []).find((row) =>
      receivingLinesMatch(
        { item_number: sku, vendor_sku: sku },
        {
          item_number: String(row.item_number),
          vendor_sku: (row.vendor_sku as string | null) ?? null,
        },
      ),
    );
    const vendorGuess = guessDropshipVendor(line);
    const description = [line.description, line.product_type].filter(Boolean).join(" · ") || sku;
    const note =
      vendorGuess === "hafele" || vendorGuess === "richelieu"
        ? "Drop-ship from Studio order"
        : "Stow catalog from Studio order";
    if (existingLine) {
      const received = Number(existingLine.received_qty) || 0;
      if (received > 0) {
        skipped += 1;
        continue;
      }
      if (Number(existingLine.qty) !== line.qty) {
        await supabase
          .from("ic_shipment_items")
          .update({
            qty: line.qty,
            description,
            vendor_sku: sku,
            so_number: input.soNumber,
            cust_ref: custRef,
            job_name: jobName,
            job_id: input.jobId,
            note,
            updated_at: now,
          })
          .eq("id", existingLine.id);
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const parsed: ParsedSlipItem = {
      item_number: sku,
      vendor_sku: sku,
      so_number: input.soNumber,
      cust_ref: custRef,
      job_name: jobName,
      job_id: input.jobId,
      description,
      qty: line.qty,
    };
    const links = await linkItemToOs(parsed, { createPart: true });
    rows.push({
      shipment_id: shipmentId,
      item_number: sku,
      so_number: input.soNumber,
      cust_ref: custRef,
      job_name: jobName,
      description,
      qty: line.qty,
      received_qty: 0,
      damaged_qty: 0,
      container_id: null,
      status: "expected",
      vendor_sku: sku,
      job_id: input.jobId,
      part_id: links.part_id,
      note,
    });
    imported += 1;
  }

  const chunk = 80;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from("ic_shipment_items").insert(rows.slice(i, i + chunk));
    if (error) throw error;
  }

  if (input.jobId) {
    await absorbJobItemsOntoShipment(input.jobId, shipmentId);
  }

  if (imported > 0) {
    await notifyReceiving({
      title: `Studio list ready · ${jobName}`,
      message: `${imported} Stow catalog and Häfele / Richelieu lines from the Studio order are on Receiving (${notice}) for Bryant to scan.`,
    });
  }

  return { shipment_id: shipmentId, imported, updated, skipped };
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
  dropship: DropshipSyncResult;
  imported: number;
  message: string;
}> {
  const supabase = getSupabaseAdmin();
  const path = `receiving/studio/${Date.now()}-${input.filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, input.bytes, {
    contentType: input.mimeType || "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`Could not store the Studio PDF: ${uploadError.message}`);
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

  let summaryId: string | null = null;
  let lineCount = parsed.lines.length;
  if (jobId) {
    try {
      const saved = await persistJobProductSummary({
        jobId,
        filename: input.filename,
        storagePath: path,
        publicUrl,
        parsed,
        actorId: input.actorId,
      });
      summaryId = String(saved.summary.id);
      lineCount = saved.lines.length;
    } catch (error) {
      console.error("Studio summary save failed", error);
    }
  }

  const dropship = await syncDropshipReceivingFromSummary({
    jobId,
    summaryId,
    orderName: parsed.order_name,
    soNumber: parsed.so_number,
    shipDate: parsed.ship_date,
    lines: parsed.lines,
    actorId: input.actorId,
    sourceFilename: input.filename,
    storagePath: path,
    publicUrl,
  });

  if (!dropship.shipment_id) {
    const notice = studioNotice(parsed.order_name, jobId);
    const { data: ship } = await supabase
      .from("ic_shipments")
      .insert({
        notice,
        vendor: "stow",
        status: "ready",
        source_filename: input.filename,
        storage_path: path,
        public_url: publicUrl,
        parse_error: null,
        parse_quality: {
          source: STUDIO_SOURCE,
          job_id: jobId,
          so_number: parsed.so_number,
          order_name: parsed.order_name,
        },
        created_by: input.actorId,
      })
      .select("id")
      .single();
    if (ship?.id) dropship.shipment_id = String(ship.id);
  }

  const catalog = dropship.imported + dropship.updated + dropship.skipped;
  const orderLabel = parsed.order_name ?? parsed.so_number ?? input.filename;
  const matchNote = jobId
    ? `Attached to the job from ${input.filename}.`
    : `No job matched ${input.filename} yet — Bryant can still scan the list.`;
  const message = `Studio summary ${orderLabel}: ${lineCount} lines read, ${catalog} catalog lines on Receiving. ${matchNote}`;

  return {
    kind: "studio_order",
    order_name: parsed.order_name,
    so_number: parsed.so_number,
    job_id: jobId,
    summary_id: summaryId,
    dropship,
    imported: Math.max(lineCount, dropship.imported),
    message,
  };
}
