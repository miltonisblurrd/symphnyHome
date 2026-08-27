"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type Payment = {
  id: string;
  milestone: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  status: string;
  method: string | null;
  podium_ref: string | null;
  check_ref: string | null;
  due_at: string | null;
  link_sent_at: string | null;
  last_reminder_at: string | null;
  reminder_level: number;
};

type JobRow = {
  id: string;
  stage: string;
  contract_cents: number;
  collected_cents: number;
  install_date: string | null;
  completed_date: string | null;
  owed_cents: number;
  bucket: string;
  overdue_days: number | null;
  reminder_bucket: string | null;
  client: { id: string; name: string; phone: string | null } | null;
  payments: Payment[];
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    awaitingDeposit: number;
    install40Due: number;
    final10Due: number;
    overdue: number;
    paid: number;
  };
  jobs?: JobRow[];
  payment?: Payment;
  payments?: Payment[];
};

const MILESTONE_LABEL: Record<string, string> = {
  deposit_50: "50% deposit",
  install_40: "40% install day",
  completion_10: "10% completion",
};

function cents(n: number): string {
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OpsBillingWorkspace() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [summary, setSummary] = useState<ApiResponse["summary"] | null>(null);
  const [bucket, setBucket] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [payDraft, setPayDraft] = useState<
    Record<string, { amount: string; method: string; podium: string; check: string }>
  >({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ bucket });
      const response = await fetch(`/api/inspired-closets/ops/billing?${params.toString()}`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load billing.");
      setJobs(payload.jobs ?? []);
      setSummary(payload.summary ?? null);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load billing.",
      });
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureMilestones(jobId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensure", job_id: jobId }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create milestones.");
      setNotice({ kind: "info", text: "Payment milestones ready (50/40/10)." });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create milestones.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function patchPayment(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Update failed.");
      setNotice({
        kind: "info",
        text:
          body.action === "record" && body.milestone === "deposit_50"
            ? "50% recorded. Frank was pinged to job-check / order Stow."
            : "Payment updated. Still enter in Podium if you sent a link / check.",
      });
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

  return (
    <OpsShell
      title="Billing"
      subtitle="50 / 40 / 10 ledger. Podium stays the rail. Marking 50% paid pings Frank to job-check / order Stow."
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

      <div className={styles.summaryRow}>
        <span>
          Awaiting deposit{" "}
          <span className={styles.summaryStrong}>{summary?.awaitingDeposit ?? 0}</span>
        </span>
        <span>
          40% due <span className={styles.summaryStrong}>{summary?.install40Due ?? 0}</span>
        </span>
        <span>
          Final 10% <span className={styles.summaryStrong}>{summary?.final10Due ?? 0}</span>
        </span>
        <span>
          Overdue (2d+) <span className={styles.summaryStrong}>{summary?.overdue ?? 0}</span>
        </span>
        <span>
          Paid up <span className={styles.summaryStrong}>{summary?.paid ?? 0}</span>
        </span>
      </div>

      <nav className={styles.tabs}>
        {(
          [
            ["all", "All"],
            ["deposit", "Awaiting deposit"],
            ["install40", "40% due"],
            ["final10", "Final 10%"],
            ["overdue", "Overdue"],
            ["paid", "Paid"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${bucket === id ? styles.tabActive : ""}`}
            onClick={() => setBucket(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className={styles.panel}>
        {loading ? (
          <p className={styles.empty}>Loading billing…</p>
        ) : jobs.length === 0 ? (
          <p className={styles.empty}>
            No jobs in this bucket. Convert a lead with a contract, or ensure milestones on an
            existing job.
          </p>
        ) : (
          <table className={styles.table} style={{ minWidth: "52rem" }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Stage</th>
                <th>Contract</th>
                <th>Collected</th>
                <th>Owed</th>
                <th>Bucket</th>
                <th>Overdue</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const open = expanded === job.id;
                return (
                  <Fragment key={job.id}>
                    <tr
                      className={
                        job.overdue_days && job.overdue_days >= 2 ? styles.rowHeld : undefined
                      }
                    >
                      <td>
                        <div>{job.client?.name ?? "—"}</div>
                        <div className={styles.notesCell}>{job.client?.phone ?? ""}</div>
                      </td>
                      <td>{job.stage.replace(/_/g, " ")}</td>
                      <td>{cents(job.contract_cents)}</td>
                      <td>{cents(job.collected_cents)}</td>
                      <td>{cents(job.owed_cents)}</td>
                      <td>{job.bucket}</td>
                      <td>
                        {job.overdue_days && job.overdue_days >= 2
                          ? `${job.overdue_days}d (${job.reminder_bucket ?? "—"})`
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          onClick={() => setExpanded(open ? null : job.id)}
                        >
                          {open ? "Hide" : "Milestones"}
                        </button>
                        {job.payments.length === 0 ? (
                          <button
                            type="button"
                            className={styles.buttonPrimary}
                            disabled={busy || job.contract_cents <= 0}
                            style={{ marginLeft: "0.35rem" }}
                            onClick={() => void ensureMilestones(job.id)}
                          >
                            Create 50/40/10
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={8}>
                          <div style={{ padding: "0.75rem 0.25rem", display: "grid", gap: "0.75rem" }}>
                            {job.payments.map((payment) => {
                              const draft = payDraft[payment.id] ?? {
                                amount: String((payment.amount_due_cents / 100).toFixed(2)),
                                method: payment.method ?? "podium",
                                podium: payment.podium_ref ?? "",
                                check: payment.check_ref ?? "",
                              };
                              return (
                                <div
                                  key={payment.id}
                                  style={{
                                    border: "1px solid var(--line)",
                                    borderRadius: "0.55rem",
                                    padding: "0.75rem",
                                    display: "grid",
                                    gap: "0.5rem",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
                                  }}
                                >
                                  <div>
                                    <strong>
                                      {MILESTONE_LABEL[payment.milestone] ?? payment.milestone}
                                    </strong>
                                    <div className={styles.subtitle}>
                                      Due {formatStamp(payment.due_at)} · {payment.status}
                                    </div>
                                    <div>
                                      {cents(payment.amount_paid_cents)} /{" "}
                                      {cents(payment.amount_due_cents)}
                                    </div>
                                  </div>
                                  <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Record $</span>
                                    <input
                                      className={styles.input}
                                      value={draft.amount}
                                      onChange={(e) =>
                                        setPayDraft((m) => ({
                                          ...m,
                                          [payment.id]: { ...draft, amount: e.target.value },
                                        }))
                                      }
                                    />
                                  </label>
                                  <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Method</span>
                                    <select
                                      className={styles.input}
                                      value={draft.method}
                                      onChange={(e) =>
                                        setPayDraft((m) => ({
                                          ...m,
                                          [payment.id]: { ...draft, method: e.target.value },
                                        }))
                                      }
                                    >
                                      <option value="podium">Podium</option>
                                      <option value="check">Check</option>
                                      <option value="card">Card</option>
                                      <option value="other">Other</option>
                                    </select>
                                  </label>
                                  <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Podium ref</span>
                                    <input
                                      className={styles.input}
                                      value={draft.podium}
                                      onChange={(e) =>
                                        setPayDraft((m) => ({
                                          ...m,
                                          [payment.id]: { ...draft, podium: e.target.value },
                                        }))
                                      }
                                    />
                                  </label>
                                  <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Check ref</span>
                                    <input
                                      className={styles.input}
                                      value={draft.check}
                                      onChange={(e) =>
                                        setPayDraft((m) => ({
                                          ...m,
                                          [payment.id]: { ...draft, check: e.target.value },
                                        }))
                                      }
                                    />
                                  </label>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: "0.35rem",
                                      alignItems: "end",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className={styles.buttonPrimary}
                                      disabled={busy || payment.status === "paid"}
                                      onClick={() =>
                                        void patchPayment({
                                          id: payment.id,
                                          action: "record",
                                          amount: draft.amount,
                                          method: draft.method,
                                          podium_ref: draft.podium || null,
                                          check_ref: draft.check || null,
                                          milestone: payment.milestone,
                                        })
                                      }
                                    >
                                      Record payment
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.buttonGhost}
                                      disabled={busy}
                                      onClick={() =>
                                        void patchPayment({
                                          id: payment.id,
                                          action: "link_sent",
                                        })
                                      }
                                    >
                                      Link sent
                                      {payment.link_sent_at
                                        ? ` (${formatStamp(payment.link_sent_at)})`
                                        : ""}
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.buttonGhost}
                                      disabled={busy || payment.status === "paid"}
                                      onClick={() =>
                                        void patchPayment({
                                          id: payment.id,
                                          action: "remind",
                                        })
                                      }
                                    >
                                      Log reminder
                                      {payment.reminder_level
                                        ? ` (L${payment.reminder_level})`
                                        : ""}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
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
    </OpsShell>
  );
}
