import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  absorbJobItemsOntoShipment,
  appendPackingListMeta,
  findJobScanShipment,
  ingestStudioOrderFromReceiving,
  pruneEmptyShipment,
  receivingLinesMatch,
} from "@/lib/inspired-closets-ops-dropship-receiving";
import {
  fixtureItemsToParsed,
  findJobFromFilename,
  clientHintFromFilename,
  linkItemToOs,
  loadShipmentItemRows,
  missingReceivingTable,
  notifyReceiving,
  parsePackingSlip,
  relinkShipmentItems,
  shipmentRollup,
  type ParsedSlipItem,
  type ShipmentItemRow,
} from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";
export const maxDuration = 120;

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

async function insertItems(
  fallbackShipmentId: string,
  items: ParsedSlipItem[],
  options?: { routeByJob?: boolean; fallbackJobId?: string | null },
): Promise<{
  imported: number;
  unassigned: string[];
  jobShipmentIds: string[];
  jobRoutes: Array<{ jobId: string; shipmentId: string }>;
  fallbackCount: number;
}> {
  const supabase = getSupabaseAdmin();
  const destCache = new Map<string, string | null>();
  const existingByDest = new Map<
    string,
    Array<{ id: string; item_number: string; vendor_sku: string | null; received_qty: number; container_id: string | null }>
  >();

  async function existingLines(destId: string) {
    const cached = existingByDest.get(destId);
    if (cached) return cached;
    const { data } = await supabase
      .from("ic_shipment_items")
      .select("id, item_number, vendor_sku, received_qty, container_id")
      .eq("shipment_id", destId);
    const rows = (data ?? []).map((row) => ({
      id: String(row.id),
      item_number: String(row.item_number),
      vendor_sku: (row.vendor_sku as string | null) ?? null,
      received_qty: Number(row.received_qty) || 0,
      container_id: (row.container_id as string | null) ?? null,
    }));
    existingByDest.set(destId, rows);
    return rows;
  }

  async function destForJob(jobId: string | null): Promise<string> {
    if (!options?.routeByJob || !jobId) return fallbackShipmentId;
    if (!destCache.has(jobId)) {
      const found = await findJobScanShipment({ jobId });
      destCache.set(jobId, found && found.id !== fallbackShipmentId ? found.id : null);
    }
    return destCache.get(jobId) ?? fallbackShipmentId;
  }

  const rows: Array<Record<string, unknown>> = [];
  const jobShipmentIds = new Set<string>();
  let fallbackCount = 0;
  const now = new Date().toISOString();

  for (const item of items) {
    const links = await linkItemToOs(item, { createPart: true });
    const jobId = item.job_id || links.job_id || options?.fallbackJobId || null;
    const destId = await destForJob(jobId);
    if (destId !== fallbackShipmentId) jobShipmentIds.add(destId);
    else fallbackCount += 1;

    const existing = (await existingLines(destId)).find((row) =>
      receivingLinesMatch(
        { item_number: item.item_number, vendor_sku: item.vendor_sku ?? null },
        row,
      ),
    );
    if (existing) {
      if (existing.received_qty === 0 && item.container_id && !existing.container_id) {
        await supabase
          .from("ic_shipment_items")
          .update({
            container_id: item.container_id,
            so_number: item.so_number ?? null,
            updated_at: now,
          })
          .eq("id", existing.id);
        existing.container_id = item.container_id;
      }
      continue;
    }

    const row = {
      shipment_id: destId,
      item_number: item.item_number,
      so_number: item.so_number ?? null,
      cust_ref: item.cust_ref ?? null,
      job_name: item.job_name ?? null,
      project_number: item.project_number ?? null,
      description: item.description ?? null,
      qty: item.qty,
      received_qty: 0,
      damaged_qty: 0,
      container_id: item.container_id ?? null,
      source_page: item.source_page ?? null,
      status: "expected",
      vendor_sku: item.vendor_sku ?? null,
      job_id: jobId,
      part_id: links.part_id,
      note: destId === fallbackShipmentId ? null : "From packaging slip",
    };
    rows.push(row);
    existingByDest.get(destId)?.push({
      id: `pending-${rows.length}`,
      item_number: item.item_number,
      vendor_sku: item.vendor_sku ?? null,
      received_qty: 0,
      container_id: item.container_id ?? null,
    });
  }

  const chunk = 80;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from("ic_shipment_items").insert(rows.slice(i, i + chunk));
    if (error) throw error;
  }
  const unassigned = [
    ...new Set(
      rows
        .filter((row) => !row.job_id && (row.cust_ref || row.job_name))
        .map((row) => String(row.cust_ref || row.job_name)),
    ),
  ];
  const jobRoutes = [...destCache.entries()]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([jobId, shipmentId]) => ({ jobId, shipmentId }));

  return {
    imported: rows.length,
    unassigned,
    jobShipmentIds: [...jobShipmentIds],
    jobRoutes,
    fallbackCount,
  };
}

