"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type Stage = { id: string; label: string };

type Staff = {
  id: string;
  name: string;
  role: string;
  active: boolean;
};

type Client = {
  id: string;
  name: string;
};

type Job = {
  id: string;
  client_id: string | null;
  designer_id: string | null;
  stage: string;
  contract_cents: number;
  deposit_cents: number;
  collected_cents: number;
  sold_date: string | null;
  install_date: string | null;
  completed_date: string | null;
  notes: string | null;
  risk_flag: boolean;
  client: Client | null;
  designer: Staff | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  stages?: Stage[];
  jobs?: Job[];
  staff?: Staff[];
  clients?: Client[];
  job?: Job;
  clientsCreated?: number;
  jobsCreated?: number;
  jobsLinked?: number;
  skipped?: number;
};

function centsToDisplay(cents: number): string {
  if (!cents) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dollarsInputToCents(value: string): number {
  const num = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

const EMPTY_FORM = {
  client_name: "",
  designer_id: "",
  stage: "quoted",
  contract: "",
  deposit: "",
  sold_date: "",
  notes: "",
};

export default function OpsJobsWorkspace() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs");
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load jobs.");
      setStages(payload.stages ?? []);
      setJobs(payload.jobs ?? []);
      setStaff(payload.staff ?? []);
      setForm((current) =>
        current.designer_id || !payload.staff?.[0]?.id
          ? current
          : { ...current, designer_id: payload.staff[0].id },
      );
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load jobs.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const designers = useMemo(
    () => staff.filter((member) => member.role === "designer" && member.active),
    [staff],
  );

  const visibleJobs = useMemo(() => {
    if (stageFilter === "all") return jobs;
    return jobs.filter((job) => job.stage === stageFilter);
  }, [jobs, stageFilter]);

  const summary = useMemo(() => {
    const open = jobs.filter((job) => !["closed", "cancelled"].includes(job.stage)).length;
    const contract = visibleJobs.reduce((sum, job) => sum + job.contract_cents, 0);
    return { total: jobs.length, open, contract, showing: visibleJobs.length };
  }, [jobs, visibleJobs]);

  async function syncFromPayroll() {
    setSyncing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs/sync-from-payroll", {
        method: "POST",
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Sync failed.");
      setNotice({
        kind: "info",
        text: `Synced jobs from payroll · ${payload.jobsCreated ?? 0} created · ${payload.jobsLinked ?? 0} linked · ${payload.clientsCreated ?? 0} clients`,
      });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Sync failed.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function addJob(event: React.FormEvent) {
    event.preventDefault();
    if (!form.client_name.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: form.client_name.trim(),
          designer_id: form.designer_id || null,
          stage: form.stage,
          contract_cents: dollarsInputToCents(form.contract),
          deposit_cents: dollarsInputToCents(form.deposit),
          collected_cents: dollarsInputToCents(form.deposit),
          sold_date: form.sold_date || null,
          notes: form.notes.trim() || null,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create job.");
      setForm({ ...EMPTY_FORM, designer_id: form.designer_id, stage: form.stage });
      setNotice({ kind: "info", text: `Created job for ${form.client_name.trim()}.` });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create job.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateStage(job: Job, stage: string) {
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, stage }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok || !payload.job) throw new Error(payload.error ?? "Failed to update stage.");
      const updated = payload.job;
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id
            ? { ...item, ...updated, client: item.client, designer: item.designer }
            : item,
        ),
      );
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update stage.",
      });
    }
  }

  return (
    <OpsShell
      title="Jobs"
      subtitle="Company job spine · every module hangs off these records"
      actions={
        <>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => void syncFromPayroll()}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync from payroll"}
          </button>
        </>
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
          className={`${styles.tab} ${stageFilter === "all" ? styles.tabActive : ""}`}
          onClick={() => setStageFilter("all")}
        >
          All
        </button>
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`${styles.tab} ${stageFilter === stage.id ? styles.tabActive : ""}`}
            onClick={() => setStageFilter(stage.id)}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <section className={styles.panel}>
        <div className={styles.summaryRow}>
          <span>
            <span className={styles.summaryStrong}>{summary.total}</span> jobs total
          </span>
          <span>
            <span className={styles.summaryStrong}>{summary.open}</span> open
          </span>
          <span>
            Showing <span className={styles.summaryStrong}>{summary.showing}</span>
          </span>
          <span>
            Contract{" "}
            <span className={styles.summaryStrong}>{centsToDisplay(summary.contract)}</span>
          </span>
        </div>

        {loading ? (
          <p className={styles.empty}>Loading jobs…</p>
        ) : visibleJobs.length === 0 ? (
          <p className={styles.empty}>
            No jobs yet. Click “Sync from payroll” to create jobs + clients from Craig’s imported
            workbook rows, or add a job below.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Designer</th>
                <th>Stage</th>
                <th>Sold</th>
                <th>Install</th>
                <th>Contract</th>
                <th>Deposit</th>
                <th>Collected</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => (
                <tr key={job.id} className={job.risk_flag ? styles.rowHeld : undefined}>
                  <td>{job.client?.name ?? "—"}</td>
                  <td>{job.designer?.name ?? "—"}</td>
                  <td>
                    <select
                      className={styles.input}
                      value={job.stage}
                      onChange={(event) => void updateStage(job, event.target.value)}
                      style={{ minWidth: "10rem" }}
                    >
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{job.sold_date ?? "—"}</td>
                  <td>{job.install_date ?? "—"}</td>
                  <td>{centsToDisplay(job.contract_cents)}</td>
                  <td>{centsToDisplay(job.deposit_cents)}</td>
                  <td>{centsToDisplay(job.collected_cents)}</td>
                  <td className={styles.notesCell} title={job.notes ?? undefined}>
                    {job.notes ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form className={styles.formGrid} onSubmit={addJob}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Client</span>
            <input
              className={styles.input}
              value={form.client_name}
              onChange={(event) => setForm({ ...form, client_name: event.target.value })}
              placeholder="LAST NAME"
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Designer</span>
            <select
              className={styles.input}
              value={form.designer_id}
              onChange={(event) => setForm({ ...form, designer_id: event.target.value })}
            >
              <option value="">Unassigned</option>
              {designers.map((designer) => (
                <option key={designer.id} value={designer.id}>
                  {designer.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Stage</span>
            <select
              className={styles.input}
              value={form.stage}
              onChange={(event) => setForm({ ...form, stage: event.target.value })}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sold date</span>
            <input
              className={styles.input}
              type="date"
              value={form.sold_date}
              onChange={(event) => setForm({ ...form, sold_date: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Contract</span>
            <input
              className={styles.input}
              value={form.contract}
              onChange={(event) => setForm({ ...form, contract: event.target.value })}
              placeholder="$0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Deposit</span>
            <input
              className={styles.input}
              value={form.deposit}
              onChange={(event) => setForm({ ...form, deposit: event.target.value })}
              placeholder="$0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Notes</span>
            <input
              className={styles.input}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.buttonPrimary} disabled={saving}>
              {saving ? "Creating…" : "Add job"}
            </button>
          </div>
        </form>
      </section>
    </OpsShell>
  );
}
