"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./ops-payroll.module.css";

type SummaryLine = {
  id: string;
  line_no: number | null;
  item_code: string | null;
  description: string | null;
  product_type: string | null;
  dimensions: string | null;
  finish: string | null;
  qty: number;
  total_cents: number;
  classification: string;
  part_id: string | null;
  available_qty: number;
  reserve_qty: number;
  order_qty: number;
};

type Summary = {
  id: string;
  order_name: string | null;
  order_id: string | null;
  so_number: string | null;
  ship_date: string | null;
  item_count: number;
  total_cents: number;
  source_filename: string | null;
  public_url: string | null;
  status: string;
  lines: SummaryLine[];
};

function cents(value: number): string {
  if (!value) return "—";
  return (value / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function bucketOf(line: SummaryLine): "stock" | "order" | "unmatched" {
  if (line.classification === "unmatched") return "unmatched";
  if (line.classification === "stock" || line.classification === "short") return "stock";
  return "order";
}

export default function OpsProductSummary({
  jobId,
  onChanged,
}: {
  jobId: string;
  onChanged?: () => void;
}) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/inspired-closets/ops/jobs/summaries?jobId=${jobId}`);
    const payload = (await response.json()) as {
      ok?: boolean;
      summaries?: Summary[];
      hint?: string;
      error?: string;
    };
    if (!payload.ok) throw new Error(payload.error ?? "Could not load summaries.");
    setSummaries(payload.summaries ?? []);
    setHint(payload.hint ?? null);
    if (!openId && payload.summaries?.[0]) setOpenId(payload.summaries[0].id);
  }, [jobId, openId]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "Could not load summaries.");
    });
  }, [load]);

  const open = useMemo(
    () => summaries.find((row) => row.id === openId) ?? summaries[0] ?? null,
    [summaries, openId],
  );

  async function confirm() {
    if (!open) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/inspired-closets/ops/jobs/summaries/${open.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; reserved?: number };
      if (!payload.ok) throw new Error(payload.error ?? "Could not assign stock.");
      setNotice(
        payload.reserved
          ? `Assigned ${payload.reserved} pieces from stock. Order list is what’s left.`
          : "Saved. Nothing to assign from stock — order the list.",
      );
      await load();
      onChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not assign stock.");
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    const lines = open?.lines ?? [];
    return {
      stock: lines.filter((line) => bucketOf(line) === "stock"),
      order: lines.filter((line) => bucketOf(line) === "order"),
      unmatched: lines.filter((line) => bucketOf(line) === "unmatched"),
    };
  }, [open]);

  return (
    <div>
      <p className={styles.fieldLabel}>Product summaries</p>
      <p className={styles.empty} style={{ marginTop: 0 }}>
        Frank uploads the Studio order in Receiving. The PDF lands here. The job stays short until
        Bryant scans every line.
      </p>
      {hint ? <p className={styles.empty}>{hint}</p> : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}

      {summaries.length > 1 ? (
        <div className={styles.tabs} style={{ marginBottom: "0.75rem" }}>
          {summaries.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`${styles.tab} ${row.id === open?.id ? styles.tabActive : ""}`}
              onClick={() => setOpenId(row.id)}
            >
              {row.order_name ?? row.source_filename ?? "Summary"}
              {row.status === "confirmed" ? " · assigned" : ""}
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <>
          <p className={styles.leadContact} style={{ marginBottom: "0.75rem" }}>
            {[
              open.order_name,
              open.so_number ? `SO ${open.so_number}` : null,
              open.ship_date ? `Ship ${open.ship_date}` : null,
              `${open.item_count} lines`,
              cents(open.total_cents),
              open.status,
            ]
              .filter(Boolean)
              .join(" · ")}
            {open.public_url ? (
              <>
                {" · "}
                <a href={open.public_url} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              </>
            ) : null}
          </p>

          <Bucket title={`Assign from stock · ${groups.stock.length}`} lines={groups.stock} stock />
          <Bucket title={`Order · ${groups.order.length}`} lines={groups.order} />
          <Bucket title={`Unmatched · ${groups.unmatched.length}`} lines={groups.unmatched} />

          {open.status !== "confirmed" ? (
            <div className={styles.formActions} style={{ justifyContent: "flex-start" }}>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? "Assigning…" : "Assign stock to this job"}
              </button>
            </div>
          ) : (
            <p className={styles.empty}>Stock on this summary is already assigned.</p>
          )}
        </>
      ) : (
        <p className={styles.empty}>No summaries on this job yet.</p>
      )}
    </div>
  );
}

function Bucket({
  title,
  lines,
  stock,
}: {
  title: string;
  lines: SummaryLine[];
  stock?: boolean;
}) {
  if (lines.length === 0) return null;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <p className={styles.detailSectionTitle}>{title}</p>
      <table className={styles.table} style={{ minWidth: "40rem" }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Need</th>
            {stock ? (
              <>
                <th>Have</th>
                <th>Assign</th>
                <th>Order</th>
              </>
            ) : (
              <th>Order</th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.line_no ?? "—"}</td>
              <td>
                <strong>{line.item_code || line.description}</strong>
                {line.description && line.item_code ? ` · ${line.description}` : ""}
                {line.finish ? ` · ${line.finish}` : ""}
                {line.dimensions ? ` · ${line.dimensions}` : ""}
              </td>
              <td>{line.qty}</td>
              {stock ? (
                <>
                  <td>{line.available_qty}</td>
                  <td>{line.reserve_qty}</td>
                  <td>{line.order_qty}</td>
                </>
              ) : (
                <td>{line.order_qty || line.qty}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
