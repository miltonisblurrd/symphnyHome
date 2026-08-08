"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type Staff = { id: string; name: string; role: string; active: boolean };
type Client = { id: string; name: string; phone: string | null; email: string | null; address: string | null };
type Stage = { id: string; label: string };
type Source = { id: string; label: string };

type Lead = {
  id: string;
  client_id: string | null;
  source: string;
  stage: string;
  owner_id: string | null;
  designer_id: string | null;
  contact_attempts: number;
  next_action_at: string | null;
  next_action_note: string | null;
  disqualification_reason: string | null;
  project_area: string | null;
  motivation: string | null;
  desired_timeline: string | null;
  community_ref: string | null;
  converted_job_id: string | null;
  notes: string | null;
  followUpNeeded?: boolean;
  attemptsRemaining?: number;
  client: Client | null;
  owner: Staff | null;
  designer: Staff | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  leads?: Lead[];
  staff?: Staff[];
  stages?: Stage[];
  sources?: Source[];
  maxAttempts?: number;
  lead?: Lead;
  job?: { id: string };
};

const EMPTY_FORM = {
  client_name: "",
  phone: "",
  email: "",
  address: "",
  source: "call",
  stage: "new",
  designer_id: "",
  project_area: "",
  motivation: "",
  desired_timeline: "",
  community_ref: "",
  notes: "",
  next_action_at: "",
  next_action_note: "",
};

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

