/**
 * Bryant's To do: one row per job with every warehouse action that applies.
 * Nothing is stored; rows come from the install date, the product summary,
 * packing-slip scan counts, and Stow sales-order ship dates.
 */
import { getSupabaseAdmin } from "@/db/client";
import { addCalendarDays, laToday } from "@/lib/inspired-closets-ops-warehouse";
import {
  loadQueueJobRows,
  loadWarehouseQueue,
  queueRowsFor,
  type WarehouseQueueJob,
} from "@/lib/inspired-closets-ops-warehouse-data";

export type TodoKind = "scan" | "kit" | "delivery" | "soon";

export type TodoAction = {
  kind: TodoKind;
  label: string;
  href: string;
};

export type WarehouseTodoRow = {
  id: string;
  client_name: string;
  title: string | null;
  install_date: string | null;
  installer_name: string | null;
  headline: string;
  actions: TodoAction[];
  rank: number;
};

type Failure = { ok: false; status: number; error: string; hint?: string };

const COMING_SOON_DAYS = 14;
const DELIVERY_DAYS = 7;
const KIT_WINDOW_DAYS = 21;
const KIT_URGENT_DAYS = 3;
/** Older installs with unscanned slips predate the scanner; they are not Bryant's queue. */
const STALE_INSTALL_DAYS = 14;

function dayGap(from: string, to: string): number {
  const [a, b] = [from, to].map((ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  });
  return Math.round((b - a) / 86_400_000);
}

function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function whenInstall(today: string, install: string | null): string {
  if (!install) return "No install date.";
  const gap = dayGap(today, install);
  if (gap === 0) return "Install is today.";
  if (gap === 1) return "Install is tomorrow.";
  if (gap < 0) return `Install was ${shortDay(install)}.`;
  return `Install ${shortDay(install)}.`;
}

type OpenSlip = { shipment_id: string; open: number; received: number; total: number };

/** Open packing-slip lines per job, live shipments only. Biggest open slip first. */
async function openSlipsByJob(jobIds: string[] | null): Promise<Map<string, OpenSlip[]>> {
  const supabase = getSupabaseAdmin();
  const query = supabase
    .from("ic_shipment_items")
    .select("job_id, shipment_id, qty, received_qty")
    .not("job_id", "is", null)
    .limit(5000);
  const { data } = jobIds ? await query.in("job_id", jobIds) : await query.in("status", ["expected", "missing"]);
  const rows = data ?? [];
  const shipmentIds = [...new Set(rows.map((row) => String(row.shipment_id)))];
  const live = new Set<string>();
  for (let i = 0; i < shipmentIds.length; i += 200) {
    const { data: ships } = await supabase
      .from("ic_shipments")
      .select("id")
      .in("id", shipmentIds.slice(i, i + 200))
      .is("deleted_at", null);
    for (const ship of ships ?? []) live.add(String(ship.id));
  }

  const byJob = new Map<string, Map<string, OpenSlip>>();
  for (const row of rows) {
    const shipmentId = String(row.shipment_id);
    if (!live.has(shipmentId)) continue;
    const jobId = String(row.job_id);
    const slips = byJob.get(jobId) ?? new Map<string, OpenSlip>();
    const slip = slips.get(shipmentId) ?? { shipment_id: shipmentId, open: 0, received: 0, total: 0 };
    const qty = Number(row.qty) || 0;
    const received = Number(row.received_qty) || 0;
    slip.total += qty;
    slip.received += Math.min(qty, received);
    slip.open += Math.max(0, qty - received);
    slips.set(shipmentId, slip);
    byJob.set(jobId, slips);
  }
  const out = new Map<string, OpenSlip[]>();
  for (const [jobId, slips] of byJob) {
    const open = [...slips.values()].filter((slip) => slip.open > 0).sort((a, b) => b.open - a.open);
    if (open.length > 0) out.set(jobId, open);
  }
  return out;
}

/** Earliest Stow ship date per job inside the delivery window. */
async function deliveriesByJob(today: string): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin();
  const until = addCalendarDays(today, DELIVERY_DAYS);
  const out = new Map<string, string>();
  const [orders, summaries] = await Promise.all([
    supabase
      .from("ic_stow_sales_orders")
      .select("job_id, ship_date, status")
      .not("job_id", "is", null)
      .gte("ship_date", today)
      .lte("ship_date", until),
    supabase
      .from("ic_job_summaries")
      .select("job_id, ship_date")
      .not("job_id", "is", null)
      .gte("ship_date", today)
      .lte("ship_date", until),
  ]);
  for (const row of [...(orders.data ?? []), ...(summaries.data ?? [])]) {
    if ("status" in row && (row.status === "ignored" || row.status === "error")) continue;
    const jobId = String(row.job_id);
    const date = String(row.ship_date);
    const seen = out.get(jobId);
    if (!seen || date < seen) out.set(jobId, date);
  }
  return out;
}

