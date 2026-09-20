import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { missingReceivingTable } from "@/lib/inspired-closets-ops-receiving";
import {
  shipmentHeaderFacts,
  shipmentIdentity,
  shipmentVendorLabel,
} from "@/lib/inspired-closets-ops-shipment-display";
import { missingStowSalesOrderTable } from "@/lib/inspired-closets-ops-stow-sales-order";

function missingSummaryTable(message: string): boolean {
  return /ic_job_summar|ready_to_order|archived_at|schema cache|does not exist/i.test(message);
}

export const runtime = "nodejs";

export type InventoryDocumentKind = "stow_sales_order" | "packing_slip" | "product_summary";

export type InventoryDocument = {
  id: string;
  kind: InventoryDocumentKind;
  title: string;
  filename: string | null;
  soNumber: string | null;
  poNumber: string | null;
  jobId: string | null;
  jobName: string | null;
  status: string;
  itemCount: number | null;
  shipDate: string | null;
  orderTotal: number | null;
  weightLbs: number | null;
  vendor: string | null;
  createdAt: string;
  publicUrl: string | null;
  href: string;
};

function dollarsFromCents(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n / 100 : null;
}

function qualityRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function weightFromQuality(quality: Record<string, unknown>): number | null {
  const n = typeof quality.weight_lbs === "number" ? quality.weight_lbs : Number(quality.weight_lbs);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function jobNamesById(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const { data: jobs } = await supabase
    .from("ic_jobs")
    .select("id, client_id, studio_ref")
    .in("id", unique);
  const clientIds = [
    ...new Set((jobs ?? []).map((job) => job.client_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: clients } = clientIds.length
    ? await supabase.from("ic_clients").select("id, name").in("id", clientIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const clientsById = new Map((clients ?? []).map((client) => [client.id, client.name]));
  return new Map(
    (jobs ?? []).map((job) => [
      job.id,
      clientsById.get(job.client_id) || job.studio_ref || "Job",
    ]),
  );
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const documents: InventoryDocument[] = [];

  const [stowResult, summaryResult, slipResult] = await Promise.all([
    supabase
      .from("ic_stow_sales_orders")
      .select(
        "id, job_id, so_number, order_name, source_filename, public_url, status, item_count, ship_date, total_cents, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("ic_job_summaries")
      .select(
        "id, job_id, so_number, order_name, source_filename, public_url, status, item_count, confirmed_at, ship_date, total_cents, parse_quality, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("ic_shipments")
      .select("id, notice, source_filename, public_url, status, vendor, ship_date, created_at, parse_quality")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (stowResult.error && !missingStowSalesOrderTable(stowResult.error.message)) {
    return NextResponse.json({ ok: false, error: stowResult.error.message }, { status: 500 });
  }
  if (summaryResult.error && !missingSummaryTable(summaryResult.error.message)) {
    return NextResponse.json({ ok: false, error: summaryResult.error.message }, { status: 500 });
  }
  if (slipResult.error && !missingReceivingTable(slipResult.error.message)) {
    return NextResponse.json({ ok: false, error: slipResult.error.message }, { status: 500 });
  }

  const slips = slipResult.error ? [] : (slipResult.data ?? []);
  const slipIds = slips.map((row) => row.id);
  const { data: slipItems } = slipIds.length
    ? await supabase
        .from("ic_shipment_items")
        .select("shipment_id, job_id, job_name, cust_ref, qty, so_number")
        .in("shipment_id", slipIds)
    : { data: [] as Array<{ shipment_id: string; job_id: string | null; job_name: string | null; cust_ref: string | null; qty: number; so_number: string | null }> };

  const slipMeta = new Map<
    string,
    { itemCount: number; jobId: string | null; jobHint: string | null; soNumber: string | null }
  >();
  for (const item of slipItems ?? []) {
    const current = slipMeta.get(item.shipment_id) ?? {
      itemCount: 0,
      jobId: null as string | null,
      jobHint: null as string | null,
      soNumber: null as string | null,
    };
    current.itemCount += item.qty ?? 0;
    if (!current.jobId && item.job_id) current.jobId = item.job_id;
    if (!current.jobHint) current.jobHint = item.job_name || item.cust_ref || null;
    if (!current.soNumber && item.so_number) current.soNumber = item.so_number;
    slipMeta.set(item.shipment_id, current);
  }

  const names = await jobNamesById(supabase, [
    ...(stowResult.error ? [] : (stowResult.data ?? []).map((row) => row.job_id)),
    ...(summaryResult.error ? [] : (summaryResult.data ?? []).map((row) => row.job_id)),
    ...[...slipMeta.values()].map((row) => row.jobId),
    ...slips.map((row) => {
      const quality =
        row.parse_quality && typeof row.parse_quality === "object" && !Array.isArray(row.parse_quality)
          ? (row.parse_quality as Record<string, unknown>)
          : {};
      return typeof quality.job_id === "string" ? quality.job_id : null;
    }),
  ]);

  if (!stowResult.error) {
    for (const row of stowResult.data ?? []) {
      documents.push({
        id: row.id,
        kind: "stow_sales_order",
        title: row.order_name || (row.so_number ? `SO ${row.so_number}` : row.source_filename) || "Sales order",
        filename: row.source_filename ?? null,
        soNumber: row.so_number ?? null,
        poNumber: null,
        jobId: row.job_id ?? null,
        jobName: row.job_id ? names.get(row.job_id) ?? null : null,
        status: row.status ?? "received",
        itemCount: row.item_count ?? 0,
        shipDate: row.ship_date ?? null,
        orderTotal: dollarsFromCents(row.total_cents),
        weightLbs: null,
        vendor: "Stow",
        createdAt: row.created_at,
        publicUrl: row.public_url ?? null,
        href: row.job_id
          ? `/inspired-closets/ops/projects?id=${row.job_id}`
          : "/inspired-closets/ops/inventory",
      });
    }
  }

  if (!summaryResult.error) {
    for (const row of summaryResult.data ?? []) {
      const confirmed = row.status === "confirmed" || Boolean(row.confirmed_at);
      const quality = qualityRecord(row.parse_quality);
      documents.push({
        id: row.id,
        kind: "product_summary",
        title: row.order_name || (row.so_number ? `SO ${row.so_number}` : row.source_filename) || "Product summary",
        filename: row.source_filename ?? null,
        soNumber: row.so_number ?? null,
        poNumber: null,
        jobId: row.job_id ?? null,
        jobName: row.job_id ? names.get(row.job_id) ?? null : null,
        status: confirmed ? "confirmed" : row.status ?? "review",
        itemCount: row.item_count ?? 0,
        shipDate: row.ship_date ?? null,
        orderTotal: dollarsFromCents(row.total_cents),
        weightLbs: weightFromQuality(quality),
        vendor: "Stow",
        createdAt: row.created_at,
        publicUrl: row.public_url ?? null,
        href: row.job_id
          ? `/inspired-closets/ops/projects?id=${row.job_id}`
          : row.public_url || "/inspired-closets/ops/inventory",
      });
    }
  }

  for (const row of slips) {
    const meta = slipMeta.get(row.id);
    const quality = qualityRecord(row.parse_quality);
    const facts = shipmentHeaderFacts(quality);
    const isStudio =
      quality.source === "studio_order" ||
      quality.source === "studio-order-table" ||
      Boolean(row.notice && /^(STUDIO|DROP)-/i.test(String(row.notice)));
    if (isStudio) continue;
    const jobId = meta?.jobId ?? (typeof quality.job_id === "string" ? quality.job_id : null);
    documents.push({
      id: row.id,
      kind: "packing_slip",
      title: shipmentIdentity({
        notice: row.notice,
        source_filename: row.source_filename,
        so_numbers: facts.so_number || facts.order_number ? [facts.so_number || facts.order_number || ""] : [],
        job_names: meta?.jobHint ? [meta.jobHint] : [],
        order_name: facts.order_name,
        po_number: facts.po,
      }),
      filename: row.source_filename ?? null,
      soNumber: facts.so_number || facts.order_number || meta?.soNumber || null,
      poNumber: facts.po,
      jobId,
      jobName: (jobId ? names.get(jobId) : null) || meta?.jobHint || null,
      status: row.status ?? "ready",
      itemCount: meta?.itemCount ?? null,
      shipDate: row.ship_date ?? null,
      orderTotal: facts.order_total,
      weightLbs: facts.weight_lbs,
      vendor: shipmentVendorLabel({ vendor: row.vendor, source_filename: row.source_filename }),
      createdAt: row.created_at,
      publicUrl: row.public_url ?? null,
      href: `/inspired-closets/ops/inventory/receiving/${row.id}`,
    });
  }

  documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const counts = {
    stow_sales_order: documents.filter((row) => row.kind === "stow_sales_order").length,
    packing_slip: documents.filter((row) => row.kind === "packing_slip").length,
    product_summary: documents.filter((row) => row.kind === "product_summary").length,
  };

  return NextResponse.json({ ok: true, documents, counts });
}