export default function OpsLeadsWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [tab, setTab] = useState<string>("needs");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [junkReason, setJunkReason] = useState<Record<string, string>>({});
  const [convertContract, setConvertContract] = useState<Record<string, string>>({});
  const [nextActionDraft, setNextActionDraft] = useState<Record<string, { at: string; note: string }>>({});

  const designers = useMemo(
    () => staff.filter((s) => s.role === "designer" || s.role === "front_office" || s.role === "owner"),
    [staff],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab === "needs") params.set("needsFollowUp", "1");
      else if (tab !== "all") params.set("stage", tab);
      const response = await fetch(`/api/inspired-closets/ops/leads?${params.toString()}`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load leads.");
      setLeads(payload.leads ?? []);
      setStaff(payload.staff ?? []);
      setStages(payload.stages ?? []);
      setSources(payload.sources ?? []);
      setMaxAttempts(payload.maxAttempts ?? 5);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load leads.",
      });
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLead(override?: Partial<typeof EMPTY_FORM>) {
    setBusy(true);
    setNotice(null);
    const payload = { ...form, ...override };
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          designer_id: payload.designer_id || null,
          next_action_at: payload.next_action_at || null,
        }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!data.ok) throw new Error(data.error ?? "Failed to create lead.");
      setForm({ ...EMPTY_FORM });
      setNotice({ kind: "info", text: "Lead created. Double-enter in Community until cutover." });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create lead.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function patchLead(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ApiResponse;
      if (!data.ok) throw new Error(data.error ?? "Update failed.");
      if (body.action === "convert" && data.job) {
        setNotice({ kind: "info", text: `Converted to job. Open Billing for 50/40/10.` });
      }
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
      title="Leads"
      subtitle="Des daily board — Community double-entry until cutover. Source locked at intake."
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

      <nav className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "needs" ? styles.tabActive : ""}`}
          onClick={() => setTab("needs")}
        >
          Needs follow-up
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "all" ? styles.tabActive : ""}`}
          onClick={() => setTab("all")}
        >
          All
        </button>
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`${styles.tab} ${tab === stage.id ? styles.tabActive : ""}`}
            onClick={() => setTab(stage.id)}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
          Quick add · Instagram one-tap for Jerissa
        </p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Client name</span>
            <input
              className={styles.input}
              value={form.client_name}
              onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Phone</span>
            <input
              className={styles.input}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Source</span>
            <select
              className={styles.input}
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Designer</span>
            <select
              className={styles.input}
              value={form.designer_id}
              onChange={(e) => setForm((f) => ({ ...f, designer_id: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {designers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Area of house</span>
            <input
              className={styles.input}
              value={form.project_area}
              onChange={(e) => setForm((f) => ({ ...f, project_area: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Motivation</span>
            <input
              className={styles.input}
              value={form.motivation}
              onChange={(e) => setForm((f) => ({ ...f, motivation: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Desired timeline</span>
            <input
              className={styles.input}
              value={form.desired_timeline}
              onChange={(e) => setForm((f) => ({ ...f, desired_timeline: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Community ref</span>
            <input
              className={styles.input}
              value={form.community_ref}
              onChange={(e) => setForm((f) => ({ ...f, community_ref: e.target.value }))}
            />
          </label>
          <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.fieldLabel}>Notes</span>
            <input
              className={styles.input}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.buttonGhost}
              disabled={busy || !form.client_name.trim()}
              onClick={() => void createLead({ source: "instagram", stage: "new" })}
            >
              + Instagram lead
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={busy || !form.client_name.trim()}
              onClick={() => void createLead()}
            >
              Add lead
            </button>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        {loading ? (
          <p className={styles.empty}>Loading leads…</p>
        ) : leads.length === 0 ? (
          <p className={styles.empty}>No leads in this view.</p>
        ) : (
          <table className={styles.table} style={{ minWidth: "56rem" }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Source</th>
                <th>Stage</th>
                <th>Designer</th>
                <th>Attempts</th>
                <th>Next action</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const draft = nextActionDraft[lead.id] ?? {
                  at: lead.next_action_at?.slice(0, 16) ?? "",
                  note: lead.next_action_note ?? "",
                };
                return (
                  <tr key={lead.id} className={lead.followUpNeeded ? styles.rowHeld : undefined}>
                    <td>
                      <div>{lead.client?.name ?? "—"}</div>
                      <div className={styles.notesCell}>{lead.client?.phone ?? lead.notes ?? ""}</div>
                    </td>
                    <td>{sources.find((s) => s.id === lead.source)?.label ?? lead.source}</td>
                    <td>
                      <select
                        className={styles.input}
                        value={lead.stage}
                        disabled={busy}
                        onChange={(e) => {
                          if (e.target.value === "junk") return;
                          void patchLead({ id: lead.id, stage: e.target.value });
                        }}
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className={styles.input}
                        value={lead.designer_id ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          void patchLead({
                            id: lead.id,
                            designer_id: e.target.value || null,
                          })
                        }
                      >
                        <option value="">—</option>
                        {designers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {lead.contact_attempts}/{maxAttempts}
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: "0.25rem", minWidth: "10rem" }}>
                        <input
                          className={styles.input}
                          type="datetime-local"
                          value={draft.at}
                          onChange={(e) =>
                            setNextActionDraft((m) => ({
                              ...m,
                              [lead.id]: { ...draft, at: e.target.value },
                            }))
                          }
                        />
                        <input
                          className={styles.input}
                          placeholder="Next action note"
                          value={draft.note}
                          onChange={(e) =>
                            setNextActionDraft((m) => ({
                              ...m,
                              [lead.id]: { ...draft, note: e.target.value },
                            }))
                          }
                        />
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          disabled={busy}
                          onClick={() =>
                            void patchLead({
                              id: lead.id,
                              next_action_at: draft.at
                                ? new Date(draft.at).toISOString()
                                : null,
                              next_action_note: draft.note || null,
                              stage: lead.stage === "new" ? "follow_up" : lead.stage,
                            })
                          }
                        >
                          Save next
                        </button>
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                          {formatStamp(lead.next_action_at)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: "0.35rem", minWidth: "11rem" }}>
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          disabled={busy}
                          onClick={() => void patchLead({ id: lead.id, action: "attempt" })}
                        >
                          + Attempt
                        </button>
                        <div style={{ display: "flex", gap: "0.25rem" }}>
                          <input
                            className={styles.input}
                            placeholder="Junk reason"
                            value={junkReason[lead.id] ?? ""}
                            onChange={(e) =>
                              setJunkReason((m) => ({ ...m, [lead.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className={styles.buttonGhost}
                            disabled={busy || !(junkReason[lead.id] ?? "").trim()}
                            onClick={() =>
                              void patchLead({
                                id: lead.id,
                                stage: "junk",
                                disqualification_reason: junkReason[lead.id],
                              })
                            }
                          >
                            Junk
                          </button>
                        </div>
                        {!lead.converted_job_id ? (
                          <div style={{ display: "flex", gap: "0.25rem" }}>
                            <input
                              className={styles.input}
                              placeholder="Contract $"
                              value={convertContract[lead.id] ?? ""}
                              onChange={(e) =>
                                setConvertContract((m) => ({ ...m, [lead.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className={styles.buttonPrimary}
                              disabled={busy || !(convertContract[lead.id] ?? "").trim()}
                              onClick={() =>
                                void patchLead({
                                  id: lead.id,
                                  action: "convert",
                                  contract: convertContract[lead.id],
                                  designer_id: lead.designer_id,
                                })
                              }
                            >
                              Convert
                            </button>
                          </div>
                        ) : (
                          <span className={styles.statusBadge + " " + styles.statusPaid}>
                            Job linked
                          </span>
                        )}
                        <a
                          className={styles.buttonGhost}
                          href={`/inspired-closets/ops/schedule?leadId=${lead.id}`}
                          style={{ textAlign: "center", textDecoration: "none" }}
                        >
                          Set appointment
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </OpsShell>
  );
}
