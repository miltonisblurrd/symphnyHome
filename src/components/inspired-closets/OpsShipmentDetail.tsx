"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import OpsShell from "@/components/inspired-closets/OpsShell";
import payroll from "./ops-payroll.module.css";
import styles from "./receiving.module.css";

type Item = {
  id: string;
  item_number: string;
  cust_ref: string | null;
  job_name: string | null;
  description: string | null;
  qty: number;
  received_qty: number;
  damaged_qty: number;
  container_id: string | null;
  status: string;
  job_id: string | null;
  part_id: string | null;
};

type Stats = {
  total_qty: number;
  total_received_qty: number;
  pct: number;
  by_job: Array<{
    job_name: string;
    cust_ref: string;
    job_id: string | null;
    items: number;
    total_qty: number;
    total_received_qty: number;
    missing: number;
  }>;
  by_container: Array<{
    container_id: string;
    items: number;
    total_qty: number;
    total_received_qty: number;
  }>;
  waiting_for_pallets: boolean;
  pallets_scanned: number;
  pallets_total: number;
};

type Claim = {
  id: string;
  claim_type: string;
  description: string;
  damaged_qty: number;
  status: string;
};

export default function OpsShipmentDetail({ shipmentId }: { shipmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [ship, setShip] = useState<{
    id: string;
    notice: string | null;
    ship_date: string | null;
    vendor: string;
    status: string;
    parse_error: string | null;
    source_filename: string | null;
  } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState({ item_number: "", description: "", qty: "1", cust_ref: "" });
  const [relinking, setRelinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/inspired-closets/ops/receiving/shipments/${shipmentId}`,
      );
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        shipment?: typeof ship;
        items?: Item[];
        stats?: Stats;
        claims?: Claim[];
      };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load shipment.");
      setShip(payload.shipment ?? null);
      setItems(payload.items ?? []);
      setStats(payload.stats ?? null);
      setClaims(payload.claims ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to load shipment.");
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.item_number} ${item.cust_ref} ${item.job_name} ${item.description} ${item.container_id}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  async function patchItem(itemId: string, body: Record<string, unknown>) {
    const response = await fetch(
      `/api/inspired-closets/ops/receiving/shipments/${shipmentId}/items/${itemId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "Update failed.");
    await load();
  }

  async function addManual(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(
      `/api/inspired-closets/ops/receiving/shipments/${shipmentId}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_number: manual.item_number,
          description: manual.description,
          qty: Number(manual.qty) || 1,
          cust_ref: manual.cust_ref || null,
          job_name: manual.cust_ref || null,
        }),
      },
    );
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!payload.ok) {
      setNotice(payload.error ?? "Could not add line.");
      return;
    }
    setManual({ item_number: "", description: "", qty: "1", cust_ref: "" });
    await load();
  }

  function printLabels() {
    window.print();
  }

  async function relink() {
    setRelinking(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/inspired-closets/ops/receiving/shipments/${shipmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "relink" }),
        },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        relinked?: { linked_parts: number; linked_jobs: number; unassigned: number };
      };
      if (!payload.ok) throw new Error(payload.error ?? "Relink failed.");
      await load();
      const result = payload.relinked;
      setNotice(
        result
          ? `Linked ${result.linked_parts} parts, ${result.linked_jobs} jobs. ${result.unassigned} still have no OS job.`
          : "Relinked.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Relink failed.");
    } finally {
      setRelinking(false);
    }
  }

  if (loading && !ship) {
    return (
      <OpsShell title="Shipment">
        <p className={payroll.empty}>Loading shipment…</p>
      </OpsShell>
    );
  }
  if (!ship) {
    return (
      <OpsShell title="Shipment">
        <p className={payroll.empty}>{notice ?? "Not found."}</p>
      </OpsShell>
    );
  }

  const pct = stats?.pct ?? 0;

  return (
    <OpsShell
      title={ship.notice ?? "Shipment"}
      subtitle={`${ship.vendor} · ${ship.ship_date ?? "no ship date"} · ${ship.source_filename ?? ""}`}
      actions={
        <div className={`${payroll.actions} ${styles.noPrint}`}>
          <Link
            href={`/inspired-closets/ops/inventory/receiving/${shipmentId}/scan`}
            className={payroll.buttonPrimary}
          >
            Start receiving
          </Link>
          <button type="button" className={payroll.buttonGhost} onClick={printLabels}>
            Print labels
          </button>
          <button
            type="button"
            className={payroll.buttonGhost}
            onClick={() => void relink()}
            disabled={relinking}
          >
            {relinking ? "Linking…" : "Link to inventory / jobs"}
          </button>
          <Link href="/inspired-closets/ops/inventory/receiving" className={payroll.buttonGhost}>
            All trucks
          </Link>
        </div>
      }
    >
      <div className={styles.wrap}>
        {notice ? (
          <p className={`${payroll.notice} ${notice.toLowerCase().includes("fail") ? payroll.noticeError : ""}`}>
            {notice}
          </p>
        ) : null}
        {ship.parse_error ? <p className={`${payroll.notice} ${payroll.noticeError}`}>{ship.parse_error}</p> : null}

        <section className={payroll.panel} style={{ marginBottom: "1rem" }}>
          <div className={`${styles.bar} ${pct >= 100 ? styles.barOk : ""}`} style={{ height: "0.7rem" }}>
            <div className={styles.barFill} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p style={{ margin: "0.5rem 0 0", fontWeight: 700 }}>
            {stats?.total_received_qty ?? 0} of {stats?.total_qty ?? 0} pieces received · {pct}%
          </p>
        </section>

        <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
          <p className={payroll.fieldLabel} style={{ marginBottom: "0.65rem" }}>
            By job — this is what install-ready should mean
          </p>
          <div className={styles.jobGrid}>
            {(stats?.by_job ?? []).map((job) => {
              const jobPct =
                job.total_qty > 0 ? Math.round((job.total_received_qty / job.total_qty) * 100) : 0;
              return (
                <div key={job.cust_ref} className={styles.jobCard}>
                  <h3>{job.job_name}</h3>
                  <p>
                    {job.cust_ref}
                    {job.job_id ? " · linked to OS job" : " · no OS job match yet"}
                  </p>
                  <div className={`${styles.bar} ${jobPct >= 100 ? styles.barOk : ""}`}>
                    <div className={styles.barFill} style={{ width: `${jobPct}%` }} />
                  </div>
                  <p>
                    {job.total_received_qty}/{job.total_qty} · {jobPct}%
                    {job.missing > 0 ? ` · ${job.missing} missing` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
          <p className={payroll.fieldLabel}>By pallet</p>
          <p className={payroll.empty} style={{ marginTop: 0 }}>
            {stats?.pallets_scanned ?? 0}/{stats?.pallets_total ?? 0} pallets touched
            {stats?.waiting_for_pallets
              ? " — missing-item flags wait until 70% of pallets are scanned."
              : ""}
          </p>
          <div className={styles.jobGrid}>
            {(stats?.by_container ?? []).map((pallet) => {
              const palletPct =
                pallet.total_qty > 0
                  ? Math.round((pallet.total_received_qty / pallet.total_qty) * 100)
                  : 0;
              return (
                <div key={pallet.container_id} className={styles.jobCard}>
                  <h3 className={styles.mono}>{pallet.container_id}</h3>
                  <div className={`${styles.bar} ${palletPct >= 100 ? styles.barOk : ""}`}>
                    <div className={styles.barFill} style={{ width: `${palletPct}%` }} />
                  </div>
                  <p>
                    {pallet.total_received_qty}/{pallet.total_qty}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {claims.length > 0 ? (
          <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
            <p className={payroll.fieldLabel}>Damage claims</p>
            <ul>
              {claims.map((claim) => (
                <li key={claim.id}>
                  {claim.claim_type} · qty {claim.damaged_qty} · {claim.status} — {claim.description}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
          <form className={payroll.formGrid} onSubmit={addManual}>
            <p className={payroll.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
              Harbor / no-barcode line
            </p>
            <label className={payroll.field}>
              <span className={payroll.fieldLabel}>SKU / item #</span>
              <input
                className={payroll.input}
                value={manual.item_number}
                onChange={(e) => setManual({ ...manual, item_number: e.target.value })}
                required
              />
            </label>
            <label className={payroll.field}>
              <span className={payroll.fieldLabel}>Description</span>
              <input
                className={payroll.input}
                value={manual.description}
                onChange={(e) => setManual({ ...manual, description: e.target.value })}
              />
            </label>
            <label className={payroll.field}>
              <span className={payroll.fieldLabel}>Qty</span>
              <input
                className={payroll.input}
                value={manual.qty}
                onChange={(e) => setManual({ ...manual, qty: e.target.value })}
              />
            </label>
            <label className={payroll.field}>
              <span className={payroll.fieldLabel}>Client / job</span>
              <input
                className={payroll.input}
                value={manual.cust_ref}
                onChange={(e) => setManual({ ...manual, cust_ref: e.target.value })}
                placeholder="Wright_072426"
              />
            </label>
            <div className={payroll.formActions}>
              <button type="submit" className={payroll.buttonPrimary}>
                Add line
              </button>
            </div>
          </form>
        </section>

        <section className={`${payroll.panel} ${styles.noPrint}`}>
          <label className={payroll.field} style={{ maxWidth: "24rem" }}>
            <span className={payroll.fieldLabel}>Find a line</span>
            <input
              className={payroll.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SKU, client, pallet…"
            />
          </label>
          {filtered.map((item) => (
            <div key={item.id} className={styles.lineRow}>
              <span className={styles.mono}>{item.item_number}</span>
              <span>
                <strong>{item.job_name ?? item.cust_ref ?? "—"}</strong>
                <div style={{ fontSize: "0.78rem", opacity: 0.75 }}>
                  {item.description ?? "—"}
                  {item.part_id ? " · in inventory" : " · not in inventory yet"}
                  {item.job_id ? "" : " · no job"}
                </div>
              </span>
              <span>
                {item.received_qty}/{item.qty}
              </span>
              <span style={{ display: "flex", gap: "0.3rem" }}>
                <button
                  type="button"
                  className={payroll.buttonGhost}
                  onClick={() =>
                    void patchItem(item.id, { action: "missing" }).catch((err: unknown) =>
                      setNotice(err instanceof Error ? err.message : "Failed"),
                    )
                  }
                >
                  Missing
                </button>
                <button
                  type="button"
                  className={payroll.buttonGhost}
                  onClick={() =>
                    void patchItem(item.id, {
                      action: "damage",
                      damaged_qty: 1,
                      description: "Flagged on receive",
                    }).catch((err: unknown) =>
                      setNotice(err instanceof Error ? err.message : "Failed"),
                    )
                  }
                >
                  Damage
                </button>
              </span>
            </div>
          ))}
        </section>

        <section className={payroll.panel} style={{ display: "none" }}>
          {/* print-only labels; toggled via @media print on job cards above */}
        </section>
      </div>
    </OpsShell>
  );
}
