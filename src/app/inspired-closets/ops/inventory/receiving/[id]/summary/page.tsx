"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import payroll from "@/components/inspired-closets/ops-payroll.module.css";

type Item = {
  id: string;
  item_number: string;
  job_name: string | null;
  cust_ref: string | null;
  container_id: string | null;
  qty: number;
  received_qty: number;
  damaged_qty?: number;
  status: string;
};

export default function ReceivingSummaryPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [items, setItems] = useState<Item[]>([]);
  const [unknown, setUnknown] = useState<Array<{ scanned_value?: string; item_number?: string }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/inspired-closets/ops/receiving/shipments/${id}`);
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        items?: Item[];
        unknown_scans?: Array<{ scanned_value?: string; item_number?: string }>;
      };
      if (!payload.ok) {
        setError(payload.error ?? "Could not load this truck.");
        return;
      }
      setItems(payload.items ?? []);
      setUnknown(payload.unknown_scans ?? []);
    })();
  }, [id]);

  const received = items.filter((item) => item.received_qty >= item.qty);
  const damaged = items.filter((item) => item.status === "damaged" || (item.damaged_qty ?? 0) > 0);
  const missing = items.filter((item) => item.status === "missing" || (item.received_qty < item.qty && item.status !== "expected"));
  const pending = items.filter((item) => item.received_qty < item.qty && item.status === "expected");
  const groups = (key: (item: Item) => string) => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const name = key(item);
      map.set(name, [...(map.get(name) ?? []), item]);
    }
    return [...map.entries()];
  };

  return (
    <main className={payroll.page} style={{ padding: "1.25rem" }}>
      <p>
        <Link href={`/inspired-closets/ops/inventory/receiving/${id}/scan`}>Back to Scan</Link>
      </p>
      <h1>Truck summary</h1>
      {error ? <p>{error}</p> : null}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.75rem" }}>
        {[
          ["Received", received.length],
          ["Damaged", damaged.length],
          ["Missing", missing.length],
          ["Pending", pending.length],
        ].map(([label, count]) => (
          <article key={String(label)} className={payroll.panel} style={{ padding: "0.75rem" }}>
            <div>{label}</div>
            <strong>{count}</strong>
          </article>
        ))}
      </section>
      <h2>By job</h2>
      {groups((item) => item.cust_ref || item.job_name || "Unassigned").map(([name, rows]) => (
        <p key={name}>
          {name}: {rows.reduce((sum, row) => sum + row.received_qty, 0)} / {rows.reduce((sum, row) => sum + row.qty, 0)}
        </p>
      ))}
      <h2>By pallet</h2>
      {groups((item) => item.container_id || "No pallet").map(([name, rows]) => (
        <p key={name}>
          {name}: {rows.reduce((sum, row) => sum + row.received_qty, 0)} / {rows.reduce((sum, row) => sum + row.qty, 0)}
        </p>
      ))}
      <h2>Unknown scans</h2>
      {unknown.length === 0 ? <p>None.</p> : unknown.map((row, index) => <p key={index}>{row.scanned_value || row.item_number}</p>)}
    </main>
  );
}
