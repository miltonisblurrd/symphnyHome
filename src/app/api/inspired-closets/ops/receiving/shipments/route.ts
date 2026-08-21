import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  fixtureItemsToParsed,
  linkItemToOs,
  missingReceivingTable,
  notifyReceiving,
  parsePackingSlip,
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
  shipmentId: string,
  items: ParsedSlipItem[],
): Promise<{ imported: number; unassigned: string[] }> {
  const supabase = getSupabaseAdmin();
  const rows = [];
  for (const item of items) {
    const links = await linkItemToOs(item, { createPart: true });
    rows.push({
      shipment_id: shipmentId,
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
      job_id: links.job_id,
      part_id: links.part_id,
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
  return { imported: rows.length, unassigned };
}

async function warnUnassigned(notice: string | null, unassigned: string[]) {
  if (unassigned.length === 0) return;
  await notifyReceiving({
    title: `Receiving: no job match on ${notice ?? "a truck"}`,
    message: `Checked in / expected with no OS job: ${unassigned.slice(0, 8).join(", ")}. Attach the client on the shipment before install can go ready.`,
    severity: "warning",
  });
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipments")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
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
    const { data: items } = await supabase
      .from("ic_shipment_items")
      .select(
        "id, shipment_id, item_number, so_number, cust_ref, job_name, project_number, description, qty, received_qty, damaged_qty, container_id, source_page, status, vendor_sku, job_id, part_id, note",
      )
      .eq("shipment_id", ship.id);
    const rollup = shipmentRollup((items ?? []) as ShipmentItemRow[]);
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
        notice?: string;
        ship_date?: string;
        vendor?: string;
        items?: Array<Record<string, unknown>>;
      };
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
      const parsed = await parsePackingSlip({
        filename: file.name,
        mimeType: file.type || (ext === "pdf" ? "application/pdf" : "image/jpeg"),
        bytes,
      });
      const inserted = await insertItems(ship.id, parsed.items);
      await warnUnassigned(parsed.notice, inserted.unassigned);
      const { data: updated } = await supabase
        .from("ic_shipments")
        .update({
          notice: parsed.notice,
          ship_date: toIsoDate(parsed.ship_date),
          vendor: parsed.vendor || "stow",
          status: "ready",
          total_pages: parsed.total_pages,
          parse_quality: parsed.parse_quality,
          parse_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ship.id)
        .select("*")
        .single();
      return NextResponse.json({
        ok: true,
        shipment: updated ?? ship,
        imported: inserted.imported,
        unassigned: inserted.unassigned,
      });
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : "Could not read packing slip.";
      await supabase
        .from("ic_shipments")
        .update({
          status: "ready",
          parse_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ship.id);
      return NextResponse.json(
        { ok: false, error: message, shipment_id: ship.id },
        { status: 400 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