function buildRow(
  job: WarehouseQueueJob,
  today: string,
  slips: OpenSlip[],
  delivery: string | null,
): WarehouseTodoRow | null {
  const kitHref = `/ops/warehouse/${job.id}`;
  const gap = job.install_date ? dayGap(today, job.install_date) : null;
  const ready = job.warehouse_status === "ready";
  const started = job.marked_count > 0 || job.warehouse_status === "gathering" || job.warehouse_status === "hold";
  const actions: TodoAction[] = [];
  const ranks: number[] = [];
  const notes: string[] = [];
  if (gap !== null && gap < -STALE_INSTALL_DAYS) return null;

  const slip = slips[0];
  if (slip) {
    const received = slips.reduce((sum, row) => sum + row.received, 0);
    const total = slips.reduce((sum, row) => sum + row.total, 0);
    actions.push({
      kind: "scan",
      label: `Scan ${received}/${total}`,
      href: `/ops/inventory/receiving/${slip.shipment_id}/scan`,
    });
    ranks.push(gap !== null && gap <= KIT_WINDOW_DAYS ? 1 : 5);
    notes.push(slips.length > 1 ? `${slips.length} packing slips still short.` : "Packing slip is here and still short.");
  }

  // A past install stays only while a slip is unscanned or a pile is half built.
  if (gap !== null && gap < 0 && !slip && !(started && !ready)) return null;

  const kitInWindow = gap === null ? started : gap <= KIT_WINDOW_DAYS;
  if (job.has_summary && !ready && kitInWindow) {
    actions.push({ kind: "kit", label: `Kit ${job.marked_count}/${job.line_count}`, href: kitHref });
    ranks.push(gap !== null && gap <= KIT_URGENT_DAYS ? 3 : 5);
    if (job.warehouse_status === "hold") notes.push("Pile is on hold.");
    else if (slip && job.marked_count === 0) notes.push("Shelf pulls can start before the truck is scanned.");
  }

  if (delivery && job.scan_total === 0) {
    const days = dayGap(today, delivery);
    actions.push({
      kind: "delivery",
      label: days === 0 ? "Truck today" : days === 1 ? "Truck tomorrow" : `Truck ${shortDay(delivery)}`,
      href: kitHref,
    });
    ranks.push(days <= 1 ? 2 : 4);
    notes.push("Stow ship date is set. No packing slip yet.");
  }

  if (actions.length === 0 && !ready && gap !== null && gap >= 0 && gap <= COMING_SOON_DAYS) {
    actions.push({ kind: "soon", label: "Coming soon", href: kitHref });
    ranks.push(6);
    notes.push(
      job.scan_total > 0
        ? "Truck is scanned. No product summary yet."
        : "No product summary and no packing slip yet.",
    );
  }

  if (actions.length === 0) return null;
  return {
    id: job.id,
    client_name: job.client_name,
    title: job.title,
    install_date: job.install_date,
    installer_name: job.installer_name,
    headline: [whenInstall(today, job.install_date), ...notes].join(" "),
    actions,
    rank: Math.min(...ranks),
  };
}

export async function loadWarehouseTodo(): Promise<{ ok: true; today: string; rows: WarehouseTodoRow[] } | Failure> {
  const today = laToday();
  const queue = await loadWarehouseQueue();
  if (!queue.ok) return queue;

  const [openAnywhere, deliveries] = await Promise.all([openSlipsByJob(null), deliveriesByJob(today)]);
  const known = new Set(queue.jobs.map((job) => job.id));
  const extraIds = [...new Set([...openAnywhere.keys(), ...deliveries.keys()])].filter((id) => !known.has(id));
  const extraRows = await loadQueueJobRows(extraIds);
  if (!extraRows.ok) return extraRows;
  const extra = await queueRowsFor(extraRows.jobs);
  if (!extra.ok) return extra;

  const jobs = [...queue.jobs, ...extra.rows];
  const slips = await openSlipsByJob(jobs.map((job) => job.id));
  const rows = jobs
    .map((job) => buildRow(job, today, slips.get(job.id) ?? [], deliveries.get(job.id) ?? null))
    .filter((row): row is WarehouseTodoRow => row !== null);

  rows.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const aDate = a.install_date ?? "9999-99-99";
    const bDate = b.install_date ?? "9999-99-99";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.client_name.localeCompare(b.client_name);
  });
  return { ok: true, today, rows };
}
