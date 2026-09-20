"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import OpsShell from "@/components/inspired-closets/OpsShell";
import OpsSlipPdf from "@/components/inspired-closets/OpsSlipPdf";
import {
  formatShipDate,
  isClientJobLabel,
  isShippingChargeLine,
  shipmentFactRows,
  shipmentHeaderFacts,
  shipmentIdentity,
  shipmentPdfs,
  shipmentVendorLabel,
} from "@/lib/inspired-closets-ops-shipment-display";
import payroll from "./ops-payroll.module.css";
import styles from "./receiving.module.css";

type Item = {
  id: string;
  item_number: string;
  vendor_sku: string | null;
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
  so_number: string | null;
  needs_credit?: boolean;
};

type Stats = {
  total_qty: number;
  total_received_qty: number;
  pct: number;
  so_numbers: string[];
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

type Ship = {
  id: string;
  notice: string | null;
  ship_date: string | null;
  vendor: string;
  status: string;
  parse_error: string | null;
  source_filename: string | null;
  public_url: string | null;
  storage_path: string | null;
  parse_quality: Record<string, unknown> | null;
};

export default function OpsShipmentDetail({ shipmentId }: { shipmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [ship, setShip] = useState<Ship | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ item_number: "", description: "", qty: "1", cust_ref: "" });
  const [relinking, setRelinking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ item_number: "", qty: "", cust_ref: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/inspired-closets/ops/receiving/shipments/${shipmentId}`,
      );
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        shipment?: Ship;
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

  const lines = useMemo(
    () => items.filter((item) => !isShippingChargeLine(item)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((item) =>
      `${item.item_number} ${item.vendor_sku} ${item.cust_ref} ${item.job_name} ${item.description} ${item.container_id}`
        .toLowerCase()
        .includes(q),
    );
  }, [lines, query]);

  const jobs = stats?.by_job ?? [];
  const pallets = (stats?.by_container ?? []).filter(
    (row) => row.container_id && row.container_id !== "no-pallet",
  );
  const receivingStarted =
    (stats?.total_received_qty ?? 0) > 0 ||
    lines.some((item) => item.needs_credit || item.status === "missing" || item.status === "damaged");
  const needsJobLink = jobs.some((job) => !job.job_id);

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
    setShowAdd(false);
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
  const facts = shipmentHeaderFacts(ship.parse_quality);
  const vendor = shipmentVendorLabel(ship);
  const title = shipmentIdentity({
    notice: ship.notice,
    source_filename: ship.source_filename,
    so_numbers: stats?.so_numbers ?? [],
    job_names: jobs.map((job) => job.job_name),
    order_name: facts.order_name,
    po_number: facts.po,
  });
  const dateLabel = formatShipDate(ship.ship_date);
  const pdfs = shipmentPdfs(ship);
  const isStock =
    jobs.length === 0 &&
    (/stock/i.test(facts.po ?? "") ||
      /stock/i.test(ship.source_filename ?? "") ||
      lines.some((item) => /stock/i.test(`${item.job_name ?? ""} ${item.cust_ref ?? ""}`)));
  const factRows = shipmentFactRows({
    notice: ship.notice,
    source_filename: ship.source_filename,
    shipDate: dateLabel,
    facts,
    soNumbers: stats?.so_numbers ?? [],
    jobNames: jobs.map((job) => job.job_name),
    isStock,
  });
  const subtitle = [vendor, dateLabel].filter(Boolean).join(" · ");

  return (
    <OpsShell
      title={title}
      subtitle={subtitle}
      actions={
        <div className={`${payroll.actions} ${styles.noPrint}`}>
          <Link
            href={`/inspired-closets/ops/inventory/receiving/${shipmentId}/scan`}
            className={payroll.buttonPrimary}
          >
            Start receiving
          </Link>
          {jobs.length > 0 ? (
            <button type="button" className={payroll.buttonGhost} onClick={printLabels}>
              Print labels
            </button>
          ) : null}
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

        <div className={styles.detailTop}>
          <section className={payroll.panel}>
            <div className={`${styles.bar} ${pct >= 100 ? styles.barOk : ""}`} style={{ height: "0.7rem" }}>
              <div className={styles.barFill} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <p className={styles.progressCopy}>
              {stats?.total_received_qty ?? 0} of {stats?.total_qty ?? 0} pieces received · {pct}%
            </p>
            {factRows.length > 0 ? (
              <dl className={styles.factGrid}>
                {factRows.map((row) => (
                  <div key={`${row.label}-${row.value}`} className={styles.fact}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section className={`${payroll.panel} ${styles.pdfCard} ${styles.noPrint}`}>
            {pdfs.length === 0 ? (
              <p className={payroll.empty} style={{ margin: 0 }}>
                No slip PDF stored.
              </p>
            ) : (
              <div className={styles.pdfStack}>
                {pdfs.map((pdf) => {
                  const qs = pdf.path ? `?path=${encodeURIComponent(pdf.path)}` : "";
                  const file = `/api/inspired-closets/ops/receiving/shipments/${shipmentId}/file${qs}`;
                  const view = `/inspired-closets/ops/inventory/receiving/${shipmentId}/slip${qs}`;
                  return (
                    <div key={pdf.path || pdf.url || pdf.label}>
                      <Link className={styles.pdfPreview} href={view}>
                        <OpsSlipPdf src={file} title={pdf.label} mode="thumb" />
                        <span className={styles.pdfBadge}>PDF</span>
                        <p className={styles.pdfPreviewTitle}>{pdf.label}</p>
                        <p className={styles.pdfPreviewHint}>Open the uploaded slip</p>
                      </Link>
                      <div className={styles.pdfActions}>
                        <Link href={view} className={payroll.buttonGhost}>
                          View
                        </Link>
                        <a href={`${file}${qs ? "&" : "?"}download=1`} className={payroll.buttonGhost}>
                          Download
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {jobs.length > 0 ? (
          <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
            <p className={`${payroll.fieldLabel} ${styles.sectionLabel}`}>By job</p>
            <div className={styles.jobGrid}>
              {jobs.map((job) => {
                const jobPct =
                  job.total_qty > 0 ? Math.round((job.total_received_qty / job.total_qty) * 100) : 0;
                return (
                  <div key={job.job_name} className={styles.jobCard}>
                    <h3>{job.job_name}</h3>
                    <p>{job.job_id ? "Linked to OS job" : "No OS job match yet"}</p>
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
            {needsJobLink ? (
              <div className={payroll.formActions} style={{ justifyContent: "flex-start", marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className={payroll.buttonGhost}
                  onClick={() => void relink()}
                  disabled={relinking}
                >
                  {relinking ? "Linking…" : "Link jobs"}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {pallets.length > 0 ? (
          <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
            <p className={`${payroll.fieldLabel} ${styles.sectionLabel}`}>By pallet</p>
            <p className={payroll.empty} style={{ marginTop: 0 }}>
              {stats?.pallets_scanned ?? 0}/{stats?.pallets_total ?? 0} pallets touched
              {stats?.waiting_for_pallets
                ? " — missing-item flags wait until 70% of pallets are scanned."
                : ""}
            </p>
            <div className={styles.jobGrid}>
              {pallets.map((pallet) => {
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
        ) : null}

        {(() => {
          const creditItems = lines.filter((item) => item.needs_credit);
          if (creditItems.length === 0) return null;
          return (
            <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
              <p className={payroll.fieldLabel}>Credit later — still using these pieces</p>
              <p className={payroll.empty} style={{ marginTop: 0 }}>
                Bryant flags these while scanning. Stock stays on the job. File the vendor credit
                after the truck.
              </p>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                {creditItems.map((item) => (
                  <li key={item.id} style={{ marginBottom: "0.35rem", fontSize: "0.85rem" }}>
                    <span className={styles.mono}>{item.item_number}</span>
                    {" · "}
                    {item.job_name ?? item.cust_ref ?? "—"}
                    {item.description ? ` · ${item.description}` : ""}
                    {" "}
                    <button
                      type="button"
                      className={payroll.buttonGhost}
                      onClick={() =>
                        void patchItem(item.id, { action: "clear_credit" }).catch((err: unknown) =>
                          setNotice(err instanceof Error ? err.message : "Failed"),
                        )
                      }
                    >
                      Filed
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        {claims.length > 0 ? (
          <section className={`${payroll.panel} ${styles.noPrint}`} style={{ marginBottom: "1rem" }}>
            <p className={payroll.fieldLabel}>Credits & claims</p>
            <ul>
              {claims.map((claim) => (
                <li key={claim.id}>
                  {claim.claim_type} · qty {claim.damaged_qty} · {claim.status} — {claim.description}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
          {filtered.map((item) => {
            const jobLabel = isClientJobLabel(item.job_name)
              ? item.job_name
              : isClientJobLabel(item.cust_ref)
                ? item.cust_ref
                : null;
            const mfr =
              item.vendor_sku &&
              item.vendor_sku.replace(/\W/g, "").toLowerCase() !==
                item.item_number.replace(/\W/g, "").toLowerCase()
                ? item.vendor_sku
                : null;
            return (
              <div key={item.id} className={styles.lineRow}>
                <span className={styles.mono}>{item.item_number}</span>
                <span>
                  {jobLabel ? <strong>{jobLabel}</strong> : null}
                  <div className={styles.lineMeta}>
                    {item.description ?? "—"}
                    {mfr ? ` · Mfr ${mfr}` : ""}
                    {item.container_id ? ` · Pallet ${item.container_id}` : ""}
                  </div>
                  {editingId === item.id ? (
                    <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.45rem" }}>
                      <input
                        className={payroll.input}
                        value={editDraft.item_number}
                        onChange={(e) => setEditDraft({ ...editDraft, item_number: e.target.value })}
                        placeholder="Item #"
                      />
                      <input
                        className={payroll.input}
                        value={editDraft.description}
                        onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                        placeholder="Description"
                      />
                      <input
                        className={payroll.input}
                        value={editDraft.cust_ref}
                        onChange={(e) => setEditDraft({ ...editDraft, cust_ref: e.target.value })}
                        placeholder="Client / job as on the slip"
                      />
                      <input
                        className={payroll.input}
                        value={editDraft.qty}
                        onChange={(e) => setEditDraft({ ...editDraft, qty: e.target.value })}
                        placeholder="Qty"
                      />
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        <button
                          type="button"
                          className={payroll.buttonPrimary}
                          onClick={() =>
                            void patchItem(item.id, {
                              item_number: editDraft.item_number.trim(),
                              description: editDraft.description.trim() || null,
                              cust_ref: editDraft.cust_ref.trim() || null,
                              job_name: editDraft.cust_ref.trim() || null,
                              qty: Number(editDraft.qty) || item.qty,
                            })
                              .then(() => setEditingId(null))
                              .catch((err: unknown) =>
                                setNotice(err instanceof Error ? err.message : "Failed"),
                              )
                          }
                        >
                          Save
                        </button>
                        <button type="button" className={payroll.buttonGhost} onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </span>
                <span>
                  {item.received_qty}/{item.qty}
                </span>
                <span className={styles.lineActions}>
                  <button
                    type="button"
                    className={payroll.buttonGhost}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditDraft({
                        item_number: item.item_number,
                        qty: String(item.qty),
                        cust_ref: item.cust_ref || item.job_name || "",
                        description: item.description ?? "",
                      });
                    }}
                  >
                    Fix
                  </button>
                  {receivingStarted ? (
                    <>
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
                            action: item.needs_credit ? "clear_credit" : "credit",
                          }).catch((err: unknown) =>
                            setNotice(err instanceof Error ? err.message : "Failed"),
                          )
                        }
                      >
                        {item.needs_credit ? "Credit filed" : "Credit later"}
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            );
          })}

          {showAdd ? (
            <form className={payroll.formGrid} onSubmit={addManual} style={{ marginTop: "1rem" }}>
              <p className={payroll.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
                Add a line
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
                  placeholder="Optional"
                />
              </label>
              <div className={payroll.formActions}>
                <button type="submit" className={payroll.buttonPrimary}>
                  Add line
                </button>
                <button
                  type="button"
                  className={payroll.buttonGhost}
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className={payroll.formActions} style={{ justifyContent: "flex-start", marginTop: "0.85rem" }}>
              <button
                type="button"
                className={`${payroll.buttonGhost} ${styles.addToggle}`}
                onClick={() => setShowAdd(true)}
              >
                Add a line
              </button>
            </div>
          )}
        </section>
      </div>
    </OpsShell>
  );
}