async function warnUnassigned(notice: string | null, unassigned: string[]) {
  if (unassigned.length === 0) return;
  await notifyReceiving({
    title: `Receiving: no job match on ${notice ?? "a truck"}`,
    message: `Checked in / expected with no OS job: ${unassigned.slice(0, 8).join(", ")}. Attach the client on the shipment before install can go ready.`,
    severity: "warning",
  });
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const jobId = new URL(request.url).searchParams.get("jobId");
  const supabase = getSupabaseAdmin();

  let shipIds: string[] | null = null;
  if (jobId) {
    const { data: itemRows, error: itemError } = await supabase
      .from("ic_shipment_items")
      .select("shipment_id")
      .eq("job_id", jobId);
    if (itemError) {
      if (missingReceivingTable(itemError.message)) {
        return NextResponse.json({
          ok: true,
          shipments: [],
          hint: "Run drizzle/0013_ic_shipments.sql in Supabase to enable receiving.",
        });
      }
      return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
    }
    shipIds = [...new Set((itemRows ?? []).map((row) => row.shipment_id).filter(Boolean))];
    if (shipIds.length === 0) {
      return NextResponse.json({ ok: true, shipments: [] });
    }
  }

  let query = supabase
    .from("ic_shipments")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (shipIds) query = query.in("id", shipIds);
  const { data, error } = await query;
  if (error) {
    if (missingReceivingTable(error.message)) {
      return NextResponse.json({
        ok: true,
        shipments: [],
        hint: "Run drizzle/0013_ic_shipments.sql in Supabase to enable receiving.",
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const shipments = [];
  for (const ship of data ?? []) {
    const items = await loadShipmentItemRows(ship.id);
    const scoped = jobId
      ? ((items ?? []) as ShipmentItemRow[]).filter((row) => row.job_id === jobId)
      : ((items ?? []) as ShipmentItemRow[]);
    const rollup = shipmentRollup(scoped);
    shipments.push({ ...ship, ...rollup });
  }
  return NextResponse.json({ ok: true, shipments });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const actor = await actorId();
  const supabase = getSupabaseAdmin();
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        action?: string;
        notice?: string;
        ship_date?: string;
        vendor?: string;
        items?: Array<Record<string, unknown>>;
      };
      if (body.action === "relink_all") {
        const { data: ships, error: listError } = await supabase
          .from("ic_shipments")
          .select("id")
          .is("deleted_at", null)
          .limit(100);
        if (listError) {
          return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
        }
        let linkedJobs = 0;
        let linkedParts = 0;
        let unassigned = 0;
        for (const ship of ships ?? []) {
          const result = await relinkShipmentItems(ship.id);
          linkedJobs += result.linked_jobs;
          linkedParts += result.linked_parts;
          unassigned += result.unassigned;
        }
        return NextResponse.json({
          ok: true,
          relinked: {
            shipments: (ships ?? []).length,
            linked_jobs: linkedJobs,
            linked_parts: linkedParts,
            unassigned,
          },
        });
      }
      const items = fixtureItemsToParsed(body.items ?? []);
      if (items.length === 0) {
        return NextResponse.json(
          { ok: false, error: "items[] is required when importing JSON." },
          { status: 400 },
        );
      }
      const { data: ship, error } = await supabase
        .from("ic_shipments")
        .insert({
          notice: body.notice?.trim() || null,
          ship_date: toIsoDate(body.ship_date ?? null),
          vendor: body.vendor || "stow",
          status: "ready",
          source_filename: "import.json",
          total_pages: 0,
          parse_quality: { total_items: items.length, source: "json" },
          created_by: actor,
        })
        .select("*")
        .single();
      if (error) {
        if (missingReceivingTable(error.message)) {
          return NextResponse.json(
            { ok: false, error: "Run drizzle/0013_ic_shipments.sql in Supabase first." },
            { status: 400 },
          );
        }
        throw error;
      }
      const inserted = await insertItems(ship.id, items);
      await warnUnassigned(ship.notice, inserted.unassigned);
      return NextResponse.json({
        ok: true,
        shipment: ship,
        imported: inserted.imported,
        unassigned: inserted.unassigned,
      });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Choose the original packing-slip PDF." },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const mimeType = file.type || (ext === "pdf" ? "application/pdf" : "image/jpeg");
    const requestedKind = String(form.get("kind") ?? "").trim();
    if (requestedKind !== "studio_order" && requestedKind !== "packing_list") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Choose Upload packaging slip or Upload Studio product summary. Those are different files.",
        },
        { status: 400 },
      );
    }
    if (requestedKind === "studio_order") {
      const ingested = await ingestStudioOrderFromReceiving({
        filename: file.name,
        mimeType,
        bytes,
        actorId: actor,
      });
      return NextResponse.json({
        ok: true,
        kind: ingested.kind,
        order_name: ingested.order_name,
        so_number: ingested.so_number,
        job_id: ingested.job_id,
        summary_id: ingested.summary_id,
        shipment: ingested.dropship.shipment_id ? { id: ingested.dropship.shipment_id } : null,
        imported: ingested.imported,
        dropship: ingested.dropship,
        message: ingested.message,
      });
    }
    const path = `receiving/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;

    let storagePath: string | null = null;
    let publicUrl: string | null = null;
    const upload = await supabase.storage.from("ic-field-media").upload(path, bytes, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
    if (!upload.error) {
      storagePath = path;
      publicUrl = supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl;
    }

    const { data: ship, error: insertError } = await supabase
      .from("ic_shipments")
      .insert({
        notice: null,
        vendor: "stow",
        status: "parsing",
        source_filename: file.name,
        storage_path: storagePath,
        public_url: publicUrl,
        created_by: actor,
      })
      .select("*")
      .single();
    if (insertError) {
      if (missingReceivingTable(insertError.message)) {
        return NextResponse.json(
          { ok: false, error: "Run drizzle/0013_ic_shipments.sql in Supabase first." },
          { status: 400 },
        );
      }
      throw insertError;
    }

    try {
      const filenameJobId = await findJobFromFilename(file.name);
      const parsed = await parsePackingSlip({
        filename: file.name,
        mimeType: file.type || (ext === "pdf" ? "application/pdf" : "image/jpeg"),
        bytes,
        jobId: filenameJobId,
      });
      const inserted = await insertItems(ship.id, parsed.items, {
        routeByJob: true,
        fallbackJobId: filenameJobId,
      });
      await warnUnassigned(parsed.notice, inserted.unassigned);
      for (const route of inserted.jobRoutes) {
        await absorbJobItemsOntoShipment(route.jobId, route.shipmentId);
      }
      if (filenameJobId) {
        await absorbJobItemsOntoShipment(filenameJobId, ship.id);
      }
      if (inserted.jobShipmentIds.length > 0) {
        await appendPackingListMeta(inserted.jobShipmentIds, {
          notice: parsed.notice,
          source_filename: file.name,
          storage_path: storagePath,
          public_url: publicUrl,
        });
      }

      const hint = clientHintFromFilename(file.name);
      const matchNote = filenameJobId
        ? `Attached to the job from ${file.name}.`
        : hint
          ? `Saved ${file.name}. No open job matched ${hint} yet.`
          : `Saved ${file.name}.`;

      if (inserted.fallbackCount === 0 && inserted.imported + inserted.jobShipmentIds.length > 0) {
        await pruneEmptyShipment(ship.id);
        const primaryId = inserted.jobShipmentIds[0] ?? ship.id;
        const { data: primary } = await supabase
          .from("ic_shipments")
          .select("*")
          .eq("id", primaryId)
          .maybeSingle();
        return NextResponse.json({
          ok: true,
          kind: "packing_list",
          job_id: filenameJobId,
          shipment: primary ?? ship,
          imported: inserted.imported,
          unassigned: inserted.unassigned,
          merged_into: inserted.jobShipmentIds,
          message: `Read ${inserted.imported} packing-list lines. ${matchNote}`,
        });
      }

      const { data: updated } = await supabase
        .from("ic_shipments")
        .update({
          notice: parsed.notice || hint || null,
          ship_date: toIsoDate(parsed.ship_date),
          vendor: parsed.vendor || "stow",
          status: "ready",
          total_pages: parsed.total_pages,
          parse_quality: {
            ...parsed.parse_quality,
            job_id: filenameJobId,
            client_hint: hint || null,
          },
          parse_error: parsed.items.length === 0 ? "No line items found in this PDF." : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ship.id)
        .select("*")
        .single();
      return NextResponse.json({
        ok: true,
        kind: "packing_list",
        job_id: filenameJobId,
        shipment: updated ?? ship,
        imported: inserted.imported,
        unassigned: inserted.unassigned,
        merged_into: inserted.jobShipmentIds,
        message: `Read ${inserted.imported} packing-list lines. ${matchNote}`,
      });
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : "Could not read packing slip.";
      const hint = clientHintFromFilename(file.name);
      const filenameJobId = await findJobFromFilename(file.name);
      await supabase
        .from("ic_shipments")
        .update({
          notice: hint || null,
          status: "ready",
          parse_error: message,
          parse_quality: { job_id: filenameJobId, client_hint: hint || null },
          updated_at: new Date().toISOString(),
        })
        .eq("id", ship.id);
      return NextResponse.json({
        ok: true,
        kind: "packing_list",
        job_id: filenameJobId,
        shipment: { id: ship.id },
        imported: 0,
        message: `Saved ${file.name}. ${filenameJobId ? `Attached to the job from the filename.` : message}`,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
