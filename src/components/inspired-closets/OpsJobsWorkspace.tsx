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
  canonical_id?: string | null;
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
  title?: string | null;
  proposal_url?: string | null;
  proposal_filename?: string | null;
  client_job_count?: number;
  merge_review?: {
    candidate_id: string;
    reason: string;
    suggested_name: string | null;
  } | null;
  client: Client | null;
  designer: Staff | null;
  installer?: Staff | null;
  receiving_open_qty?: number;
  receiving_received_qty?: number;
  receiving_total_qty?: number;
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

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "not_complete", label: "Not Complete" },
  { id: "completed", label: "Completed" },
] as const;

const PAGE_SIZES = [50, 100, 200] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["id"];

function isCompletedStage(stage: string): boolean {
  return stage === "closed";
}

const STAGE_RANK: Record<string, number> = {
  install_in_progress: 100,
  install_scheduled: 90,
  ordered: 80,
  job_check: 70,
  deposit_received: 60,
  deposit_pending: 50,
  final_payment: 45,
  install_complete: 40,
  quoted: 30,
  consultation: 20,
  lead: 10,
  closed: 0,
  cancelled: -1,
};

function clientKey(job: Job): string {
  return job.client?.canonical_id || job.client_id || job.id;
}

/** One row per client: most recent open job, else most recent closed. */
function pickPrimaryJob(jobs: Job[]): Job {
  const open = jobs.filter((job) => !["closed", "cancelled"].includes(job.stage));
  const pool = open.length > 0 ? open : jobs;
  return [...pool].sort((a, b) => {
    const rankDiff = (STAGE_RANK[b.stage] ?? 0) - (STAGE_RANK[a.stage] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const dateA = a.sold_date || a.install_date || "";
    const dateB = b.sold_date || b.install_date || "";
    return dateB.localeCompare(dateA);
  })[0]!;
}

function jobSearchHaystack(job: Job, stageLabel: string): string {
  return [
    job.client?.name,
    job.title,
    job.client?.phone,
    job.client?.email,
    job.client?.address,
    job.designer?.name,
    job.installer?.name,
    job.studio_ref,
    job.community_ref,
    job.notes,
    job.visit_window,
    job.job_kind,
    job.stage,
    stageLabel,
    job.sold_date,
    job.install_date,
    job.completed_date,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function OpsJobsWorkspace() {
  const searchParams = useSearchParams();
  const presetId = searchParams.get("id");
  const [stages, setStages] = useState<Stage[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stageFilter, setStageFilter] = useState("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [anchorPinned, setAnchorPinned] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const anchorSentinelRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [listUpdatedAt, setListUpdatedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(presetId);
  const [reviewOnly, setReviewOnly] = useState(false);
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
        clientJobs?: ProjectFile["clientJobs"];
        mergeCandidate?: ProjectFile["mergeCandidate"];
      };
      if (!payload.ok || !payload.job) {
        throw new Error(payload.error ?? "Failed to load project.");
      }
      const fileJob = payload.job;
      setProjectFile({
        job: fileJob,
        lead: payload.lead ?? null,
        appointments: payload.appointments ?? [],
        payments: payload.payments ?? [],
        clientJobs: payload.clientJobs ?? [],
        mergeCandidate: payload.mergeCandidate ?? null,
      });
      setJobs((current) =>
        current.map((item) =>
          item.id === jobId
            ? {
                ...item,
                ...fileJob,
                client: fileJob.client ?? item.client,
                designer: fileJob.designer ?? item.designer,
                installer: fileJob.installer ?? item.installer,
                merge_review: item.merge_review,
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
    function updatePinned() {
      const sentinel = anchorSentinelRef.current;
      if (!sentinel) return;
      setAnchorPinned(sentinel.getBoundingClientRect().bottom <= 0);
    }
    updatePinned();
    window.addEventListener("scroll", updatePinned, { passive: true });
    return () => window.removeEventListener("scroll", updatePinned);
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    function onDoc(event: MouseEvent) {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  const visibleJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = jobs.filter((job) => {
      if (reviewOnly && !job.merge_review) return false;
      if (statusFilter === "completed" && !isCompletedStage(job.stage)) return false;
      if (statusFilter === "not_complete" && isCompletedStage(job.stage)) return false;
      if (stageFilter && job.stage !== stageFilter) return false;
      if (!q) return true;
      const stageLabel = stages.find((stage) => stage.id === job.stage)?.label ?? job.stage;
      return jobSearchHaystack(job, stageLabel).includes(q);
    });

    // One row per client. Search can match any sibling; still show the primary.
    const matchedKeys = new Set(matching.map(clientKey));
    const byClient = new Map<string, Job[]>();
    for (const job of jobs) {
      const key = clientKey(job);
      if ((q || reviewOnly) && !matchedKeys.has(key)) continue;
      const list = byClient.get(key) ?? [];
      list.push(job);
      byClient.set(key, list);
    }

    const primaries: Job[] = [];
    for (const [, siblings] of byClient) {
      let pool = siblings;
      if (statusFilter === "completed") {
        pool = siblings.filter((job) => isCompletedStage(job.stage));
      } else if (statusFilter === "not_complete") {
        pool = siblings.filter((job) => !isCompletedStage(job.stage));
      }
      if (stageFilter) {
        pool = pool.filter((job) => job.stage === stageFilter);
      }
      if (pool.length === 0) continue;
      const primary = pickPrimaryJob(pool);
      primaries.push({
        ...primary,
        client_job_count: siblings.length,
      });
    }

    return primaries;
  }, [jobs, statusFilter, stageFilter, query, stages, reviewOnly]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, stageFilter, pageSize, reviewOnly]);

  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return visibleJobs.slice(start, start + pageSize);
  }, [visibleJobs, currentPage, pageSize]);
  const rangeStart = visibleJobs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, visibleJobs.length);

  const summary = useMemo(() => {
    const openJobs = jobs.filter((job) => !["closed", "cancelled"].includes(job.stage));
    const closed = jobs.filter((job) => isCompletedStage(job.stage)).length;
    const activeJobs = jobs.filter((job) => job.stage !== "cancelled");
    const contractTotal = activeJobs.reduce((sum, job) => sum + job.contract_cents, 0);
    const contractOpen = openJobs.reduce((sum, job) => sum + job.contract_cents, 0);
    const clientIds = new Set(jobs.map(clientKey));
    const reviewJobs = jobs.filter((job) => Boolean(job.merge_review));
    return {
      clients: clientIds.size,
      total: jobs.length,
      open: openJobs.length,
      closed,
      contractTotal,
      contractOpen,
      matching: visibleJobs.length,
      review: new Set(reviewJobs.map(clientKey)).size,
    };
  }, [jobs, visibleJobs]);

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

  async function resolveMerge(action: "merge" | "keep_separate", intoClientId?: string) {
    const candidateId =
      projectFile?.mergeCandidate?.id ?? selectedJob?.merge_review?.candidate_id ?? null;
    if (!candidateId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          action,
          into_client_id: intoClientId ?? null,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not resolve merge.");
      setNotice({
        kind: "info",
        text:
          action === "merge"
            ? "Clients merged. This job now sits on the confirmed client file."
            : "Kept as a separate client. The review badge is cleared.",
      });
      await load();
      if (selectedJobId) await loadProjectFile(selectedJobId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not resolve merge.",
      });
    } finally {
      setSaving(false);
    }
  }

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

      <div ref={anchorSentinelRef} className={styles.listAnchorSentinel} aria-hidden="true" />
      <div className={`${styles.listAnchor} ${anchorPinned ? styles.listAnchorPinned : ""}`}>
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
        <input
          className={`${styles.input} ${styles.toolbarSearch}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a client, designer, community, order…"
          aria-label="Find a project"
        />
      </div>

      <div className={styles.summaryRow}>
        <span>
          <span className={styles.summaryStrong}>{summary.clients}</span> clients
        </span>
        <span>
          <span className={styles.summaryStrong}>{summary.total}</span> jobs
        </span>
        <span>
          <span className={styles.summaryStrong}>{summary.open}</span> open
        </span>
        <span>
          <span className={styles.summaryStrong}>{summary.closed}</span> closed
        </span>
        <span>
          Contract total{" "}
          <span className={styles.summaryStrong}>{centsToDisplay(summary.contractTotal)}</span>
        </span>
        <span>
          Contracts open{" "}
          <span className={styles.summaryStrong}>{centsToDisplay(summary.contractOpen)}</span>
        </span>
        {summary.review > 0 ? (
          <button
            type="button"
            className={`${styles.mergeSummaryBtn} ${reviewOnly ? styles.mergeSummaryBtnActive : ""}`}
            onClick={() => setReviewOnly((current) => !current)}
          >
            <span className={styles.summaryStrong}>{summary.review}</span>{" "}
            {summary.review === 1 ? "needs merge review" : "need merge review"}
          </button>
        ) : null}
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
      </div>

      <section className={styles.panel}>
        {loading ? (
          <p className={styles.empty}>Loading projects…</p>
        ) : visibleJobs.length === 0 ? (
          <p className={styles.empty}>
            {query.trim()
              ? "No projects match that search."
              : "No projects in this view. Sold intake on a lead creates the project file."}
          </p>
        ) : (
          <>
          <div className={styles.pager}>
            <div className={styles.pagerLeft}>
              <label className={styles.pagerSize}>
                <span>Show</span>
                <select
                  className={styles.input}
                  value={pageSize}
                  onChange={(event) =>
                    setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])
                  }
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <p className={styles.pagerMeta}>
                {rangeStart}–{rangeEnd} of {summary.matching} · page {currentPage} of {pageCount}
              </p>
            </div>
            <div className={styles.pagerButtons}>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={currentPage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Designer</th>
                <th>Stage</th>
                <th>Truck</th>
                <th>Sold</th>
                <th>Install</th>
                <th>Contract</th>
                <th>Deposit</th>
                <th>Collected</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {pagedJobs.map((job) => (
                <tr
                  key={job.id}
                  className={`${job.risk_flag ? styles.rowHeld : ""} ${selectedJobId === job.id ? styles.rowSelected : ""}`.trim() || undefined}
                  onClick={() => setSelectedJobId(job.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    {job.client?.name ?? "—"}
                    {job.merge_review ? (
                      <span className={styles.mergeBadge} title={job.merge_review.suggested_name ? `May belong with ${job.merge_review.suggested_name}` : undefined}>
                        Confirm and merge with client
                      </span>
                    ) : null}
                    {(job.client_job_count ?? 1) > 1 ? (
                      <span className={styles.jobCountMark} title={`${job.client_job_count} jobs`}>
                        {" "}
                        · {job.client_job_count} jobs
                      </span>
                    ) : null}
                    {job.title ? (
                      <span className={styles.jobTitleMark}> · {job.title}</span>
                    ) : null}
                  </td>
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
                  <td>
                    {(job.receiving_total_qty ?? 0) > 0 ? (
                      <span
                        title={
                          (job.receiving_open_qty ?? 0) > 0
                            ? "Still short on the packing slip"
                            : "All slip pieces received"
                        }
                      >
                        {job.receiving_received_qty}/{job.receiving_total_qty}
                        {(job.receiving_open_qty ?? 0) > 0 ? " short" : " in"}
                      </span>
                    ) : (
                      "—"
                    )}
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
          </>
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
                onSelectJob={(jobId) => setSelectedJobId(jobId)}
                onResolveMerge={(action, intoClientId) => {
                  void resolveMerge(action, intoClientId);
                }}
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
      </section>
    </OpsShell>
  );
}
