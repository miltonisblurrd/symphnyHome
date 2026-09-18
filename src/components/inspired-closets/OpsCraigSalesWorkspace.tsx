"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import OpsShell from "@/components/inspired-closets/OpsShell";
import {
  DESIGNER_SHEET_ORDER,
  designerKey,
  designerLabel,
} from "@/lib/inspired-closets-ops-designer-aliases";
import { CRAIG_SOURCE_LABELS } from "@/lib/inspired-closets-ops-leads";
import { ageTone, currentJobGap, tierLabel } from "@/lib/inspired-closets-ops-tiers";
import styles from "./ops-craig.module.css";

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
  converted_job_id: string | null;
  source_raw?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client: { id: string; name: string } | null;
  designer: Staff | null;
};

type JobRow = {
  id: string;
  stage: string;
  ready_to_order?: boolean;
  archived_at?: string | null;
  sold_date: string | null;
  install_date: string | null;
  receive_date?: string | null;
  contract_cents: number;
  deposit_cents: number;
  collected_cents: number;
  completed_date?: string | null;
  summary_count?: number;
  summary_confirmed?: boolean;
  receiving_open_qty?: number;
  receiving_received_qty?: number;
  receiving_total_qty?: number;
  project_tier?: string | null;
  rto_at?: string | null;
  ordered_at?: string | null;
  deposit_received_at?: string | null;
  job_check_scheduled_at?: string | null;
  job_check_completed_at?: string | null;
  fully_received_at?: string | null;
  client: { name: string } | null;
  designer: Staff | null;
};

type SalesPayload = {
  ok?: boolean;
  year: number;
  designers: string[];
  live: Record<string, number[]>;
  last_year?: Record<string, number[]>;
  history: Record<string, Record<string, number[]>>;
  goals: Array<{ designer_name: string | null; month: number | null; goal_cents: number }>;
  hint?: string | null;
};

type Tab = "home" | "designers" | "sales" | "jobs";

const SHEET_MARK = "craig_designers_sheet";
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const STATUS_SUGGESTIONS = [
  "SOLD",
  "PROPOSED",
  "DESIGNING",
  "ON HOLD",
  "LOST",
  "SIGNED",
  "10%",
  "25% DOWN",
  "SENT PAYMENT LINK",
  "SYNCHRONY",
];

function money(cents: number, digits = 0): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function moneyShort(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${Math.round(dollars / 1_000)}k`;
  return money(cents);
}

function moneyInput(cents: number): string {
  if (!cents) return "";
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? dollars.toLocaleString("en-US")
    : dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toCents(value: string): number {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function sheetDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}-${MONTH_SHORT[Number(m) - 1] ?? m}`;
}

