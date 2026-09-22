import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { hafeleArticle } from "@/lib/inspired-closets-ops-scan-codes";

export const runtime = "nodejs";

function addBusinessDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  let left = Math.abs(days);
  const step = days < 0 ? -1 : 1;
  while (left > 0) {
    date.setDate(date.getDate() + step);
    const day = date.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function bucket(item: { item_number: string; vendor_sku: string | null; vendor: string }): "stow" | "hafele" | "richelieu" {
  const sku = `${item.item_number} ${item.vendor_sku ?? ""}`;
  if (hafeleArticle(sku) || item.vendor === "hafele") return "hafele";
  if (/[A-Z]/i.test(item.item_number) || item.vendor === "richelieu") return "richelieu";
  return "stow";
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data: jobs, error } = await supabase
    .from("ic_jobs")
    .select("id, title, install_date, installer_id, client_id, stage")
    .is("deleted_at", null)
    .not("install_date", "is", null)
    .order("install_date", { ascending: true })
    .limit(120);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const jobIds = (jobs ?? []).map((job) => String(job.id));
  const clientIds = [...new Set((jobs ?? []).map((job) => job.client_id).filter(Boolean))];
  const installerIds = [...new Set((jobs ?? []).map((job) => job.installer_id).filter(Boolean))];
  const [{ data: clients }, { data: staff }, { data: items }] = await Promise.all([
    clientIds.length
      ? supabase.from("ic_clients").select("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] }),
    installerIds.length
      ? supabase.from("ic_staff").select("id, name").in("id", installerIds)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase
          .from("ic_shipment_items")
          .select("job_id, item_number, vendor_sku, qty, received_qty, shipment_id")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] }),
  ]);
  const shipIds = [...new Set((items ?? []).map((row) => row.shipment_id).filter(Boolean))];
  const { data: ships } = shipIds.length
    ? await supabase.from("ic_shipments").select("id, vendor").in("id", shipIds)
    : { data: [] };
  const vendorByShip = new Map((ships ?? []).map((ship) => [String(ship.id), String(ship.vendor ?? "stow")]));
  const clientName = new Map((clients ?? []).map((row) => [String(row.id), String(row.name ?? "")]));
  const staffName = new Map((staff ?? []).map((row) => [String(row.id), String(row.name ?? "")]));

  const rows = (jobs ?? []).map((job) => {
    const lines = (items ?? []).filter((row) => row.job_id === job.id);
    const tally = {
      stow: { received: 0, qty: 0 },
      hafele: { received: 0, qty: 0 },
      richelieu: { received: 0, qty: 0 },
    };
    for (const line of lines) {
      const key = bucket({
        item_number: String(line.item_number ?? ""),
        vendor_sku: (line.vendor_sku as string | null) ?? null,
        vendor: vendorByShip.get(String(line.shipment_id)) ?? "stow",
      });
      tally[key].qty += Number(line.qty) || 0;
      tally[key].received += Number(line.received_qty) || 0;
    }
    const expected = tally.stow.qty + tally.hafele.qty + tally.richelieu.qty;
    const received = tally.stow.received + tally.hafele.received + tally.richelieu.received;
    const status =
      expected === 0 ? "Outstanding" : received >= expected ? "All received" : received > 0 ? "Receiving" : "Outstanding";
    const install = job.install_date ? String(job.install_date) : null;
    return {
      id: job.id,
      client: clientName.get(String(job.client_id ?? "")) || job.title || "Job",
      stage: job.stage,
      install_date: install,
      installer: staffName.get(String(job.installer_id ?? "")) || "",
      prep_by: install ? addBusinessDays(install, -2) : null,
      stow: tally.stow,
      hafele: tally.hafele,
      richelieu: tally.richelieu,
      status,
    };
  });

  return NextResponse.json({ ok: true, jobs: rows });
}
