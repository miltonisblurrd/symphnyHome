"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  activityFeed,
  attentionItems,
  financeExceptions,
  formatCurrency,
  gavinDemoMeta,
  getFinancialPulseForPeriod,
  assignablePeople,
  jobs,
  leads,
  pipelineCounts,
  schedule,
  type AttentionSeverity,
  type JobStage,
} from "@/data/inspired-closets-gavin-demo";
import { buildSymphonyInsights } from "@/lib/inspired-closets-symphony-insights";
import GavinSidebar, { type NavSectionId } from "./GavinSidebar";
import GavinTopBar from "./GavinTopBar";
import styles from "./gavin-dashboard.module.css";

type Period = (typeof gavinDemoMeta.periodOptions)[number];
type StageFilter = "All" | JobStage;
type AttentionFilter = "critical" | "warning" | "done";

const ATTENTION_PAGE_SIZE = 8;

function severityClass(severity: AttentionSeverity) {
  if (severity === "critical") return styles.severityCritical;
  if (severity === "warning") return styles.severityWarning;
  return styles.severityInfo;
}

type CubbySource = "demo" | "claude+demo" | "claude+sheets" | "demo-fallback";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: CubbySource;
};

type LiveAttentionItem = (typeof attentionItems)[number];

type WorkbookPulse = {
  sales: number;
  cashCollected: number;
  outstandingBalances: number;
  collectionRate: number;
  avgMarginStarting: number;
  avgMarginFinal: number;
  jobsBelowMarginGate: number;
  jobsWithSpiff: number;
  commissionsOpen: number;
  commissionsPaid: number;
  activeJobs: number;
  designerCount: number;
  metricNotes: {
    sales: string;
    cashCollected: string;
    outstanding: string;
    collectionRate: string;
    avgMarginStarting: string;
    avgMarginFinal: string;
    belowGate: string;
    spiffJobs: string;
    commissionsOpen: string;
    commissionsPaid: string;
    activeJobs: string;
  };
};

function cubbySourceLabel(source: CubbySource) {
  if (source === "claude+sheets") return "Live · Claude + Payroll Workbook";
  if (source === "claude+demo") return "Live · Claude";
  if (source === "demo-fallback") return "Demo fallback · Claude unavailable";
  return "Demo · no API key";
}

