"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type Attention = {
  id: string;
  kind: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  amountCents: number;
  jobId: string | null;
  paymentId: string | null;
  clientName: string | null;
  actionLabel: string;
};

type JobProfit = {
  jobId: string;
  clientName: string;
  stage: string;
  contractCents: number;
  collectedCents: number;
  owedCents: number;
  materialCents: number;
  materialSource: string;
  laborCents: number;
  laborSource: string;
  laborMinutes: number;
  otherFeesCents: number;
  commissionCents: number;
  spiffCents: number;
  spiffRecipient: string | null;
  spiffStatus: string;
  costsVerified: boolean;
  stowInvoiceRef: string | null;
  netProfitCents: number;
  marginPct: number | null;
  marginGateMet: boolean | null;
  notes: string | null;
};

type NeedsQb = {
  paymentId: string;
  jobId: string;
  clientName: string;
  milestone: string;
  amountPaidCents: number;
  method: string | null;
  podiumRef: string | null;
  checkRef: string | null;
  paidAt: string | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  marginGatePct?: number;
  quickbooksStatus?: string;
  summary?: {
    outstandingCents: number;
    collectedOpenJobsCents: number;
    needsQbEntry: number;
    belowGate: number;
    unverifiedCosts: number;
    spiffsPending: number;
    marginGatePct: number;
  };
  attention?: Attention[];
  needsQb?: NeedsQb[];
  jobs?: JobProfit[];
  spiffs?: JobProfit[];
  luluTips?: string[];
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function OpsFinanceWorkspace() {
  const [tab, setTab] = useState<"today" | "qb" | "jobs" | "spiffs">("today");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState<
    Record<
      string,
      {
        material: string;
        labor: string;
        fees: string;
        spiff: string;
        recipient: string;
        stow: string;
      }
    >
  >({});
  const [qbRefDraft, setQbRefDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/finance");
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load finance.");
      setData(payload);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load finance.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiResponse & { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Update failed.");
      setNotice({ kind: "info", text: "Saved." });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Update failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const gate = data?.marginGatePct ?? 45;
  const summary = data?.summary;

  return (
    <OpsShell
      title="Finance"
      subtitle={`Lulu’s desk · Podium receipts → QuickBooks books · ${gate}% spiff gate · job costs in one place`}
      actions={
        <button type="button" className={styles.buttonGhost} onClick={() => void load()}>
          Refresh
        </button>
      }
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <p className={styles.notice}>
        QuickBooks stays the books
        {data?.quickbooksStatus === "connected" ? " (connected for pulse)" : " (pulse optional)"}.
        This screen replaces your payment/due-date Excel checklist — mark QB when you’ve entered
        it, verify Stow costs, and only release spiffs when margin clears {gate}%.
      </p>

      <div className={styles.summaryRow}>
        <span>
          Customers still owe{" "}
          <span className={styles.summaryStrong}>
            {money(summary?.outstandingCents ?? 0)}
          </span>
        </span>
        <span>
          Enter in QB{" "}
          <span className={styles.summaryStrong}>{summary?.needsQbEntry ?? 0}</span>
        </span>
        <span>
          Below {gate}% <span className={styles.summaryStrong}>{summary?.belowGate ?? 0}</span>
        </span>
        <span>
          Costs unverified{" "}
          <span className={styles.summaryStrong}>{summary?.unverifiedCosts ?? 0}</span>
        </span>
        <span>
          Spiffs waiting{" "}
          <span className={styles.summaryStrong}>{summary?.spiffsPending ?? 0}</span>
        </span>
      </div>

      <nav className={styles.tabs}>
        {(
          [
            ["today", "Today"],
            ["qb", "Enter in QuickBooks"],
            ["jobs", "Job costs"],
            ["spiffs", "Spiffs"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading || !data ? (
        <div className={styles.panel}>
          <p className={styles.empty}>Loading Lulu finance desk…</p>
        </div>
      ) : tab === "today" ? (
        <div className={styles.panel}>
          <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
            Needs you first — same idea as your daily recon, without the spreadsheet hunt.
          </p>
          {(data.attention ?? []).length === 0 ? (
            <p className={styles.empty}>Nothing urgent. Nice work.</p>
          ) : (
            <table className={styles.table} style={{ minWidth: "44rem" }}>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>What</th>
                  <th>Amount</th>
                  <th>Do this</th>
                </tr>
              </thead>
              <tbody>
                {(data.attention ?? []).map((item) => (
                  <tr
                    key={item.id}
                    className={item.priority === "high" ? styles.rowHeld : undefined}
                  >
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          item.priority === "high"
                            ? styles.statusHeld
                            : item.priority === "medium"
                              ? styles.statusPayable
                              : styles.statusOpen
                        }`}
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td>
                      <div>{item.title}</div>
                      <div className={styles.notesCell}>{item.detail}</div>
                    </td>
                    <td>{money(item.amountCents)}</td>
                    <td>
                      {item.kind === "needs_qb_entry" && item.paymentId ? (
                        <button
                          type="button"
                          className={styles.buttonPrimary}
                          disabled={busy}
                          onClick={() =>
                            void patch({
                              action: "mark_qb_entered",
                              payment_id: item.paymentId,
                            })
                          }
                        >
                          Mark entered in QB
                        </button>
                      ) : item.kind === "who_owes" || item.kind === "final_unpaid" ? (
                        <Link className={styles.buttonGhost} href="/inspired-closets/ops/billing">
                          Open billing
                        </Link>
                      ) : item.jobId ? (
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          onClick={() => {
                            setTab(item.kind === "spiff_approval" ? "spiffs" : "jobs");
                            setExpanded(item.jobId);
                          }}
                        >
                          {item.actionLabel}
                        </button>
                      ) : (
                        item.actionLabel
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.luluTips?.length ? (
            <ul style={{ marginTop: "1rem", color: "var(--muted)", fontSize: "0.8rem" }}>
              {data.luluTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : tab === "qb" ? (
        <div className={styles.panel}>
          <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
            Paid in the app / Podium, not yet checked off in QuickBooks. Enter in QB, then mark
            done here (~your 5–10 min recon loop).
          </p>
          {(data.needsQb ?? []).length === 0 ? (
            <p className={styles.empty}>All recorded payments have a QuickBooks checkmark.</p>
          ) : (
            <table className={styles.table} style={{ minWidth: "48rem" }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Milestone</th>
                  <th>Paid</th>
                  <th>Method</th>
                  <th>Podium / check</th>
                  <th>QB ref (optional)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data.needsQb ?? []).map((row) => (
                  <tr key={row.paymentId}>
                    <td>{row.clientName}</td>
                    <td>{row.milestone.replace(/_/g, " ")}</td>
                    <td>{money(row.amountPaidCents)}</td>
                    <td>{row.method ?? "—"}</td>
                    <td className={styles.notesCell}>
                      {row.podiumRef || row.checkRef || "—"}
                    </td>
                    <td>
                      <input
                        className={styles.input}
                        placeholder="QB txn #"
                        value={qbRefDraft[row.paymentId] ?? ""}
                        onChange={(e) =>
                          setQbRefDraft((m) => ({ ...m, [row.paymentId]: e.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.buttonPrimary}
                        disabled={busy}
                        onClick={() =>
                          void patch({
                            action: "mark_qb_entered",
                            payment_id: row.paymentId,
                            quickbooks_ref: qbRefDraft[row.paymentId] || undefined,
                          })
                        }
                      >
                        Mark entered in QB
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : tab === "spiffs" ? (
        <div className={styles.panel}>
          <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
            Referral spiffs — only approve/pay when margin ≥ {gate}%. Blocks duplicate-pay risk
            from tracking in Excel alone.
          </p>
          {(data.spiffs ?? []).length === 0 ? (
            <p className={styles.empty}>
              No spiffs on file yet. Open a job under Job costs to add recipient + amount.
            </p>
          ) : (
            <table className={styles.table} style={{ minWidth: "48rem" }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Recipient</th>
                  <th>Amount</th>
                  <th>Margin</th>
                  <th>Gate</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data.spiffs ?? []).map((row) => (
                  <tr
                    key={row.jobId}
                    className={row.marginGateMet === false ? styles.rowHeld : undefined}
                  >
                    <td>{row.clientName}</td>
                    <td>{row.spiffRecipient ?? "—"}</td>
                    <td>{money(row.spiffCents)}</td>
                    <td>{row.marginPct == null ? "—" : `${row.marginPct}%`}</td>
                    <td>
                      {row.marginGateMet == null
                        ? "—"
                        : row.marginGateMet
                          ? "OK"
                          : `Below ${gate}%`}
                    </td>
                    <td>{row.spiffStatus}</td>
                    <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={styles.buttonGhost}
                        disabled={busy || row.marginGateMet === false}
                        onClick={() =>
                          void patch({
                            action: "set_spiff_status",
                            job_id: row.jobId,
                            spiff_status: "approved",
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={styles.buttonPrimary}
                        disabled={busy || row.marginGateMet === false}
                        onClick={() =>
                          void patch({
                            action: "set_spiff_status",
                            job_id: row.jobId,
                            spiff_status: "paid",
                          })
                        }
                      >
                        Mark paid
                      </button>
                      <button
                        type="button"
                        className={styles.buttonGhost}
                        disabled={busy}
                        onClick={() =>
                          void patch({
                            action: "set_spiff_status",
                            job_id: row.jobId,
                            spiff_status: "blocked",
                          })
                        }
                      >
                        Block
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className={styles.panel}>
          <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
            One job card: price, collected, materials, labor, fees, commission, spiff, margin vs{" "}
            {gate}%.
          </p>
          {(data.jobs ?? []).length === 0 ? (
            <p className={styles.empty}>No jobs with money yet.</p>
          ) : (
            <table className={styles.table} style={{ minWidth: "56rem" }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Stage</th>
                  <th>Contract</th>
                  <th>Collected</th>
                  <th>Owed</th>
                  <th>Margin</th>
                  <th>Costs</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data.jobs ?? []).map((job) => {
                  const open = expanded === job.jobId;
                  const draft = costDraft[job.jobId] ?? {
                    material: job.materialCents ? String(job.materialCents / 100) : "",
                    labor: job.laborCents ? String(job.laborCents / 100) : "",
                    fees: job.otherFeesCents ? String(job.otherFeesCents / 100) : "",
                    spiff: job.spiffCents ? String(job.spiffCents / 100) : "",
                    recipient: job.spiffRecipient ?? "",
                    stow: job.stowInvoiceRef ?? "",
                  };
                  return (
                    <Fragment key={job.jobId}>
                      <tr
                        className={
                          job.marginGateMet === false || !job.costsVerified
                            ? styles.rowHeld
                            : undefined
                        }
                      >
                        <td>{job.clientName}</td>
                        <td>{job.stage.replace(/_/g, " ")}</td>
                        <td>{money(job.contractCents)}</td>
                        <td>{money(job.collectedCents)}</td>
                        <td>{money(job.owedCents)}</td>
                        <td>
                          {job.marginPct == null ? "—" : `${job.marginPct}%`}
                          {job.marginGateMet === false ? (
                            <span className={styles.marginBelow}> · below gate</span>
                          ) : null}
                        </td>
                        <td>
                          {job.costsVerified ? (
                            <span className={`${styles.statusBadge} ${styles.statusPaid}`}>
                              verified
                            </span>
                          ) : (
                            <span className={`${styles.statusBadge} ${styles.statusHeld}`}>
                              unverified
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.buttonGhost}
                            onClick={() => setExpanded(open ? null : job.jobId)}
                          >
                            {open ? "Hide" : "Edit costs"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={8}>
                            <div
                              style={{
                                display: "grid",
                                gap: "0.55rem",
                                gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
                                padding: "0.5rem 0",
                              }}
                            >
                              <label className={styles.field}>
                                <span className={styles.fieldLabel}>
                                  Materials $ ({job.materialSource})
                                </span>
                                <input
                                  className={styles.input}
                                  value={draft.material}
                                  onChange={(e) =>
                                    setCostDraft((m) => ({
                                      ...m,
                                      [job.jobId]: { ...draft, material: e.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <label className={styles.field}>
                                <span className={styles.fieldLabel}>
                                  Labor $ ({job.laborSource}
                                  {job.laborMinutes
                                    ? ` · ${Math.round(job.laborMinutes / 60)}h`
                                    : ""}
                                  )
                                </span>
                                <input
                                  className={styles.input}
                                  value={draft.labor}
                                  onChange={(e) =>
                                    setCostDraft((m) => ({
                                      ...m,
                                      [job.jobId]: { ...draft, labor: e.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <label className={styles.field}>
                                <span className={styles.fieldLabel}>Other fees $</span>
                                <input
                                  className={styles.input}
                                  value={draft.fees}
                                  onChange={(e) =>
                                    setCostDraft((m) => ({
                                      ...m,
                                      [job.jobId]: { ...draft, fees: e.target.value },
                                    }))
                                  }
                                  placeholder="pallet, etc."
                                />
                              </label>
                              <label className={styles.field}>
                                <span className={styles.fieldLabel}>Spiff $</span>
                                <input
                                  className={styles.input}
                                  value={draft.spiff}
                                  onChange={(e) =>
                                    setCostDraft((m) => ({
                                      ...m,
                                      [job.jobId]: { ...draft, spiff: e.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <label className={styles.field}>
                                <span className={styles.fieldLabel}>Spiff recipient</span>
                                <input
                                  className={styles.input}
                                  value={draft.recipient}
                                  onChange={(e) =>
                                    setCostDraft((m) => ({
                                      ...m,
                                      [job.jobId]: { ...draft, recipient: e.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <label className={styles.field}>
                                <span className={styles.fieldLabel}>Stow invoice ref</span>
                                <input
                                  className={styles.input}
                                  value={draft.stow}
                                  onChange={(e) =>
                                    setCostDraft((m) => ({
                                      ...m,
                                      [job.jobId]: { ...draft, stow: e.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.35rem",
                                  alignItems: "end",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  className={styles.buttonPrimary}
                                  disabled={busy}
                                  onClick={() =>
                                    void patch({
                                      action: "save_job_costs",
                                      job_id: job.jobId,
                                      material: draft.material || null,
                                      labor: draft.labor || null,
                                      other_fees: draft.fees || "0",
                                      spiff: draft.spiff || "0",
                                      spiff_recipient: draft.recipient || null,
                                      spiff_status:
                                        draft.spiff && Number(draft.spiff) > 0
                                          ? job.spiffStatus === "none"
                                            ? "pending"
                                            : job.spiffStatus
                                          : job.spiffStatus,
                                      stow_invoice_ref: draft.stow || null,
                                    })
                                  }
                                >
                                  Save costs
                                </button>
                                <button
                                  type="button"
                                  className={styles.buttonGhost}
                                  disabled={busy || job.costsVerified}
                                  onClick={() =>
                                    void patch({
                                      action: "save_job_costs",
                                      job_id: job.jobId,
                                      costs_verified: true,
                                    })
                                  }
                                >
                                  Mark costs verified
                                </button>
                                <span className={styles.subtitle}>
                                  Net {money(job.netProfitCents)} · commission{" "}
                                  {money(job.commissionCents)}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </OpsShell>
  );
}