function monthTitle(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_LONG[Number(m) - 1] ?? m} ${y}`;
}

function thisMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function statusKind(status: string | null): "sold" | "open" | "lost" | "plain" | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (/LOST|CANCEL/.test(s)) return "lost";
  if (/SOLD|SIGNED|%|DOWN|SYNCHRONY|PETERMAN|PAYMENT/.test(s)) return "sold";
  if (/PROPOSED|DESIGNING|HOLD/.test(s)) return "open";
  return "plain";
}

function isDeskLead(lead: Lead): boolean {
  return (
    lead.source_raw === SHEET_MARK ||
    (lead.pipeline_sold_cents ?? 0) > 0 ||
    Boolean(lead.pipeline_status) ||
    lead.pipeline_signed ||
    lead.pipeline_rto
  );
}

function jobOpen(job: JobRow): boolean {
  return !job.archived_at && job.stage !== "closed" && job.stage !== "cancelled";
}

function warehouseReady(job: JobRow): boolean {
  return (job.receiving_total_qty ?? 0) > 0 && (job.receiving_open_qty ?? 0) === 0;
}

export default function OpsCraigSalesWorkspace() {
  const [tab, setTab] = useState<Tab>("home");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [sales, setSales] = useState<SalesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [month, setMonth] = useState<string>(thisMonthKey);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [savedId, setSavedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const designers = useMemo(() => {
    const people = staff.filter((s) => s.role === "designer" || s.role === "owner");
    return [...people].sort((a, b) => {
      const ai = DESIGNER_SHEET_ORDER.indexOf(designerKey(a.name));
      const bi = DESIGNER_SHEET_ORDER.indexOf(designerKey(b.name));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [staff]);

  const deskLeads = useMemo(() => leads.filter(isDeskLead), [leads]);

  const months = useMemo(() => {
    const set = new Set(deskLeads.map((lead) => lead.created_at.slice(0, 7)));
    set.add(thisMonthKey());
    return [...set].sort();
  }, [deskLeads]);
  const monthIndex = Math.max(0, months.indexOf(month));

  const loadLeads = useCallback(async () => {
    const response = await fetch("/api/inspired-closets/ops/leads?view=craig");
    const payload = (await response.json()) as { ok?: boolean; error?: string; leads?: Lead[]; staff?: Staff[] };
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load.");
    setLeads(payload.leads ?? []);
    setStaff(payload.staff ?? []);
  }, []);

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/inspired-closets/ops/jobs");
    const payload = (await response.json()) as { ok?: boolean; jobs?: JobRow[]; error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load jobs.");
    setJobs(payload.jobs ?? []);
  }, []);

  const loadSales = useCallback(async () => {
    const response = await fetch(`/api/inspired-closets/ops/sales-goals?year=${year}`);
    const payload = (await response.json()) as SalesPayload & { error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load sales.");
    setSales(payload);
  }, [year]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadLeads(), loadSales()])
      .catch((error: unknown) =>
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "Failed to load." }),
      )
      .finally(() => setLoading(false));
    void loadJobs().catch(() => undefined);
  }, [loadLeads, loadSales, loadJobs]);

  useEffect(() => {
    void loadSales().catch(() => undefined);
  }, [year, loadSales]);

  function flashSaved(id: string) {
    setSavedId(id);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedId(null), 1600);
  }

  async function patch(id: string, body: Partial<Lead> & Record<string, unknown>) {
    const before = leads;
    setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, ...body } : lead)));
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Update failed.");
      flashSaved(id);
      if ("pipeline_rto" in body) void loadJobs().catch(() => undefined);
      if ("pipeline_sold_cents" in body) void loadSales().catch(() => undefined);
    } catch (error) {
      setLeads(before);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Update failed." });
    }
  }

  async function putOnSheet(lead: Lead) {
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, action: "put_on_sheet" }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; job_id?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not put on the job sheet.");
      setLeads((prev) =>
        prev.map((row) =>
          row.id === lead.id ? { ...row, converted_job_id: payload.job_id ?? row.converted_job_id } : row,
        ),
      );
      flashSaved(lead.id);
      void loadJobs().catch(() => undefined);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not put on the job sheet.",
      });
    }
  }

  async function addCustomer(designerId: string | null, name: string) {
    const clean = name.trim();
    if (!clean) return;
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clean,
          designer_id: designerId,
          source: "other",
          stage: "new",
          source_raw: SHEET_MARK,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not add customer.");
      setAdding(null);
      await loadLeads();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not add customer." });
    }
  }

  async function markJobCheckDone(jobId: string) {
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, action: "job_check_done" }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not mark ready.");
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? { ...job, ready_to_order: true, rto_at: new Date().toISOString(), job_check_completed_at: new Date().toISOString() }
            : job,
        ),
      );
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not mark ready." });
    }
  }

  async function archiveJob(jobId: string) {
    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, archived_at: new Date().toISOString() } : job)),
    );
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, archived_at: new Date().toISOString() }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not archive.");
    } catch (error) {
      void loadJobs().catch(() => undefined);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not archive." });
    }
  }

  async function saveGoal(designerName: string, cents: number) {
    try {
      const response = await fetch("/api/inspired-closets/ops/sales-goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, designer_name: designerName, month: null, goal_cents: cents }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not save goal.");
      await loadSales();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save goal." });
    }
  }

  // ---- derived: month ----
  const monthRows = useMemo(
    () => deskLeads.filter((lead) => lead.created_at.slice(0, 7) === month),
    [deskLeads, month],
  );
  const byDesigner = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const d of designers) map.set(d.id, []);
    map.set("unassigned", []);
    for (const lead of monthRows) {
      const key = lead.designer_id && map.has(lead.designer_id) ? lead.designer_id : "unassigned";
      map.get(key)!.push(lead);
    }
    for (const group of map.values()) group.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return map;
  }, [monthRows, designers]);

  const monthIdx = Number(month.slice(5, 7)) - 1;
  const monthYear = Number(month.slice(0, 4));
  const monthSold = monthRows.reduce((sum, l) => sum + (l.pipeline_sold_cents ?? 0), 0);
  const monthDeals = monthRows.filter((l) => (l.pipeline_sold_cents ?? 0) > 0).length;
  const goalFor = (name: string) =>
    sales?.goals.find((g) => g.designer_name === name && g.month == null)?.goal_cents ?? 0;
  const teamGoal = designers.reduce((sum, d) => sum + goalFor(designerKey(d.name)), 0);
  const lastYearMonth =
    monthYear === (sales?.year ?? monthYear)
      ? designers.reduce((sum, d) => sum + (sales?.last_year?.[designerKey(d.name)]?.[monthIdx] ?? 0), 0)
      : 0;
  const sourceOptions = useMemo(() => {
    const extra = deskLeads.map((l) => l.pipeline_source_label).filter(Boolean) as string[];
    return [...new Set([...CRAIG_SOURCE_LABELS, ...extra])];
  }, [deskLeads]);

  // ---- derived: jobs ----
  const deskJobIds = useMemo(
    () => new Set(deskLeads.map((l) => l.converted_job_id).filter((id): id is string => Boolean(id))),
    [deskLeads],
  );
  const deskJobs = useMemo(() => {
    const designerByJob = new Map<string, Staff | null>();
    for (const lead of deskLeads) {
      if (lead.converted_job_id && lead.designer) designerByJob.set(lead.converted_job_id, lead.designer);
    }
    return jobs
      .filter((job) => jobOpen(job) && (job.ready_to_order || deskJobIds.has(job.id)))
      .map((job) => (job.designer ? job : { ...job, designer: designerByJob.get(job.id) ?? null }));
  }, [jobs, deskJobIds, deskLeads]);
  const jobBuckets = useMemo(() => {
    const done = deskJobs.filter((j) => j.completed_date);
    const live = deskJobs.filter((j) => !j.completed_date);
    return {
      waiting: live.filter((j) => j.ready_to_order && !j.summary_confirmed),
      ordered: live.filter((j) => j.summary_confirmed && !warehouseReady(j) && !j.install_date),
      ready: live.filter((j) => (warehouseReady(j) || j.install_date) && j.summary_confirmed),
      notRto: live.filter((j) => !j.ready_to_order),
      done,
    };
  }, [deskJobs]);
  const balanceOutstanding = deskJobs.reduce(
    (sum, j) => sum + Math.max(0, (j.contract_cents ?? 0) - (j.collected_cents ?? 0)),
    0,
  );

  // ---- derived: needs you ----
  const needs = useMemo(() => {
    const items: Array<{ id: string; text: string; who: string; action: React.ReactNode }> = [];
    for (const lead of deskLeads) {
      if ((lead.pipeline_sold_cents ?? 0) > 0 && !lead.converted_job_id) {
        items.push({
          id: `x-${lead.id}`,
          text: `${lead.client?.name ?? "Customer"} sold ${money(lead.pipeline_sold_cents)} — not on the job sheet`,
          who: lead.designer ? designerLabel(lead.designer.name) : "",
          action: (
            <button type="button" className={styles.todoAction} onClick={() => void putOnSheet(lead)}>
              Put on sheet
            </button>
          ),
        });
      } else if ((lead.pipeline_sold_cents ?? 0) > 0 && !lead.pipeline_status) {
        items.push({
          id: `s-${lead.id}`,
          text: `${lead.client?.name ?? "Customer"} has sold $ but no status`,
          who: lead.designer ? designerLabel(lead.designer.name) : "",
          action: (
            <button
              type="button"
              className={styles.todoAction}
              onClick={() => {
                setMonth(lead.created_at.slice(0, 7));
                setTab("designers");
              }}
            >
              Open row
            </button>
          ),
        });
      }
    }
    for (const job of jobBuckets.notRto) {
      const gap = currentJobGap(job);
      if (gap && gap.days >= 3) {
        items.push({
          id: `w-${job.id}`,
          text: `${job.client?.name ?? "Job"} · ${gap.label} · ${gap.days} days`,
          who: job.designer ? designerLabel(job.designer.name) : "",
          action: (
            <button type="button" className={styles.todoAction} onClick={() => void markJobCheckDone(job.id)}>
              Job check done
            </button>
          ),
        });
      }
    }
    for (const job of jobBuckets.done) {
      items.push({
        id: `a-${job.id}`,
        text: `${job.client?.name ?? "Job"} is complete — archive it?`,
        who: job.designer ? designerLabel(job.designer.name) : "",
        action: (
          <button type="button" className={styles.todoAction} onClick={() => void archiveJob(job.id)}>
            Archive
          </button>
        ),
      });
    }
    return items.slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskLeads, jobBuckets.done, jobBuckets.notRto]);

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const monthNav = (
    <div className={styles.monthNav}>
      <button
        type="button"
        className={styles.monthBtn}
        disabled={monthIndex <= 0}
        onClick={() => setMonth(months[monthIndex - 1])}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className={styles.monthLabel}>{monthTitle(month).toUpperCase()}</span>
      <button
        type="button"
        className={styles.monthBtn}
        disabled={monthIndex >= months.length - 1}
        onClick={() => setMonth(months[monthIndex + 1])}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );

  return (
    <OpsShell title="Craig’s dashboard" subtitle="One desk: the designers sheet, sales vs goals, and the job list">
      <div className={styles.wrap}>
        <div className={styles.toolbar}>
          <nav className={styles.tabs} aria-label="Craig dashboard">
            {(
              [
                ["home", "Home", needs.length],
                ["designers", "Designers", 0],
                ["sales", "Sales & Goals", 0],
                ["jobs", "Jobs", jobBuckets.waiting.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
                {count ? <span className={styles.tabCount}>{count}</span> : null}
              </button>
            ))}
          </nav>
          {tab === "home" || tab === "designers" ? monthNav : null}
          {tab === "sales" ? (
            <input
              className={styles.yearInput}
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
          ) : null}
        </div>

        {notice ? (
          <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
            {notice.text}
          </p>
        ) : null}

        {loading ? <p className={styles.empty}>Loading the desk…</p> : null}

        {/* ---------------- HOME ---------------- */}
        {!loading && tab === "home" ? (
          <>
            <div className={styles.pulseGrid}>
              <button type="button" className={styles.pulse} onClick={() => setTab("designers")}>
                <p className={styles.pulseLabel}>Sold · {MONTH_LONG[monthIdx]}</p>
                <p className={`${styles.pulseValue} ${styles.pulseValueRed}`}>{moneyShort(monthSold)}</p>
                <p className={styles.pulseSub}>
                  {teamGoal ? (
                    <>
                      <span className={monthSold >= teamGoal ? styles.pulseUp : styles.pulseDown}>
                        {Math.round((monthSold / teamGoal) * 100)}%
                      </span>{" "}
                      of {moneyShort(teamGoal)} goal
                    </>
                  ) : (
                    "No goals set"
                  )}
                </p>
              </button>
              <button type="button" className={styles.pulse} onClick={() => setTab("sales")}>
                <p className={styles.pulseLabel}>Last year · {MONTH_SHORT[monthIdx]}</p>
                <p className={styles.pulseValue}>{lastYearMonth ? moneyShort(lastYearMonth) : "—"}</p>
                <p className={styles.pulseSub}>
                  {lastYearMonth ? (
                    <span className={monthSold >= lastYearMonth ? styles.pulseUp : styles.pulseDown}>
                      {monthSold >= lastYearMonth ? "+" : "−"}
                      {moneyShort(Math.abs(monthSold - lastYearMonth))} vs LY
                    </span>
                  ) : (
                    "No history"
                  )}
                </p>
              </button>
              <button type="button" className={styles.pulse} onClick={() => setTab("designers")}>
                <p className={styles.pulseLabel}>Deals sold</p>
                <p className={styles.pulseValue}>{monthDeals}</p>
                <p className={styles.pulseSub}>{monthRows.length} customers on the sheet</p>
              </button>
              <button type="button" className={styles.pulse} onClick={() => setTab("jobs")}>
                <p className={styles.pulseLabel}>Waiting on Frank</p>
                <p className={`${styles.pulseValue} ${jobBuckets.waiting.length ? styles.pulseValueRed : ""}`}>
                  {jobBuckets.waiting.length}
                </p>
                <p className={styles.pulseSub}>RTO, no product summary yet</p>
              </button>
              <button type="button" className={styles.pulse} onClick={() => setTab("jobs")}>
                <p className={styles.pulseLabel}>Warehouse ready</p>
                <p className={styles.pulseValue}>{jobBuckets.ready.length}</p>
                <p className={styles.pulseSub}>{jobBuckets.ordered.length} still coming in</p>
              </button>
              <button type="button" className={styles.pulse} onClick={() => setTab("jobs")}>
                <p className={styles.pulseLabel}>Balance out</p>
                <p className={styles.pulseValue}>{moneyShort(balanceOutstanding)}</p>
                <p className={styles.pulseSub}>{deskJobs.length} open jobs</p>
              </button>
            </div>

            <div className={styles.homeGrid}>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>Designers · {MONTH_LONG[monthIdx]}</h2>
                  <button type="button" className={styles.linkBtn} onClick={() => setTab("designers")}>
                    Open sheet →
                  </button>
                </div>
                <div className={styles.board}>
                  {designers
                    .map((d) => {
                      const group = byDesigner.get(d.id) ?? [];
                      const sold = group.reduce((s, l) => s + (l.pipeline_sold_cents ?? 0), 0);
                      return { d, sold, goal: goalFor(designerKey(d.name)), count: group.length };
                    })
                    .filter((row) => row.sold > 0 || row.goal > 0 || row.count > 0)
                    .sort((a, b) => b.sold - a.sold)
                    .map(({ d, sold, goal, count }) => {
                      const pct = goal ? Math.min(100, Math.round((sold / goal) * 100)) : 0;
                      return (
                        <div key={d.id} className={styles.boardRow}>
                          <span className={styles.boardName}>{designerLabel(d.name)}</span>
                          <div className={styles.bar}>
                            <div
                              className={`${styles.barFill} ${sold >= goal && goal ? styles.barFillOver : ""}`}
                              style={{ width: `${goal ? pct : sold ? 100 : 0}%` }}
                            />
                          </div>
                          <span className={styles.boardMoney}>{sold ? moneyShort(sold) : "—"}</span>
                          <span className={styles.boardGoal}>
                            {goal ? `${pct}% · ${moneyShort(goal)}` : `${count} rows`}
                          </span>
                        </div>
                      );
                    })}
                  {monthRows.length === 0 ? <p className={styles.empty}>Nothing on the sheet yet this month.</p> : null}
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>Needs you</h2>
                  <p className={styles.cardHint}>{needs.length ? `${needs.length} items` : "All clear"}</p>
                </div>
                {needs.length === 0 ? (
                  <p className={styles.empty}>Nothing waiting. Sheet is clean.</p>
                ) : (
                  <ul className={styles.todo}>
                    {needs.map((item) => (
                      <li key={item.id} className={styles.todoItem}>
                        <span>
                          {item.text}
                          {item.who ? <span className={styles.todoWho}>{item.who}</span> : null}
                        </span>
                        {item.action}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {jobBuckets.waiting.length ? (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>Ready to order — Frank’s queue</h2>
                  <button type="button" className={styles.linkBtn} onClick={() => setTab("jobs")}>
                    All jobs →
                  </button>
                </div>
                <ul className={styles.todo}>
                  {jobBuckets.waiting.slice(0, 8).map((job) => (
                    <li key={job.id} className={styles.todoItem}>
                      <span>
                        <Link href={`/inspired-closets/ops/projects?id=${job.id}`} className={styles.rowLink}>
                          {job.client?.name ?? "Job"}
                        </Link>
                        {job.designer ? <span className={styles.todoWho}>{designerLabel(job.designer.name)}</span> : null}
                        <span className={styles.todoWho}>{money(job.contract_cents)}</span>
                      </span>
                      <span className={styles.todoWho}>
                        {job.summary_count ? "Summary uploaded, not confirmed" : "No summary yet"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {/* ---------------- DESIGNERS ---------------- */}
        {!loading && tab === "designers" ? (
          <div className={styles.sheetWrap}>
            <table className={`${styles.sheet} ${styles.frozen}`}>
              <thead>
                <tr>
                  <th style={{ width: "4.5rem" }}>Date</th>
                  <th style={{ minWidth: "12rem" }}>Customer</th>
                  <th className={styles.num} style={{ width: "6.5rem" }}>
                    Sold $
                  </th>
                  <th className={styles.num} style={{ width: "4rem" }}>
                    %
                  </th>
                  <th className={styles.num} style={{ width: "6rem" }}>
                    Profit
                  </th>
                  <th style={{ width: "9rem" }}>Source</th>
                  <th className={styles.cellCenter} style={{ width: "3.5rem" }}>
                    Signed
                  </th>
                  <th className={styles.num} style={{ width: "6rem" }}>
                    Deposit
                  </th>
                  <th className={styles.cellCenter} style={{ width: "5rem" }}>
                    X
                  </th>
                  <th className={styles.cellCenter} style={{ width: "3.5rem" }}>
                    RTO
                  </th>
                  <th style={{ width: "9rem" }}>Status</th>
                  <th style={{ minWidth: "12rem" }}>Notes</th>
                  <th style={{ width: "3.5rem" }} />
                </tr>
              </thead>
              <tbody>
                {[...designers, { id: "unassigned", name: "UNASSIGNED", role: "designer" as const }].map(
                  (designer) => {
                    const group = byDesigner.get(designer.id) ?? [];
                    if (designer.id === "unassigned" && group.length === 0) return null;
                    const sold = group.reduce((s, l) => s + (l.pipeline_sold_cents ?? 0), 0);
                    const isCollapsed = collapsed.has(designer.id);
                    return (
                      <GroupRows
                        key={designer.id}
                        designerId={designer.id}
                        name={designerLabel(designer.name)}
                        group={group}
                        sold={sold}
                        collapsed={isCollapsed}
                        onToggle={() => toggleGroup(designer.id)}
                        adding={adding === designer.id}
                        onStartAdd={() => setAdding(designer.id)}
                        onCancelAdd={() => setAdding(null)}
                        onAdd={(name) => addCustomer(designer.id === "unassigned" ? null : designer.id, name)}
                        savedId={savedId}
                        sourceOptions={sourceOptions}
                        onPatch={patch}
                        onPutOnSheet={putOnSheet}
                      />
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* ---------------- SALES ---------------- */}
        {!loading && tab === "sales" && sales ? (
          <div className={styles.sheetWrap}>
            <table className={styles.sheet}>
              <thead>
                <tr>
                  <th>Designer</th>
                  {MONTH_SHORT.map((label, i) => (
                    <th
                      key={label}
                      className={`${styles.num} ${
                        year === new Date().getFullYear() && i === new Date().getMonth() ? styles.thisMonth : ""
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                  <th className={styles.num}>Year</th>
                  <th className={styles.num}>Last year</th>
                  <th className={styles.num}>Goal / mo</th>
                  <th>Pace</th>
                </tr>
              </thead>
              <tbody>
                {(sales.designers ?? []).map((name) => {
                  const monthsSold = sales.live[name] ?? Array(12).fill(0);
                  const yearTotal = monthsSold.reduce((s, n) => s + n, 0);
                  const last = (sales.last_year?.[name] ?? []).reduce((s, n) => s + n, 0);
                  const goal = goalFor(name);
                  const elapsed =
                    year < new Date().getFullYear() ? 12 : year > new Date().getFullYear() ? 0 : new Date().getMonth() + 1;
                  const target = goal * elapsed;
                  const gap = yearTotal - target;
                  const pct = target ? Math.min(100, Math.round((yearTotal / target) * 100)) : 0;
                  if (!yearTotal && !last && !goal) return null;
                  return (
                    <tr key={name}>
                      <td className={styles.cellStrong}>{designerLabel(name)}</td>
                      {monthsSold.map((cents, i) => (
                        <td
                          key={`${name}-${i}`}
                          className={`${styles.num} ${styles.cellText} ${
                            year === new Date().getFullYear() && i === new Date().getMonth() ? styles.thisMonth : ""
                          }`}
                        >
                          {cents ? money(cents) : <span style={{ color: "rgba(0,0,0,0.25)" }}>—</span>}
                        </td>
                      ))}
                      <td className={`${styles.num} ${styles.cellStrong}`}>{yearTotal ? money(yearTotal) : "—"}</td>
                      <td className={`${styles.num} ${styles.cellMuted}`}>{last ? money(last) : "—"}</td>
                      <td className={styles.num}>
                        <input
                          className={`${styles.cell} ${styles.cellNum}`}
                          defaultValue={moneyInput(goal)}
                          placeholder="—"
                          onBlur={(e) => {
                            const cents = toCents(e.target.value);
                            if (cents !== goal) void saveGoal(name, cents);
                          }}
                        />
                      </td>
                      <td className={styles.cellText}>
                        {target ? (
                          <>
                            <span className={`${styles.pace} ${gap >= 0 ? styles.paceOk : styles.paceBehind}`}>
                              {gap >= 0 ? `+${moneyShort(gap)} ahead` : `${moneyShort(gap)} behind`}
                            </span>
                            <div className={styles.miniBar}>
                              <div
                                className={`${styles.barFill} ${gap >= 0 ? styles.barFillOver : ""}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <span style={{ color: "rgba(0,0,0,0.3)", fontSize: "0.72rem" }}>set a goal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className={styles.totalRow}>
                  <td className={styles.cellText}>TEAM</td>
                  {MONTH_SHORT.map((_, i) => {
                    const cents = (sales.designers ?? []).reduce((s, n) => s + (sales.live[n]?.[i] ?? 0), 0);
                    return (
                      <td key={`t-${i}`} className={`${styles.num} ${styles.cellText}`}>
                        {cents ? money(cents) : "—"}
                      </td>
                    );
                  })}
                  <td className={`${styles.num} ${styles.cellText}`}>
                    {money((sales.designers ?? []).reduce((s, n) => s + (sales.live[n] ?? []).reduce((a, b) => a + b, 0), 0))}
                  </td>
                  <td className={`${styles.num} ${styles.cellText}`}>
                    {money(
                      (sales.designers ?? []).reduce(
                        (s, n) => s + (sales.last_year?.[n] ?? []).reduce((a, b) => a + b, 0),
                        0,
                      ),
                    )}
                  </td>
                  <td className={`${styles.num} ${styles.cellText}`}>{teamGoal ? money(teamGoal) : "—"}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/* ---------------- JOBS ---------------- */}
        {!loading && tab === "jobs" ? (
          <>
            <JobSection
              title="Waiting on Frank"
              hint="RTO checked, product summary not confirmed"
              red
              jobs={jobBuckets.waiting}
              onArchive={archiveJob}
            />
            <JobSection
              title="Ordered · coming in"
              hint="Summary confirmed, parts still landing"
              jobs={jobBuckets.ordered}
              onArchive={archiveJob}
            />
            <JobSection
              title="Ready · scheduled"
              hint="Warehouse ready or on the calendar"
              jobs={jobBuckets.ready}
              onArchive={archiveJob}
            />
            <JobSection
              title="Sold · not ready to order"
              hint="Waiting on the client or designer to finish job check"
              jobs={jobBuckets.notRto}
              onArchive={archiveJob}
              onReady={markJobCheckDone}
            />
            <JobSection
              title="Complete · archive when paid"
              hint="Installer marked done"
              jobs={jobBuckets.done}
              onArchive={archiveJob}
            />
          </>
        ) : null}
      </div>
    </OpsShell>
  );
}

/* ---------------- Designer block ---------------- */

function GroupRows({
  designerId,
  name,
  group,
  sold,
  collapsed,
  onToggle,
  adding,
  onStartAdd,
  onCancelAdd,
  onAdd,
  savedId,
  sourceOptions,
  onPatch,
  onPutOnSheet,
}: {
  designerId: string;
  name: string;
  group: Lead[];
  sold: number;
  collapsed: boolean;
  onToggle: () => void;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onAdd: (name: string) => void;
  savedId: string | null;
  sourceOptions: string[];
  onPatch: (id: string, body: Partial<Lead> & Record<string, unknown>) => void;
  onPutOnSheet: (lead: Lead) => void;
}) {
  return (
    <>
      <tr className={styles.groupRow}>
        <td colSpan={13}>
          <div className={styles.groupCell}>
            <button type="button" className={styles.groupToggle} onClick={onToggle} aria-label="Toggle">
              {collapsed ? "▸" : "▾"}
            </button>
            <span className={styles.groupName}>{name}</span>
            <span className={styles.groupMeta}>
              <span className={styles.groupMoney}>{sold ? money(sold, 2) : "$0.00"}</span>
              {" · "}
              {group.length} {group.length === 1 ? "customer" : "customers"}
            </span>
          </div>
        </td>
      </tr>
      {!collapsed
        ? group.map((lead) => (
            <SheetRow
              key={lead.id}
              lead={lead}
              saved={savedId === lead.id}
              sourceOptions={sourceOptions}
              onPatch={onPatch}
              onPutOnSheet={onPutOnSheet}
            />
          ))
        : null}
      {!collapsed ? (
        <tr className={styles.addRow}>
          <td colSpan={13}>
            {adding ? (
              <input
                autoFocus
                className={styles.cell}
                placeholder="Customer name — Enter to add, Esc to cancel"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAdd((e.target as HTMLInputElement).value);
                  if (e.key === "Escape") onCancelAdd();
                }}
                onBlur={(e) => {
                  if (!e.target.value.trim()) onCancelAdd();
                }}
              />
            ) : (
              <button type="button" className={styles.addBtn} onClick={onStartAdd} data-designer={designerId}>
                + Add customer
              </button>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SheetRow({
  lead,
  saved,
  sourceOptions,
  onPatch,
  onPutOnSheet,
}: {
  lead: Lead;
  saved: boolean;
  sourceOptions: string[];
  onPatch: (id: string, body: Partial<Lead> & Record<string, unknown>) => void;
  onPutOnSheet: (lead: Lead) => void;
}) {
  const marginBps = lead.pipeline_margin_bps ?? 0;
  const profit =
    lead.pipeline_sold_cents > 0 && marginBps ? Math.round((lead.pipeline_sold_cents * marginBps) / 10000) : 0;
  const kind = statusKind(lead.pipeline_status);

  return (
    <tr className={lead.pipeline_rto ? styles.rtoRow : undefined}>
      <td className={styles.cellMuted}>{sheetDate(lead.created_at)}</td>
      <td className={styles.cellStrong}>{lead.client?.name ?? "—"}</td>
      <td>
        <input
          className={`${styles.cell} ${styles.cellNum}`}
          key={`sold-${lead.pipeline_sold_cents}`}
          defaultValue={moneyInput(lead.pipeline_sold_cents)}
          placeholder="—"
          inputMode="decimal"
          onBlur={(e) => {
            const cents = toCents(e.target.value);
            if (cents !== lead.pipeline_sold_cents) onPatch(lead.id, { pipeline_sold_cents: cents });
          }}
        />
      </td>
      <td>
        <input
          className={`${styles.cell} ${styles.cellNum}`}
          key={`pct-${lead.pipeline_margin_bps}`}
          defaultValue={lead.pipeline_margin_bps != null ? String(lead.pipeline_margin_bps / 100) : ""}
          placeholder="—"
          inputMode="decimal"
          onBlur={(e) => {
            const pct = Number(e.target.value);
            const bps = e.target.value.trim() && Number.isFinite(pct) ? Math.round(pct * 100) : null;
            if (bps !== lead.pipeline_margin_bps) onPatch(lead.id, { pipeline_margin_bps: bps });
          }}
        />
      </td>
      <td className={`${styles.num} ${styles.cellMuted}`}>{profit ? money(profit) : ""}</td>
      <td>
        <input
          className={styles.cell}
          key={`src-${lead.pipeline_source_label}`}
          list="craig-sources"
          defaultValue={lead.pipeline_source_label ?? ""}
          placeholder="—"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (lead.pipeline_source_label ?? "")) onPatch(lead.id, { pipeline_source_label: next || null });
          }}
        />
        <datalist id="craig-sources">
          {sourceOptions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      </td>
      <td>
        <button
          type="button"
          className={`${styles.check} ${lead.pipeline_signed ? styles.checkOn : ""}`}
          onClick={() => onPatch(lead.id, { pipeline_signed: !lead.pipeline_signed })}
          aria-label="Signed"
        >
          <span className={styles.checkBox}>{lead.pipeline_signed ? "✓" : ""}</span>
        </button>
      </td>
      <td>
        <input
          className={`${styles.cell} ${styles.cellNum}`}
          key={`dep-${lead.pipeline_deposit_cents}`}
          defaultValue={moneyInput(lead.pipeline_deposit_cents)}
          placeholder="—"
          inputMode="decimal"
          onBlur={(e) => {
            const cents = toCents(e.target.value);
            if (cents !== lead.pipeline_deposit_cents) onPatch(lead.id, { pipeline_deposit_cents: cents });
          }}
        />
      </td>
      <td className={styles.cellCenter}>
        {lead.converted_job_id ? (
          <Link href={`/inspired-closets/ops/projects?id=${lead.converted_job_id}`} className={styles.onSheet}>
            ✓ Sheet
          </Link>
        ) : (
          <button type="button" className={styles.check} onClick={() => onPutOnSheet(lead)} aria-label="Put on job sheet">
            <span className={styles.checkBox} />
          </button>
        )}
      </td>
      <td>
        <button
          type="button"
          className={`${styles.check} ${styles.checkRto} ${lead.pipeline_rto ? styles.checkOn : ""}`}
          onClick={() => onPatch(lead.id, { pipeline_rto: !lead.pipeline_rto })}
          aria-label="Ready to order"
        >
          <span className={styles.checkBox}>{lead.pipeline_rto ? "✓" : ""}</span>
        </button>
      </td>
      <td className={styles.statusCell}>
        <input
          className={styles.cell}
          key={`st-${lead.pipeline_status}`}
          list="craig-statuses"
          defaultValue={lead.pipeline_status ?? ""}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (lead.pipeline_status ?? "")) onPatch(lead.id, { pipeline_status: next || null });
          }}
        />
        <div className={styles.statusGhost}>
          {lead.pipeline_status ? (
            <span
              className={`${styles.status} ${
                kind === "sold"
                  ? styles.statusSold
                  : kind === "lost"
                    ? styles.statusLost
                    : kind === "open"
                      ? styles.statusOpen
                      : styles.statusPlain
              }`}
            >
              {lead.pipeline_status}
            </span>
          ) : (
            <span style={{ color: "rgba(0,0,0,0.22)" }}>—</span>
          )}
        </div>
        <datalist id="craig-statuses">
          {STATUS_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </td>
      <td>
        <input
          className={styles.cell}
          key={`note-${lead.notes}`}
          defaultValue={lead.notes ?? ""}
          placeholder="—"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (lead.notes ?? "")) onPatch(lead.id, { notes: next || null });
          }}
        />
      </td>
      <td className={styles.cellCenter}>{saved ? <span className={styles.savedMark}>Saved</span> : null}</td>
    </tr>
  );
}

/* ---------------- Jobs section ---------------- */

function JobSection({
  title,
  hint,
  red,
  jobs,
  onArchive,
  onReady,
}: {
  title: string;
  hint: string;
  red?: boolean;
  jobs: JobRow[];
  onArchive: (id: string) => void;
  onReady?: (id: string) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <section>
      <div className={`${styles.sectionTitle} ${red ? styles.sectionRed : ""}`}>
        <h3>{title}</h3>
        <span>
          {jobs.length} · {hint}
        </span>
      </div>
      <div className={styles.sheetWrap}>
        <table className={styles.sheet} style={{ minWidth: "68rem" }}>
          <thead>
            <tr>
              <th style={{ minWidth: "14rem" }}>Customer</th>
              <th>Designer</th>
              <th>Sold</th>
              <th>Wait</th>
              <th>Summary</th>
              <th>Warehouse</th>
              <th>Install</th>
              <th className={styles.num}>Contract</th>
              <th className={styles.num}>Balance</th>
              <th style={{ width: "8rem" }} />
            </tr>
          </thead>
          <tbody>
            {[...jobs]
              .sort((a, b) => (b.sold_date ?? "").localeCompare(a.sold_date ?? ""))
              .map((job) => {
                const balance = Math.max(0, (job.contract_cents ?? 0) - (job.collected_cents ?? 0));
                const ready = warehouseReady(job);
                return (
                  <tr key={job.id} className={job.ready_to_order && !job.summary_confirmed ? styles.rtoRow : undefined}>
                    <td className={styles.cellText}>
                      <Link href={`/inspired-closets/ops/projects?id=${job.id}`} className={styles.rowLink}>
                        {job.client?.name ?? "Job"}
                      </Link>
                    </td>
                    <td className={styles.cellMuted}>{job.designer ? designerLabel(job.designer.name) : "—"}</td>
                    <td className={styles.cellMuted}>{job.sold_date ? sheetDate(job.sold_date) : "—"}</td>
                    <td className={styles.cellMuted}>
                      {(() => {
                        const gap = currentJobGap(job);
                        if (!gap) return job.project_tier && job.project_tier !== "unknown" ? tierLabel(job.project_tier) : "—";
                        const tone = ageTone(gap.days);
                        const cls =
                          tone === "alert" ? styles.pulseDown : tone === "warn" ? styles.pulseUp : undefined;
                        return (
                          <span className={cls} title={gap.label}>
                            {gap.days}d · {gap.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className={styles.cellText}>
                      {job.summary_confirmed ? (
                        <span className={`${styles.status} ${styles.statusSold}`}>Assigned</span>
                      ) : job.summary_count ? (
                        <span className={`${styles.status} ${styles.statusOpen}`}>Uploaded</span>
                      ) : (
                        <span style={{ color: "rgba(0,0,0,0.3)" }}>—</span>
                      )}
                    </td>
                    <td className={styles.cellText}>
                      {ready ? (
                        <span className={`${styles.status} ${styles.statusSold}`}>Ready</span>
                      ) : (job.receiving_total_qty ?? 0) > 0 ? (
                        `${job.receiving_received_qty}/${job.receiving_total_qty}`
                      ) : (
                        <span style={{ color: "rgba(0,0,0,0.3)" }}>—</span>
                      )}
                    </td>
                    <td className={styles.cellMuted}>{job.install_date ? sheetDate(job.install_date) : "—"}</td>
                    <td className={`${styles.num} ${styles.cellText}`}>{job.contract_cents ? money(job.contract_cents) : "—"}</td>
                    <td className={`${styles.num} ${styles.cellStrong}`}>
                      {balance ? money(balance) : <span style={{ color: "var(--ok)" }}>$0</span>}
                    </td>
                    <td className={styles.cellCenter}>
                      {onReady && !job.ready_to_order ? (
                        <button type="button" className={styles.ghostBtn} onClick={() => onReady(job.id)}>
                          Ready
                        </button>
                      ) : (
                        <button type="button" className={styles.ghostBtn} onClick={() => onArchive(job.id)}>
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