export default function GavinDashboard() {
  const [period, setPeriod] = useState<Period>("This week");
  const [activeSection, setActiveSection] = useState<NavSectionId>("attention");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>("All");
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [qbConnected, setQbConnected] = useState(false);
  const [workbookPulse, setWorkbookPulse] = useState<WorkbookPulse | null>(null);
  const [liveAttention, setLiveAttention] = useState<LiveAttentionItem[] | null>(null);
  const [workbookSyncedAt, setWorkbookSyncedAt] = useState<string | null>(null);
  const [workbookReady, setWorkbookReady] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: gavinDemoMeta.chatBrand.intro,
    },
  ]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [doneTodos, setDoneTodos] = useState<Record<string, boolean>>({});
  const [pendingDone, setPendingDone] = useState<Record<string, boolean>>({});
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [assignOpenId, setAssignOpenId] = useState<string | null>(null);
  const [notifiedAt, setNotifiedAt] = useState<Record<string, string>>({});
  const [notifyLoadingId, setNotifyLoadingId] = useState<string | null>(null);
  const [actionFlash, setActionFlash] = useState<string | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("critical");
  const [attentionPage, setAttentionPage] = useState(0);
  const chatThreadRef = useRef<HTMLDivElement>(null);

  const activeAttention = liveAttention ?? attentionItems;

  const periodFinancialPulse = useMemo(() => {
    const demo = getFinancialPulseForPeriod(period);
    if (!workbookPulse) return demo;

    return {
      ...demo,
      sales: workbookPulse.sales,
      cashCollected: workbookPulse.cashCollected,
      outstandingBalances: workbookPulse.outstandingBalances,
      avgMargin: workbookPulse.avgMarginFinal || workbookPulse.avgMarginStarting,
      unverifiedCosts: 0,
      jobsBelowMarginGate: workbookPulse.jobsBelowMarginGate,
      spiffsPending: workbookPulse.commissionsOpen,
      deltas: undefined,
      metricNotes: {
        ...demo.metricNotes,
        sales: workbookPulse.metricNotes.sales,
        cashCollected: workbookPulse.metricNotes.cashCollected,
        outstanding: workbookPulse.metricNotes.outstanding,
        avgMargin: workbookPulse.metricNotes.avgMarginFinal,
        unverifiedCosts: workbookPulse.metricNotes.spiffJobs,
        belowGate: workbookPulse.metricNotes.belowGate,
      },
    };
  }, [period, workbookPulse]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkbook() {
      try {
        const response = await fetch(
          `/api/inspired-closets/workbook?period=${encodeURIComponent(period)}`,
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          hub?: {
            syncedAt: string;
            pulse: WorkbookPulse;
            attentionItems: LiveAttentionItem[];
          };
        };

        if (cancelled) return;

        if (payload.ok && payload.hub) {
          setWorkbookPulse(payload.hub.pulse);
          setLiveAttention(payload.hub.attentionItems);
          setWorkbookSyncedAt(payload.hub.syncedAt);
          setWorkbookReady(true);
          setAttentionPage(0);
          return;
        }

        setWorkbookReady(false);
        setWorkbookPulse(null);
        setLiveAttention(null);
      } catch {
        if (!cancelled) {
          setWorkbookReady(false);
          setWorkbookPulse(null);
          setLiveAttention(null);
        }
      }
    }

    async function loadQbStatus() {
      try {
        const statusRes = await fetch("/api/integrations/quickbooks/status");
        const status = (await statusRes.json()) as { connected?: boolean };
        if (!cancelled) setQbConnected(Boolean(status.connected));
      } catch {
        if (!cancelled) setQbConnected(false);
      }
    }

    void loadWorkbook();
    void loadQbStatus();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const symphonyInsights = useMemo(
    () =>
      buildSymphonyInsights({
        attentionItems: activeAttention,
        financialPulse: periodFinancialPulse,
        financeExceptions,
        jobs,
        schedule,
        period,
        marginGate: gavinDemoMeta.marginGate,
        formatCurrency,
      }),
    [period, periodFinancialPulse, activeAttention],
  );

  const askSymphony = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || chatLoading) return;

    const userId = `user-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: userId, role: "user", text: trimmed }]);
    setChatInput("");
    setChatLoading(true);

    let answer = "Cubby couldn't reach the server. Try again in a moment.";
    let source: CubbySource | undefined;

    try {
      const response = await fetch("/api/inspired-closets/cubby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, period }),
      });
      const payload = (await response.json()) as { answer?: string; source?: CubbySource };
      if (payload.answer) answer = payload.answer;
      if (payload.source) source = payload.source;
    } catch {
      // keep fallback answer
    }

    const assistantId = `assistant-${Date.now()}`;
    setChatMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: answer, source },
    ]);
    setChatLoading(false);

    window.setTimeout(() => {
      chatThreadRef.current?.scrollTo({
        top: chatThreadRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  };

  const filteredJobs = useMemo(() => {
    if (stageFilter === "All") return jobs;
    return jobs.filter((job) => job.stage === stageFilter);
  }, [stageFilter]);

  const criticalCount = activeAttention.filter(
    (item) => item.severity === "critical" && !doneTodos[item.id],
  ).length;
  const warningCount = activeAttention.filter(
    (item) =>
      (item.severity === "warning" || item.severity === "info") && !doneTodos[item.id],
  ).length;
  const doneCount = activeAttention.filter((item) => doneTodos[item.id]).length;
  const todosRemaining = criticalCount + warningCount;

  const searchLower = search.trim().toLowerCase();
  const filteredAttention = useMemo(() => {
    const searched = !searchLower
      ? activeAttention
      : activeAttention.filter(
          (item) =>
            item.title.toLowerCase().includes(searchLower) ||
            item.detail.toLowerCase().includes(searchLower) ||
            item.todoLabel.toLowerCase().includes(searchLower),
        );

    return searched.filter((item) => {
      const isDone = Boolean(doneTodos[item.id]);
      if (attentionFilter === "done") return isDone;
      if (isDone) return false;
      if (attentionFilter === "critical") return item.severity === "critical";
      return item.severity === "warning" || item.severity === "info";
    });
  }, [searchLower, activeAttention, attentionFilter, doneTodos]);

  const attentionPageCount = Math.max(1, Math.ceil(filteredAttention.length / ATTENTION_PAGE_SIZE));
  const safeAttentionPage = Math.min(attentionPage, attentionPageCount - 1);
  const visibleAttention = filteredAttention.slice(
    safeAttentionPage * ATTENTION_PAGE_SIZE,
    safeAttentionPage * ATTENTION_PAGE_SIZE + ATTENTION_PAGE_SIZE,
  );

  useEffect(() => {
    setAttentionPage(0);
  }, [attentionFilter, searchLower, period]);

  const flash = (message: string) => {
    setActionFlash(message);
    window.setTimeout(() => setActionFlash(null), 2800);
  };

  const togglePendingDone = (id: string) => {
    setPendingDone((prev) => ({ ...prev, [id]: !prev[id] }));
    setExpandedId(id);
  };

  const confirmMarkDone = (id: string) => {
    setDoneTodos((prev) => ({ ...prev, [id]: true }));
    setPendingDone((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpandedId(null);
    flash("Marked as done. Find it under the Done tab.");
  };

  const reopenTodo = (id: string) => {
    setDoneTodos((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingDone((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    flash("Moved back to open attention.");
  };

  const assignTodo = (itemId: string, person: string) => {
    setAssignees((prev) => ({ ...prev, [itemId]: person }));
    setAssignOpenId(null);
    setExpandedId(itemId);
    flash(`Assigned to ${person}. You can notify them on Slack now.`);
  };

  const notifyAssignee = async (item: LiveAttentionItem) => {
    const person = assignees[item.id]?.trim();
    if (!person) {
      flash("Select who to assign before notifying on Slack.");
      setAssignOpenId(item.id);
      setExpandedId(item.id);
      return;
    }
    setNotifyLoadingId(item.id);
    setExpandedId(item.id);

    try {
      const response = await fetch("/api/inspired-closets/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          assignee: person,
          title: item.title,
          severity: item.severity,
          todoLabel: item.todoLabel,
          notifyMessage: item.notifyMessage,
          requestedBy: gavinDemoMeta.viewer.split(" ")[0],
        }),
      });

      const raw = await response.text();
      let payload: { error?: string; mention?: string } = {};
      try {
        payload = JSON.parse(raw) as { error?: string; mention?: string };
      } catch {
        flash(
          response.status === 307 || raw.includes("Inspired Closets")
            ? "Notify blocked — refresh the page and log in again."
            : "Notify failed — is `npm run dev` running with the latest code?",
        );
        return;
      }

      if (!response.ok) {
        flash(payload.error ?? `Could not notify ${person} on Slack (${response.status}).`);
        return;
      }

      const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setNotifiedAt((prev) => ({ ...prev, [item.id]: stamp }));
      flash(`Slack sent to ${person} in #ops-alerts.`);
    } catch {
      flash(`Could not notify ${person} on Slack.`);
    } finally {
      setNotifyLoadingId(null);
    }
  };

  const scrollTo = (id: NavSectionId) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.page}>
      <div className={styles.appShell}>
        <GavinSidebar
          activeSection={activeSection}
          onNavigate={scrollTo}
          qbConnected={qbConnected}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className={styles.main}>
          <div className={styles.mainInner}>
          <GavinTopBar
            search={search}
            onSearchChange={setSearch}
            onMenuToggle={() => setSidebarOpen((open) => !open)}
            viewer={gavinDemoMeta.viewer}
          />

          <div className={styles.content}>
            <div className={styles.pageHead}>
              <div className={styles.pageTitleRow}>
                <div>
                  <h1 className={styles.pageTitle}>Here&apos;s what&apos;s happening</h1>
                  <p className={styles.pageLead}>
                    {gavinDemoMeta.viewer} · {gavinDemoMeta.role} ·{" "}
                    {workbookReady && workbookSyncedAt
                      ? `Payroll Workbook synced ${new Date(workbookSyncedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : `Updated ${gavinDemoMeta.updatedAt}`}
                  </p>
                </div>
                <div className={styles.headMeta}>
                  <span className={`${styles.pill} ${styles.pillAccent}`}>
                    {workbookReady ? "Live · Payroll Workbook" : gavinDemoMeta.prototypeLabel}
                  </span>
                </div>
              </div>

            </div>

            <div className={styles.heroGrid}>
              <section
                id="attention"
                className={`${styles.panel} ${styles.attentionPanel} ${styles.scrollTarget}`}
              >
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Today&apos;s attention</h2>
                    <p className={styles.panelHint}>
                      {todosRemaining} open · {criticalCount} critical · {warningCount} warning ·{" "}
                      {doneCount} done ·{" "}
                      {workbookReady
                        ? "from red 2026 tabs"
                        : "demo data · connect workbook for live items"}
                    </p>
                  </div>
                </div>

                <div className={styles.filterRow}>
                  {(
                    [
                      { id: "critical" as const, label: "Critical", count: criticalCount },
                      { id: "warning" as const, label: "Warning", count: warningCount },
                      { id: "done" as const, label: "Done", count: doneCount },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`${styles.periodBtn} ${
                        attentionFilter === tab.id ? styles.periodBtnActive : ""
                      }`}
                      onClick={() => setAttentionFilter(tab.id)}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                {actionFlash ? <p className={styles.todoFlash}>{actionFlash}</p> : null}
                <div className={styles.attentionList}>
                  {visibleAttention.length === 0 ? (
                    <p className={styles.panelHint}>
                      {attentionFilter === "done"
                        ? "No completed items yet."
                        : `No ${attentionFilter} items right now.`}
                    </p>
                  ) : null}
                  {visibleAttention.map((item) => {
                    const open = expandedId === item.id;
                    const isDone = Boolean(doneTodos[item.id]);
                    const isPendingDone = Boolean(pendingDone[item.id]);
                    const assignee = assignees[item.id] ?? "";
                    const notified = notifiedAt[item.id];
                    const assignOpen = assignOpenId === item.id;
                    return (
                      <article
                        key={item.id}
                        className={`${styles.attentionCard} ${isDone ? styles.attentionCardDone : ""}`}
                      >
                        <button
                          type="button"
                          className={styles.attentionToggle}
                          onClick={() => setExpandedId(open ? null : item.id)}
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "View"} action for ${item.title}`}
                        >
                          <input
                            type="checkbox"
                            className={styles.todoCheck}
                            checked={isDone || isPendingDone}
                            disabled={isDone}
                            aria-label={`Select ${item.title} to mark done`}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => {
                              if (!isDone) togglePendingDone(item.id);
                            }}
                          />
                          <span className={styles.attentionToggleBody}>
                            <span className={styles.attentionTop}>
                              <span>
                                <span
                                  className={`${styles.severity} ${severityClass(item.severity)}`}
                                >
                                  {item.severity}
                                </span>
                                <h3 className={styles.attentionTitle}>{item.title}</h3>
                              </span>
                              {item.amount != null ? (
                                <strong>{formatCurrency(item.amount)}</strong>
                              ) : null}
                            </span>
                            <p className={styles.attentionDetail}>{item.detail}</p>
                            <div className={styles.attentionMeta}>
                              <span>
                                {assignee ? (
                                  <>
                                    Assigned: <strong>{assignee}</strong>
                                  </>
                                ) : (
                                  <strong>Unassigned</strong>
                                )}
                                {notified ? ` · Notified ${notified}` : ""}
                              </span>
                              <span
                                className={`${styles.expandHint} ${open ? styles.expandHintOpen : ""}`}
                                aria-hidden
                              >
                                {open ? "Hide action" : "View action"}
                                <span className={styles.expandChevron} />
                              </span>
                            </div>
                          </span>
                        </button>
                        {open ? (
                          <div className={styles.expanded}>
                            <p className={styles.actionHeader}>Your action</p>
                            <p className={styles.actionLabel}>{item.todoLabel}</p>
                            <p className={styles.actionWhy}>{item.todoWhy}</p>
                            <p className={styles.actionContext}>{item.context}</p>
                            <div className={styles.todoActions}>
                              {isDone ? (
                                <button
                                  type="button"
                                  className={styles.todoActionBtn}
                                  onClick={() => reopenTodo(item.id)}
                                >
                                  Reopen
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={styles.todoActionBtn}
                                    onClick={() => setAssignOpenId(assignOpen ? null : item.id)}
                                  >
                                    {assignee ? `Assigned: ${assignee}` : "Select assignee"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`${styles.todoActionBtn} ${styles.todoActionPrimary}`}
                                    disabled={notifyLoadingId === item.id || !assignee}
                                    onClick={() => notifyAssignee(item)}
                                  >
                                    {notifyLoadingId === item.id
                                      ? "Sending…"
                                      : assignee
                                        ? `Notify ${assignee}`
                                        : "Notify (assign first)"}
                                  </button>
                                  {isPendingDone ? (
                                    <button
                                      type="button"
                                      className={`${styles.todoActionBtn} ${styles.todoActionPrimary}`}
                                      onClick={() => confirmMarkDone(item.id)}
                                    >
                                      Mark as done
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </div>
                            {assignOpen && !isDone ? (
                              <div className={styles.assignPicker}>
                                <p className={styles.assignHint}>Select who to assign this to:</p>
                                <div className={styles.assignChoices}>
                                  {assignablePeople.map((person) => (
                                    <button
                                      key={person}
                                      type="button"
                                      className={`${styles.assignChip} ${
                                        assignee === person ? styles.assignChipActive : ""
                                      }`}
                                      onClick={() => assignTodo(item.id, person)}
                                    >
                                      {person}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {!open && isPendingDone && !isDone ? (
                          <div className={styles.pendingDoneBar}>
                            <button
                              type="button"
                              className={`${styles.todoActionBtn} ${styles.todoActionPrimary}`}
                              onClick={() => confirmMarkDone(item.id)}
                            >
                              Mark as done
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                {filteredAttention.length > ATTENTION_PAGE_SIZE ? (
                  <div className={styles.attentionPager}>
                    <button
                      type="button"
                      className={styles.todoActionBtn}
                      disabled={safeAttentionPage <= 0}
                      onClick={() => setAttentionPage((page) => Math.max(0, page - 1))}
                    >
                      Previous
                    </button>
                    <span className={styles.panelHint}>
                      Page {safeAttentionPage + 1} of {attentionPageCount} · showing{" "}
                      {visibleAttention.length} of {filteredAttention.length}
                    </span>
                    <button
                      type="button"
                      className={styles.todoActionBtn}
                      disabled={safeAttentionPage >= attentionPageCount - 1}
                      onClick={() =>
                        setAttentionPage((page) => Math.min(attentionPageCount - 1, page + 1))
                      }
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </section>

              <div className={styles.financeRightCol}>
                <div className={`${styles.filterRow} ${styles.filterRowToolbar}`}>
                  {gavinDemoMeta.periodOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.periodBtn} ${period === option ? styles.periodBtnActive : ""}`}
                      onClick={() => setPeriod(option)}
                    >
                      {option}
                    </button>
                  ))}
                  <button type="button" className={styles.exportBtn}>
                    <span className={styles.exportIcon} aria-hidden>
                      ↗
                    </span>
                    Export
                  </button>
                </div>

                <section
                  id="finance"
                  className={`${styles.panel} ${styles.financePanel} ${styles.scrollTarget}`}
                >
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>Financial pulse</h2>
                      <p className={styles.panelHint}>
                        45% spiff gate · Payroll Workbook (red 2026 tabs) · {period} view
                        {workbookPulse
                          ? ` · ${workbookPulse.designerCount} designers · ${workbookPulse.activeJobs} jobs`
                          : " · demo fallback"}
                      </p>
                    </div>
                  </div>
                  <div className={styles.metricsGrid}>
                    <div className={styles.metric}>
                      <p className={styles.metricLabel}>Sales</p>
                      <p className={styles.metricValue}>
                        {formatCurrency(periodFinancialPulse.sales)}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.sales ?? periodFinancialPulse.metricNotes.sales}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricGood}`}>
                      <p className={styles.metricLabel}>Cash collected</p>
                      <p className={styles.metricValue}>
                        {formatCurrency(periodFinancialPulse.cashCollected)}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.cashCollected ??
                          periodFinancialPulse.metricNotes.cashCollected}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricWarn}`}>
                      <p className={styles.metricLabel}>Outstanding</p>
                      <p className={styles.metricValue}>
                        {formatCurrency(periodFinancialPulse.outstandingBalances)}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.outstanding ??
                          periodFinancialPulse.metricNotes.outstanding}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricGood}`}>
                      <p className={styles.metricLabel}>Collection rate</p>
                      <p className={styles.metricValue}>
                        {workbookPulse ? `${workbookPulse.collectionRate}%` : "—"}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.collectionRate ?? "Cash ÷ sales"}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricGood}`}>
                      <p className={styles.metricLabel}>Avg margin starting</p>
                      <p className={styles.metricValue}>
                        {workbookPulse
                          ? workbookPulse.metricNotes.avgMarginStarting.startsWith("No ")
                            ? "—"
                            : `${workbookPulse.avgMarginStarting}%`
                          : `${periodFinancialPulse.avgMargin}%`}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.avgMarginStarting ?? "At first deposit"}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricGood}`}>
                      <p className={styles.metricLabel}>Avg margin final</p>
                      <p className={styles.metricValue}>
                        {workbookPulse
                          ? workbookPulse.metricNotes.avgMarginFinal.startsWith("No ")
                            ? "—"
                            : `${workbookPulse.avgMarginFinal}%`
                          : `${periodFinancialPulse.avgMargin}%`}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.avgMarginFinal ?? "Final / after spiff"}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricAlert}`}>
                      <p className={styles.metricLabel}>Below 45% gate</p>
                      <p className={styles.metricValue}>
                        {periodFinancialPulse.jobsBelowMarginGate}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.belowGate ??
                          periodFinancialPulse.metricNotes.belowGate}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricWarn}`}>
                      <p className={styles.metricLabel}>Spiff-adjusted jobs</p>
                      <p className={styles.metricValue}>
                        {workbookPulse ? workbookPulse.jobsWithSpiff : "—"}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.spiffJobs ?? "After-spiff fields used"}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricWarn}`}>
                      <p className={styles.metricLabel}>Commissions open</p>
                      <p className={styles.metricValue}>
                        {workbookPulse
                          ? formatCurrency(workbookPulse.commissionsOpen)
                          : formatCurrency(periodFinancialPulse.spiffsPending)}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.commissionsOpen ?? "CHECK with no pay date"}
                      </p>
                    </div>
                    <div className={`${styles.metric} ${styles.metricGood}`}>
                      <p className={styles.metricLabel}>Commissions paid</p>
                      <p className={styles.metricValue}>
                        {workbookPulse ? formatCurrency(workbookPulse.commissionsPaid) : "—"}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.commissionsPaid ?? period}
                      </p>
                    </div>
                    <div className={styles.metric}>
                      <p className={styles.metricLabel}>Active jobs</p>
                      <p className={styles.metricValue}>
                        {workbookPulse ? workbookPulse.activeJobs : "—"}
                      </p>
                      <p className={styles.metricNote}>
                        {workbookPulse?.metricNotes.activeJobs ?? "From workbook"}
                      </p>
                    </div>
                    <div className={styles.metric}>
                      <p className={styles.metricLabel}>Designers synced</p>
                      <p className={styles.metricValue}>
                        {workbookPulse ? workbookPulse.designerCount : "—"}
                      </p>
                      <p className={styles.metricNote}>Red 2026 tabs</p>
                    </div>
                  </div>
                </section>

                <section
                  id="ask"
                  className={`${styles.panel} ${styles.chatBox} ${styles.scrollTarget}`}
                >
                <div className={styles.chatHeader}>
                  <div>
                    <h2 className={styles.chatTitle}>{gavinDemoMeta.chatBrand.title}</h2>
                    <p className={styles.chatLead}>
                      {gavinDemoMeta.chatBrand.name} keeps an eye on {period.toLowerCase()} numbers
                      + open attention items
                    </p>
                  </div>
                  <span className={styles.chatBadge}>{gavinDemoMeta.chatBrand.badge}</span>
                </div>

                <div className={styles.chatThread} ref={chatThreadRef}>
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.role === "user"
                          ? styles.chatBubbleUser
                          : styles.chatBubbleAssistant
                      }
                    >
                      {message.text}
                      {message.role === "assistant" && message.source ? (
                        <p className={styles.chatSourceMeta}>
                          {cubbySourceLabel(message.source)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className={styles.promptGrid}>
                  {symphonyInsights.map((insight) => (
                    <button
                      key={insight.id}
                      type="button"
                      className={styles.promptBtn}
                      onClick={() => askSymphony(insight.prompt)}
                    >
                      {insight.prompt}
                    </button>
                  ))}
                </div>

                <form
                  className={styles.chatComposer}
                  onSubmit={(event) => {
                    event.preventDefault();
                    askSymphony(chatInput);
                  }}
                >
                  <input
                    className={styles.chatInput}
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={gavinDemoMeta.chatBrand.placeholder}
                    aria-label={gavinDemoMeta.chatBrand.title}
                  />
                  <button
                    type="submit"
                    className={styles.chatSendBtn}
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    {chatLoading ? "…" : gavinDemoMeta.chatBrand.sendLabel}
                  </button>
                </form>
              </section>
              </div>
            </div>

            <section id="pipeline" className={`${styles.section} ${styles.scrollTarget}`}>
              <div className={styles.sectionHead}>
                <div>
                  <h2 className={styles.sectionTitle}>Job pipeline</h2>
                  <p className={styles.panelHint}>
                    Sold → deposit → job check → ordering → install → final payment
                  </p>
                </div>
                <div className={styles.filters}>
                  <button
                    type="button"
                    className={`${styles.filterChip} ${stageFilter === "All" ? styles.filterChipActive : ""}`}
                    onClick={() => setStageFilter("All")}
                  >
                    All
                  </button>
                  {(
                    [
                      "Deposit Pending",
                      "Job Check",
                      "Ordering",
                      "Install Scheduled",
                      "Final Payment",
                    ] as JobStage[]
                  ).map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      className={`${styles.filterChip} ${stageFilter === stage ? styles.filterChipActive : ""}`}
                      onClick={() => setStageFilter(stage)}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.pipelineStrip}>
                {(Object.keys(pipelineCounts) as JobStage[]).map((stage) => (
                  <div key={stage} className={styles.stagePill}>
                    <span className={styles.stageCount}>{pipelineCounts[stage]}</span>
                    <span className={styles.stageLabel}>{stage}</span>
                  </div>
                ))}
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Stage</th>
                      <th>Money</th>
                      <th>Margin</th>
                      <th>Risk</th>
                      <th>Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <strong>
                            {job.customer} · {job.id}
                          </strong>
                          <div className={styles.panelHint}>
                            {job.designer} / {job.installer}
                          </div>
                        </td>
                        <td>{job.stage}</td>
                        <td>
                          {formatCurrency(job.price)}
                          <div className={styles.panelHint}>
                            Owed {formatCurrency(job.balanceOwed)} · {job.depositStatus}
                          </div>
                        </td>
                        <td>{job.margin == null ? "—" : `${job.margin}%`}</td>
                        <td className={job.risk === "None" ? styles.riskOk : styles.risk}>
                          {job.risk}
                        </td>
                        <td>
                          {job.nextAction}
                          <div className={styles.panelHint}>Owner: {job.owner}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.mobileCards}>
                {filteredJobs.map((job) => (
                  <article key={job.id} className={styles.jobCard}>
                    <h3>
                      {job.customer} · {job.stage}
                    </h3>
                    <div className={styles.cardMeta}>
                      <div>
                        <span>Price </span>
                        {formatCurrency(job.price)} · owed {formatCurrency(job.balanceOwed)}
                      </div>
                      <div>
                        <span>Margin </span>
                        {job.margin == null ? "—" : `${job.margin}%`}
                      </div>
                      <div className={job.risk === "None" ? styles.riskOk : styles.risk}>
                        {job.risk}
                      </div>
                      <div>
                        <span>Next </span>
                        {job.nextAction} ({job.owner})
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className={styles.split}>
              <section id="leads" className={`${styles.panel} ${styles.scrollTarget}`}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Lead visibility</h2>
                    <p className={styles.panelHint}>Including Craig inbox alerts</p>
                  </div>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Lead</th>
                        <th>Source</th>
                        <th>Stage</th>
                        <th>Age</th>
                        <th>Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => (
                        <tr key={lead.id}>
                          <td>
                            <strong>{lead.name}</strong>
                            <div className={styles.panelHint}>
                              {lead.owner} · {lead.designer}
                            </div>
                          </td>
                          <td>{lead.source}</td>
                          <td>{lead.stage}</td>
                          <td>{lead.age}</td>
                          <td className={styles.risk}>{lead.risk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.mobileCards}>
                  {leads.map((lead) => (
                    <article key={lead.id} className={styles.leadCard}>
                      <h3>{lead.name}</h3>
                      <div className={styles.cardMeta}>
                        <div>
                          {lead.source} · {lead.stage}
                        </div>
                        <div>Age {lead.age}</div>
                        <div className={styles.risk}>{lead.risk}</div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section id="activity" className={`${styles.panel} ${styles.scrollTarget}`}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Activity</h2>
                  </div>
                </div>
                <div className={styles.list}>
                  {activityFeed.map((item) => (
                    <div key={item.id} className={styles.listItem}>
                      <strong>{item.time}</strong>
                      <p>{item.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section id="schedule" className={`${styles.panel} ${styles.scrollTarget}`}>
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Schedule snapshot</h2>
                </div>
              </div>
              <div className={styles.list}>
                {schedule.consultations.map((item) => (
                  <div key={item.customer} className={styles.listItem}>
                    <strong>Consult · {item.customer}</strong>
                    <p>
                      {item.when} · {item.designer} · {item.location}
                    </p>
                  </div>
                ))}
                {schedule.installs.map((item) => (
                  <div key={item.customer} className={styles.listItem}>
                    <strong>Install · {item.customer}</strong>
                    <p>
                      {item.when} · {item.installer} · {item.note}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <p className={styles.footerNote}>
              {workbookReady
                ? "Live Payroll Workbook (red 2026 tabs) · live Slack · live Claude. QuickBooks kept separate. Not connected: Community, Studio, or Podium."
                : "Demo data · connect Payroll Workbook Google Sheet for live pulse + attention. Slack + Claude ready."}
              {qbConnected ? " QuickBooks sandbox linked (not driving pulse)." : ""}
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
