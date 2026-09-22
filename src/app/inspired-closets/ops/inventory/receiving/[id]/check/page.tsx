"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import OpsSlipPdf from "@/components/inspired-closets/OpsSlipPdf";
import payroll from "@/components/inspired-closets/ops-payroll.module.css";

type Item = {
  id: string;
  item_number: string;
  vendor_sku: string | null;
  qty: number;
  received_qty: number;
  container_id: string | null;
  job_name: string | null;
  cust_ref: string | null;
  source_page: number | null;
};

export default function ReceivingCheckPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/inspired-closets/ops/receiving/shipments/${id}`);
    const payload = (await response.json()) as { ok: boolean; items?: Item[] };
    if (payload.ok) setItems(payload.items ?? []);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(item: Item) {
    setBusy(true);
    const response = await fetch(`/api/inspired-closets/ops/receiving/shipments/${id}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_number: item.item_number,
        vendor_sku: item.vendor_sku,
        qty: item.qty,
        container_id: item.container_id,
        job_name: item.job_name,
        cust_ref: item.cust_ref,
      }),
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };
    setNotice(payload.ok ? "Saved." : payload.error ?? "Could not save.");
    setBusy(false);
    if (payload.ok) await load();
  }

  async function reparse() {
    setBusy(true);
    const response = await fetch(`/api/inspired-closets/ops/receiving/shipments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reparse" }),
    });
    const payload = (await response.json()) as { ok: boolean; error?: string; reparsed?: { added: number; kept: number } };
    setNotice(
      payload.ok
        ? `Re-read the PDF. ${payload.reparsed?.added ?? 0} new lines. Lines already received were left alone.`
        : payload.error ?? "Could not re-read.",
    );
    setBusy(false);
    if (payload.ok) await load();
  }

  const pages = [...new Set(items.map((item) => item.source_page ?? 0))].sort((a, b) => a - b);

  return (
    <main className={payroll.page} style={{ padding: "1.25rem" }}>
      <p>
        <Link href={`/inspired-closets/ops/inventory/receiving/${id}`}>Back</Link>
        {" · "}
        <Link href={`/inspired-closets/ops/inventory/receiving/${id}/scan`}>Scan</Link>
      </p>
      <h1>Check the read</h1>
      <p>Original page on the left. Fix a number before anyone scans. Re-read does not wipe a line that is already in.</p>
      {notice ? <p>{notice}</p> : null}
      <button type="button" className={payroll.buttonPrimary} disabled={busy} onClick={() => void reparse()}>
        Re-read PDF
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(16rem, 1fr) minmax(18rem, 1.2fr)", gap: "1rem", marginTop: "1rem" }}>
        <OpsSlipPdf src={`/api/inspired-closets/ops/receiving/shipments/${id}/file`} title="Packing list" mode="pages" />
        <div>
          {pages.map((page) => (
            <section key={page}>
              <h2>{page ? `Page ${page} · ${items.filter((item) => (item.source_page ?? 0) === page).length}` : "No page"}</h2>
              {items
                .filter((item) => (item.source_page ?? 0) === page)
                .map((item) => (
                  <form
                    key={item.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save(item);
                    }}
                    style={{ display: "grid", gap: "0.35rem", marginBottom: "0.75rem" }}
                  >
                    <input value={item.item_number} onChange={(event) => setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, item_number: event.target.value } : row)))} />
                    <input value={item.vendor_sku ?? ""} placeholder="Vendor SKU" onChange={(event) => setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, vendor_sku: event.target.value } : row)))} />
                    <input value={String(item.qty)} onChange={(event) => setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, qty: Number(event.target.value) || 0 } : row)))} />
                    <input value={item.container_id ?? ""} placeholder="Pallet" onChange={(event) => setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, container_id: event.target.value } : row)))} />
                    <input value={item.job_name ?? item.cust_ref ?? ""} placeholder="Job" onChange={(event) => setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, job_name: event.target.value, cust_ref: event.target.value } : row)))} />
                    <button type="submit" disabled={busy || item.received_qty > 0}>
                      {item.received_qty > 0 ? "Already received" : "Save line"}
                    </button>
                  </form>
                ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
