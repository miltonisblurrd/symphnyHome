"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ops-payroll.module.css";

type PartHit = {
  id: string;
  sku: string;
  name: string;
  size: string | null;
  qty_on_hand: number;
  qty_reserved: number;
  location: string | null;
};

type Line = {
  id: string;
  qty: number;
  status: string;
  part: {
    sku: string;
    name: string;
    size?: string | null;
    qty_on_hand?: number;
    qty_reserved?: number;
  } | null;
};

function available(part: { qty_on_hand: number; qty_reserved: number }): number {
  return Math.max(0, part.qty_on_hand - part.qty_reserved);
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function OpsJobCheckModal({
  jobId,
  clientName,
  contractCents,
  initialCrew,
  initialDays,
  busy,
  onClose,
  onSaved,
}: {
  jobId: string;
  clientName: string;
  contractCents?: number;
  initialCrew?: number | null;
  initialDays?: number | null;
  busy: boolean;
  onClose: () => void;
  onSaved: (patch: { crew_size: number; estimated_install_days: number; stage?: string }) => Promise<void>;
}) {
  const [crew, setCrew] = useState(String(initialCrew || 2));
  const [days, setDays] = useState(String(initialDays || 1));
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PartHit[]>([]);
  const [qtyDraft, setQtyDraft] = useState("1");
  const [lines, setLines] = useState<Line[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadLines = useCallback(async () => {
    const response = await fetch(
      `/api/inspired-closets/ops/inventory/job-materials?jobId=${jobId}`,
    );
    const payload = (await response.json()) as { ok: boolean; lines?: Line[] };
    if (payload.ok) setLines(payload.lines ?? []);
  }, [jobId]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        const response = await fetch(
          `/api/inspired-closets/ops/inventory/parts?q=${encodeURIComponent(query.trim())}`,
        );
        const payload = (await response.json()) as { ok: boolean; parts?: PartHit[] };
        setHits((payload.parts ?? []).slice(0, 8));
      })();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  async function reserve(part: PartHit) {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/inventory/job-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reserve",
          job_id: jobId,
          part_id: part.id,
          qty: Number(qtyDraft) || 1,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not reserve.");
      setQuery("");
      setHits([]);
      setQtyDraft("1");
      await loadLines();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reserve.");
    } finally {
      setSaving(false);
    }
  }

  async function lineAction(lineId: string, action: "unreserve" | "stage" | "damage") {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/inventory/job-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, job_id: jobId, line_id: lineId }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; reorder?: boolean };
      if (!payload.ok) throw new Error(payload.error ?? "Update failed.");
      if (payload.reorder) {
        setNotice("Marked damaged. If you still need this part, reserve another size/SKU or order it.");
      }
      await loadLines();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.panel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-label="Job check"
        style={{
          maxWidth: "40rem",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          margin: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.fieldLabel} style={{ marginTop: 0 }}>
          Job check · {clientName}
          {contractCents ? ` · ${centsToDisplay(contractCents)}` : ""}
        </p>
        <p className={styles.empty} style={{ marginTop: 0 }}>
          Pull from stock here. If available is short, order it — do not delete it off the
          Stow order on a guess.
        </p>
        {notice ? (
          <p className={`${styles.notice} ${styles.noticeError}`}>{notice}</p>
        ) : null}

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Guys on site</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={crew}
              onChange={(e) => setCrew(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Estimated days</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
        </div>

        <label className={styles.field} style={{ marginTop: "0.75rem" }}>
          <span className={styles.fieldLabel}>Add part from stock (search SKU / name / size)</span>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="undermount 21"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Qty</span>
          <input
            className={styles.input}
            value={qtyDraft}
            onChange={(e) => setQtyDraft(e.target.value)}
            style={{ maxWidth: "6rem" }}
          />
        </label>
        {hits.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "0.4rem 0 0" }}>
            {hits.map((part) => {
              const avail = available(part);
              return (
                <li
                  key={part.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.35rem 0",
                    borderBottom: "1px solid rgba(0,0,0,.08)",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>
                    <strong>{part.sku}</strong>
                    {part.size ? ` · ${part.size}` : " · SIZE?"} · {part.name}
                    <br />
                    <span className={styles.empty}>
                      available {avail} · on hand {part.qty_on_hand} · bin {part.location ?? "—"}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.buttonGhost}
                    disabled={saving || avail <= 0}
                    onClick={() => void reserve(part)}
                  >
                    {avail <= 0 ? "Order — 0 available" : "Reserve"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className={styles.fieldLabel} style={{ marginTop: "1rem" }}>
          On this job
        </p>
        {lines.length === 0 ? (
          <p className={styles.empty}>Nothing reserved yet. Search a part above.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Part</th>
                <th>Qty</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.part
                      ? `${line.part.sku}${line.part.size ? ` · ${line.part.size}` : ""} · ${line.part.name}`
                      : "—"}
                  </td>
                  <td>{line.qty}</td>
                  <td>{line.status}</td>
                  <td>
                    {line.status === "reserved" ? (
                      <>
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          disabled={saving}
                          onClick={() => void lineAction(line.id, "stage")}
                        >
                          Staged
                        </button>{" "}
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          disabled={saving}
                          onClick={() => void lineAction(line.id, "damage")}
                        >
                          Damaged
                        </button>{" "}
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          disabled={saving}
                          onClick={() => void lineAction(line.id, "unreserve")}
                        >
                          Release
                        </button>
                      </>
                    ) : line.status === "staged" ? (
                      <button
                        type="button"
                        className={styles.buttonGhost}
                        disabled={saving}
                        onClick={() => void lineAction(line.id, "unreserve")}
                      >
                        Return
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className={styles.formActions} style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={busy || saving}
            onClick={() =>
              void onSaved({
                crew_size: Number(crew) || 2,
                estimated_install_days: Number(days) || 1,
                stage: "job_check",
              })
            }
          >
            Save job check
          </button>
          <button type="button" className={styles.buttonGhost} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
