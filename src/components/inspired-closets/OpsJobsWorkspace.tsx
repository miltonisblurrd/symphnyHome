"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import OpsShell from "@/components/inspired-closets/OpsShell";
import OpsProjectFile, {
  type ProjectFile,
} from "@/components/inspired-closets/OpsProjectFile";
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
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type Job = {
  id: string;
  client_id: string | null;
  lead_id?: string | null;
  designer_id: string | null;
  installer_id?: string | null;
  stage: string;
  contract_cents: number;
  deposit_cents: number;
  collected_cents: number;
  sold_date: string | null;
  install_date: string | null;
  completed_date?: string | null;
  notes: string | null;
  risk_flag: boolean;
  community_ref?: string | null;
  studio_ref?: string | null;
  receive_date?: string | null;
  visit_window?: string | null;
  job_kind?: string | null;
  proposal_url?: string | null;
  proposal_filename?: string | null;
  client: Client | null;
  designer: Staff | null;
  installer?: Staff | null;
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

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "not_complete", label: "Not Complete" },
  { id: "completed", label: "Completed" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["id"];

function isCompletedStage(stage: string): boolean {
  return stage === "closed";
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
  const searchParams = useSearchParams();
  const presetId = searchParams.get("id");
  const [stages, setStages] = useState<Stage[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stageFilter, setStageFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [listUpdatedAt, setListUpdatedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(presetId);
  const [projectFile, setProjectFile] = useState<ProjectFile | null>(null);
  const [jobMaterials, setJobMaterials] = useState<
    Array<{
      id: string;
      movement_type: string;
      qty: number;
      unit_cost_cents: number | null;
      created_at: string;
      part: { sku: string; name: string } | null;
    }>
  >([]);
  const [materialsTotal, setMaterialsTotal] = useState(0);
  const [jobLines, setJobLines] = useState<
    Array<{
      id: string;
      qty: number;
      status: string;
      ext_cents?: number;
      part: { sku: string; name: string; size?: string | null } | null;
    }>
  >([]);
  const [matTick, setMatTick] = useState(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs");
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load projects.");
      setStages(payload.stages ?? []);
      setJobs(payload.jobs ?? []);
      setStaff(payload.staff ?? []);
      setListUpdatedAt(new Date());
      setForm((current) =>
        current.designer_id || !payload.staff?.[0]?.id
          ? current
          : { ...current, designer_id: payload.staff[0].id },
      );
    } catch (error) {
      if (!opts?.silent) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load projects.",
        });
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onFocus() {
      void load({ silent: true });
    }
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 30_000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!selectedJobId) {
      setJobMaterials([]);
      setMaterialsTotal(0);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(
          `/api/inspired-closets/ops/inventory/movements?jobId=${selectedJobId}`,
        );
        const payload = (await response.json()) as {
          ok: boolean;
          movements?: Array<{
            id: string;
            movement_type: string;
            qty: number;
            unit_cost_cents: number | null;
            created_at: string;
            part: { sku: string; name: string } | null;
          }>;
        };
        if (!payload.ok) return;
        const rows = payload.movements ?? [];
        setJobMaterials(rows);
        let total = 0;
        for (const m of rows) {
          const unit = m.unit_cost_cents ?? 0;
          const qty = Math.abs(m.qty);
          if (m.movement_type === "allocate") total += qty * unit;
          if (m.movement_type === "return") total -= qty * unit;
        }
        setMaterialsTotal(total);
      } catch {
        setJobMaterials([]);
        setMaterialsTotal(0);
      }
      try {
        const matRes = await fetch(
          `/api/inspired-closets/ops/inventory/job-materials?jobId=${selectedJobId}`,
        );
        const matPayload = (await matRes.json()) as {
          ok: boolean;
          lines?: Array<{
            id: string;
            qty: number;
            status: string;
            ext_cents?: number;
            part: { sku: string; name: string; size?: string | null } | null;
          }>;
          materialsCents?: number;
        };
        if (matPayload.ok) {
          setJobLines(matPayload.lines ?? []);
          if ((matPayload.materialsCents ?? 0) > 0) {
            setMaterialsTotal(matPayload.materialsCents ?? 0);
          }
        }
      } catch {
        setJobLines([]);
      }
    })();
  }, [selectedJobId, matTick]);

  const designers = useMemo(
    () => staff.filter((member) => (member.role === "designer" || member.role === "owner") && member.active),
    [staff],
  );
  const installers = useMemo(
    () => staff.filter((member) => member.role === "installer" && member.active),
    [staff],
  );

  const loadProjectFile = useCallback(async (jobId: string) => {
    setFileLoading(true);
    try {
      const response = await fetch(`/api/inspired-closets/ops/jobs/${jobId}`);
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        job?: ProjectFile["job"];
        lead?: ProjectFile["lead"];
        appointments?: ProjectFile["appointments"];
        payments?: ProjectFile["payments"];
      };
      if (!payload.ok || !payload.job) {
        throw new Error(payload.error ?? "Failed to load project.");
      }
      setProjectFile({
        job: payload.job,
        lead: payload.lead ?? null,
        appointments: payload.appointments ?? [],
        payments: payload.payments ?? [],
      });
      setJobs((current) =>
        current.map((item) =>
          item.id === jobId
            ? {
                ...item,
                ...payload.job,
                client: payload.job.client ?? item.client,
                designer: payload.job.designer ?? item.designer,
                installer: payload.job.installer ?? item.installer,
              }
            : item,
        ),
      );
    } catch (error) {
      setProjectFile(null);
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load project.",
      });
    } finally {
      setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setProjectFile(null);
      return;
    }
    void loadProjectFile(selectedJobId);
  }, [selectedJobId, loadProjectFile]);

  useEffect(() => {
    if (!selectedJobId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedJobId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedJobId]);

  useEffect(() => {
    if (!filterOpen) return;
    function onDoc(event: MouseEvent) {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter === "completed" && !isCompletedStage(job.stage)) return false;
      if (statusFilter === "not_complete" && isCompletedStage(job.stage)) return false;
      if (stageFilter && job.stage !== stageFilter) return false;
      return true;
    });
  }, [jobs, statusFilter, stageFilter]);

  const summary = useMemo(() => {
    const open = jobs.filter((job) => !["closed", "cancelled"].includes(job.stage)).length;
    const contract = visibleJobs.reduce((sum, job) => sum + job.contract_cents, 0);
    return { total: jobs.length, open, contract, showing: visibleJobs.length };
  }, [jobs, visibleJobs]);

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
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create project.");
      setForm({ ...EMPTY_FORM, designer_id: form.designer_id, stage: form.stage });
      setNotice({ kind: "info", text: `Created project for ${form.client_name.trim()}.` });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create project.",
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
            ? { ...item, ...updated, client: item.client, designer: item.designer, installer: item.installer }
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

  async function patchJob(jobId: string, body: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, ...body }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok || !payload.job) throw new Error(payload.error ?? "Failed to update project.");
      const updated = payload.job;
      setJobs((current) =>
        current.map((item) =>
          item.id === jobId
            ? {
                ...item,
                ...updated,
                client: item.client,
                designer:
                  typeof body.designer_id === "string"
                    ? staff.find((person) => person.id === body.designer_id) ?? item.designer
                    : item.designer,
                installer:
                  body.installer_id === null
                    ? null
                    : typeof body.installer_id === "string"
                      ? staff.find((person) => person.id === body.installer_id) ?? item.installer
                      : item.installer,
              }
            : item,
        ),
      );
      if (selectedJobId === jobId) void loadProjectFile(jobId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update project.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateInstallDate(job: Job, installDate: string) {
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: job.id,
          install_date: installDate || null,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok || !payload.job) {
        throw new Error(payload.error ?? "Failed to update install date.");
      }
      const updated = payload.job;
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id
            ? { ...item, ...updated, client: item.client, designer: item.designer, installer: item.installer }
            : item,
        ),
      );
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update install date.",
      });
    }
  }

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  async function uploadProposal(file: File) {
    if (!selectedJobId) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.set("job_id", selectedJobId);
      body.set("file", file);
      const response = await fetch("/api/inspired-closets/ops/jobs/proposal", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Upload failed.");
      setNotice({ kind: "info", text: "Signed proposal saved on this project." });
      await load();
      if (selectedJobId) await loadProjectFile(selectedJobId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <OpsShell
      title="Projects"
      subtitle="Home file for every sold project — open a row to see lead, schedule, payments, people, and inventory"
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <div className={styles.listToolbar}>
        <nav className={styles.tabs} aria-label="Project views">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${statusFilter === tab.id ? styles.tabActive : ""}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.toolbarRight}>
          <p className={styles.updatedStamp}>
            {listUpdatedAt
              ? `Updated ${listUpdatedAt.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : loading
                ? "Updating…"
                : "—"}
          </p>
          <div className={styles.filterWrap} ref={filterRef}>
            <button
              type="button"
              className={`${styles.filterBtn} ${stageFilter ? styles.filterBtnActive : ""}`}
              aria-label="Filter by stage"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((open) => !open)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M2.5 4h11M4.5 8h7M6.5 12h3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {filterOpen ? (
              <div className={styles.filterMenu} role="listbox">
                <button
                  type="button"
                  className={`${styles.filterOption} ${!stageFilter ? styles.filterOptionActive : ""}`}
                  onClick={() => {
                    setStageFilter("");
                    setFilterOpen(false);
                  }}
                >
                  All stages
                </button>
                {stages.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    className={`${styles.filterOption} ${stageFilter === stage.id ? styles.filterOptionActive : ""}`}
                    onClick={() => {
                      setStageFilter(stage.id);
                      setFilterOpen(false);
                    }}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.summaryRow}>
          <span>
            <span className={styles.summaryStrong}>{summary.total}</span> projects total
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
          <p className={styles.empty}>Loading projects…</p>
        ) : visibleJobs.length === 0 ? (
          <p className={styles.empty}>
            No projects in this view. Sold intake on a lead creates the project file.
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
                <tr
                  key={job.id}
                  className={`${job.risk_flag ? styles.rowHeld : ""} ${selectedJobId === job.id ? styles.rowSelected : ""}`.trim() || undefined}
                  onClick={() => setSelectedJobId(job.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{job.client?.name ?? "—"}</td>
                  <td>{job.designer?.name ?? "—"}</td>
                  <td>
                    <select
                      className={styles.input}
                      value={job.stage}
                      onClick={(event) => event.stopPropagation()}
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
                  <td>
                    <input
                      className={styles.input}
                      type="date"
                      value={job.install_date ?? ""}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => void updateInstallDate(job, event.target.value)}
                      style={{ minWidth: "9.5rem" }}
                      title="Install date"
                    />
                  </td>
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

        {selectedJobId && (selectedJob || projectFile?.job) ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setSelectedJobId(null)}
          >
            <div
              className={`${styles.modal} ${styles.modalWide}`}
              role="dialog"
              aria-label="Project file"
              onClick={(event) => event.stopPropagation()}
            >
              <OpsProjectFile
                job={(selectedJob ?? projectFile?.job)!}
                file={projectFile}
                loading={fileLoading}
                stages={stages}
                installers={installers}
                designers={designers}
                jobLines={jobLines}
                jobMaterials={jobMaterials}
                materialsTotal={materialsTotal}
                busy={saving}
                onClose={() => setSelectedJobId(null)}
                onStage={(stage) => {
                  if (selectedJob) void updateStage(selectedJob, stage);
                }}
                onInstallDate={(value) => {
                  if (selectedJob) void updateInstallDate(selectedJob, value);
                  else if (selectedJobId) void patchJob(selectedJobId, { install_date: value || null });
                }}
                onInstaller={(id) => {
                  if (selectedJobId) void patchJob(selectedJobId, { installer_id: id });
                }}
                onDesigner={(id) => {
                  if (selectedJobId) void patchJob(selectedJobId, { designer_id: id });
                }}
                onNotes={(value) => {
                  if (selectedJobId) void patchJob(selectedJobId, { notes: value.trim() || null });
                }}
                onUploadProposal={(file) => void uploadProposal(file)}
                onStagePart={(lineId) =>
                  void (async () => {
                    await fetch("/api/inspired-closets/ops/inventory/job-materials", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "stage",
                        job_id: selectedJobId,
                        line_id: lineId,
                      }),
                    });
                    setMatTick((n) => n + 1);
                  })()
                }
                onDamagePart={(lineId) =>
                  void (async () => {
                    await fetch("/api/inspired-closets/ops/inventory/job-materials", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "damage",
                        job_id: selectedJobId,
                        line_id: lineId,
                      }),
                    });
                    setMatTick((n) => n + 1);
                  })()
                }
              />
            </div>
          </div>
        ) : selectedJobId ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setSelectedJobId(null)}
          >
            <div className={`${styles.modal} ${styles.modalWide}`} role="dialog" aria-label="Project file">
              <p className={styles.empty}>Loading project…</p>
            </div>
          </div>
        ) : null}

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
              {saving ? "Creating…" : "Add project"}
            </button>
          </div>
        </form>
      </section>
    </OpsShell>
  );
}
