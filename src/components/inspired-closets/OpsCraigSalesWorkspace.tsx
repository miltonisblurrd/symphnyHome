"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import {
  CRAIG_SOURCE_LABELS,
  PIPELINE_STATUSES,
  sourceLabel,
} from "@/lib/inspired-closets-ops-leads";
import styles from "./ops-payroll.module.css";

type Staff = { id: string; name: string; role: string };
type Lead = {
  id: string;
  source: string;
  stage: string;
  designer_id: string | null;
  pipeline_status: string | null;
  pipeline_signed: boolean;
  pipeline_rto: boolean;
  pipeline_sold_cents: number;
  pipeline_deposit_cents: number;
  pipeline_margin_bps: number | null;
  pipeline_source_label: string | null;
  created_at: string;
  updated_at: string;
  appointment?: { scheduled_at: string } | null;
  client: { id: string; name: string } | null;
  designer: Staff | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  leads?: Lead[];
  staff?: Staff[];
};

function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function dollarsToCents(value: string): number {
  const n = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export default function OpsCraigSalesWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const designers = useMemo(
    () => staff.filter((s) => s.role === "designer" || s.role === "owner"),
    [staff],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/leads?view=all");
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load.");
      setLeads(payload.leads ?? []);
      setStaff(payload.staff ?? []);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    return leads.filter((lead) => {
      const stamp = lead.appointment?.scheduled_at ?? lead.created_at;
      return stamp.slice(0, 7) === month;
    });
  }, [leads, month]);

  const byDesigner = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const d of designers) map.set(d.id, []);
    map.set("unassigned", []);
    for (const lead of rows) {
      const key = lead.designer_id && map.has(lead.designer_id) ? lead.designer_id : "unassigned";
      map.get(key)!.push(lead);
    }
    return map;
  }, [rows, designers]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Update failed.");
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
      title="Craig’s dashboard"
      subtitle="Craig’s designer monthly board — pulls from Des leads; his labels stay here"
      actions={
        <>
          <input
            className={styles.input}
            style={{ width: "auto" }}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button type="button" className={styles.buttonGhost} onClick={() => void load()}>
            Refresh
          </button>
        </>
      }
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      {loading ? (
        <p className={styles.empty}>Loading designer board…</p>
      ) : (
        [...designers, { id: "unassigned", name: "UNASSIGNED", role: "designer" as const }].map(
          (designer) => {
            const group = byDesigner.get(designer.id) ?? [];
            if (designer.id === "unassigned" && group.length === 0) return null;
            const soldTotal = group.reduce((sum, l) => sum + (l.pipeline_sold_cents ?? 0), 0);
            return (
              <div key={designer.id} className={styles.panel} style={{ marginBottom: "1rem" }}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryStrong}>{designer.name.toUpperCase()}</span>
                  <span>
                    Sold total{" "}
                    <span className={styles.summaryStrong}>{centsToDollars(soldTotal)}</span>
                  </span>
                  <span>{group.length} leads</span>
                </div>
                {group.length === 0 ? (
                  <p className={styles.empty}>No leads this month.</p>
                ) : (
                  <table className={styles.table} style={{ minWidth: "64rem" }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Sold $</th>
                        <th>%</th>
                        <th>Profit</th>
                        <th>Source</th>
                        <th>Signed</th>
                        <th>Deposit</th>
                        <th>RTO</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((lead) => {
                        const date = (
                          lead.appointment?.scheduled_at ?? lead.created_at
                        ).slice(0, 10);
                        const marginBps = lead.pipeline_margin_bps ?? 0;
                        const profit =
                          lead.pipeline_sold_cents > 0 && marginBps
                            ? Math.round((lead.pipeline_sold_cents * marginBps) / 10000)
                            : 0;
                        return (
                          <tr key={lead.id}>
                            <td>{date}</td>
                            <td>{lead.client?.name ?? "—"}</td>
                            <td>
                              <input
                                className={styles.input}
                                style={{ width: "6.5rem" }}
                                defaultValue={
                                  lead.pipeline_sold_cents
                                    ? (lead.pipeline_sold_cents / 100).toFixed(0)
                                    : ""
                                }
                                disabled={busy}
                                onBlur={(e) => {
                                  const cents = dollarsToCents(e.target.value);
                                  if (cents !== lead.pipeline_sold_cents) {
                                    void patch(lead.id, { pipeline_sold_cents: cents });
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className={styles.input}
                                style={{ width: "3.5rem" }}
                                defaultValue={
                                  lead.pipeline_margin_bps != null
                                    ? String(lead.pipeline_margin_bps / 100)
                                    : ""
                                }
                                disabled={busy}
                                onBlur={(e) => {
                                  const pct = Number(e.target.value);
                                  const bps = Number.isFinite(pct) ? Math.round(pct * 100) : null;
                                  if (bps !== lead.pipeline_margin_bps) {
                                    void patch(lead.id, { pipeline_margin_bps: bps });
                                  }
                                }}
                              />
                            </td>
                            <td>{profit ? centsToDollars(profit) : "—"}</td>
                            <td>
                              <select
                                className={styles.input}
                                value={lead.pipeline_source_label ?? ""}
                                disabled={busy}
                                onChange={(e) =>
                                  void patch(lead.id, {
                                    pipeline_source_label: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">
                                  {sourceLabel(lead.source)} (from lead)
                                </option>
                                {CRAIG_SOURCE_LABELS.map((label) => (
                                  <option key={label} value={label}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={lead.pipeline_signed}
                                disabled={busy}
                                onChange={(e) =>
                                  void patch(lead.id, { pipeline_signed: e.target.checked })
                                }
                              />
                            </td>
                            <td>
                              <input
                                className={styles.input}
                                style={{ width: "5.5rem" }}
                                defaultValue={
                                  lead.pipeline_deposit_cents
                                    ? (lead.pipeline_deposit_cents / 100).toFixed(0)
                                    : ""
                                }
                                disabled={busy}
                                onBlur={(e) => {
                                  const cents = dollarsToCents(e.target.value);
                                  if (cents !== lead.pipeline_deposit_cents) {
                                    void patch(lead.id, { pipeline_deposit_cents: cents });
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={lead.pipeline_rto}
                                disabled={busy}
                                onChange={(e) =>
                                  void patch(lead.id, { pipeline_rto: e.target.checked })
                                }
                              />
                            </td>
                            <td>
                              <select
                                className={styles.input}
                                value={lead.pipeline_status ?? ""}
                                disabled={busy}
                                onChange={(e) =>
                                  void patch(lead.id, {
                                    pipeline_status: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">—</option>
                                {PIPELINE_STATUSES.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          },
        )
      )}
    </OpsShell>
  );
}
