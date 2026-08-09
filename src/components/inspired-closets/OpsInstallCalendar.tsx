"use client";

import { useMemo, useState } from "react";
import styles from "./install-calendar.module.css";

export type CalStaff = { id: string; name: string; role: string };
export type CalClient = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
};

export type CalInstallJob = {
  id: string;
  install_date: string | null;
  sold_date?: string | null;
  stage: string;
  contract_cents?: number;
  notes?: string | null;
  serviceTag?: "SVC" | "G/B" | null;
  lead_id?: string | null;
  studio_ref?: string | null;
  community_ref?: string | null;
  receive_date?: string | null;
  tentative_install_notes?: string | null;
  site_ready_notes?: string | null;
  deposit_intake_status?: string | null;
  client: CalClient | null;
  designer: CalStaff | null;
  installer?: CalStaff | null;
  jobCheckOwner?: CalStaff | null;
};

function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastName(full: string | null | undefined): string {
  if (!full) return "CLIENT";
  const parts = full.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? full).toUpperCase();
}

function dollars(cents: number | undefined): string {
  if (cents == null) return "$—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

type EventCard = {
  id: string;
  jobId: string;
  date: string;
  title: string;
  designer: string;
  amount: string;
  installerName: string;
  installerId: string | null;
  tag: "SVC" | "G/B" | null;
  assigned: boolean;
  notes: string | null;
  soldDate: string | null;
  address: string | null;
  phone: string | null;
  clientName: string;
};

export default function OpsInstallCalendar({
  jobs,
  readyToSchedule = [],
  awaitingDeposit = [],
  installers,
  busy,
  onAssignInstaller,
  onScheduleInstall,
  onAdvanceStage,
  onRefresh,
  weekStartIso,
  onWeekChange,
}: {
  jobs: CalInstallJob[];
  readyToSchedule?: CalInstallJob[];
  awaitingDeposit?: CalInstallJob[];
  installers: CalStaff[];
  busy: boolean;
  onAssignInstaller: (jobId: string, installerId: string | null) => Promise<void>;
  onScheduleInstall: (input: {
    jobId: string;
    leadId: string | null;
    scheduledAt: string;
    installerId: string | null;
  }) => Promise<void>;
  onAdvanceStage: (jobId: string, patch: Record<string, unknown>) => Promise<void>;
  onRefresh: () => void;
  weekStartIso: string;
  onWeekChange: (iso: string) => void;
}) {
  const weekStart = useMemo(() => new Date(weekStartIso), [weekStartIso]);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [showAssigned, setShowAssigned] = useState(true);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [showService, setShowService] = useState(true);
  const [showCompany, setShowCompany] = useState(true);
  const [selected, setSelected] = useState<EventCard | null>(null);
  const [assignId, setAssignId] = useState("");
  const [scheduleJob, setScheduleJob] = useState<CalInstallJob | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleInstaller, setScheduleInstaller] = useState("");
  const [receiveDraft, setReceiveDraft] = useState<Record<string, string>>({});

  const days = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5, 6].map((offset) => {
        const d = addDays(weekStart, offset);
        return {
          key: ymd(d),
          dow: d.toLocaleDateString("en-US", { weekday: "short" }),
          num: d.getDate(),
          label: d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
        };
      }),
    [weekStart],
  );

  const events = useMemo(() => {
    const cards: EventCard[] = jobs.map((job) => {
      const tag = job.serviceTag ?? null;
      const base = lastName(job.client?.name);
      const title = tag ? `${tag} ${base}` : base;
      const assigned = Boolean(job.installer?.id);
      return {
        id: job.id,
        jobId: job.id,
        date: job.install_date ?? "",
        title,
        designer: job.designer?.name ?? "—",
        amount: dollars(job.contract_cents),
        installerName: job.installer?.name?.toUpperCase() ?? "UNASSIGNED",
        installerId: job.installer?.id ?? null,
        tag,
        assigned,
        notes: job.notes ?? null,
        soldDate: job.sold_date ?? null,
        address: job.client?.address ?? null,
        phone: job.client?.phone ?? null,
        clientName: job.client?.name ?? "Client",
      };
    });

    return cards.filter((card) => {
      if (card.tag === "SVC" || card.tag === "G/B") return showService;
      if (card.assigned) return showAssigned;
      return showUnassigned;
    });
  }, [jobs, showAssigned, showUnassigned, showService]);

  const rangeLabel = `${days[0]?.label ?? ""} – ${days[6]?.label ?? ""}`;

  async function saveAssign() {
    if (!selected) return;
    await onAssignInstaller(selected.jobId, assignId || null);
    setSelected(null);
    setAssignId("");
  }

  async function saveSchedule() {
    if (!scheduleJob || !scheduleAt) return;
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime())) return;
    await onScheduleInstall({
      jobId: scheduleJob.id,
      leadId: scheduleJob.lead_id ?? null,
      scheduledAt: when.toISOString(),
      installerId: scheduleInstaller || null,
    });
    setScheduleJob(null);
    setScheduleAt("");
    setScheduleInstaller("");
  }

  return (
    <div className={styles.glueWrap}>
      {awaitingDeposit.length > 0 ? (
        <section className={styles.strip}>
          <div className={styles.stripHead}>
            <h3 className={styles.stripTitle}>Sold / awaiting deposit</h3>
            <span className={styles.stripCount}>{awaitingDeposit.length}</span>
          </div>
          <ul className={styles.stripList}>
            {awaitingDeposit.map((job) => (
              <li key={job.id} className={styles.stripItem}>
                <div>
                  <strong>{job.client?.name ?? "Client"}</strong>
                  <span>
                    {dollars(job.contract_cents)} · {job.designer?.name ?? "—"} ·{" "}
                    {(job.deposit_intake_status ?? "pending").replace(/_/g, " ")}
                  </span>
                </div>
                <a className={styles.stripLink} href="/inspired-closets/ops/billing">
                  Open Billing
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.strip}>
        <div className={styles.stripHead}>
          <h3 className={styles.stripTitle}>Ready to schedule</h3>
          <span className={styles.stripCount}>{readyToSchedule.length}</span>
        </div>
        {readyToSchedule.length === 0 ? (
          <p className={styles.stripEmpty}>
            No deposit-paid jobs waiting. After Billing marks 50% paid, they land here.
          </p>
        ) : (
          <ul className={styles.stripList}>
            {readyToSchedule.map((job) => (
              <li key={job.id} className={styles.stripItemReady}>
                <div>
                  <strong>{job.client?.name ?? "Client"}</strong>
                  <span>
                    {dollars(job.contract_cents)} · {job.designer?.name ?? "—"} ·{" "}
                    {job.jobCheckOwner?.name ?? "No job-check owner"}
                    {job.tentative_install_notes
                      ? ` · ${job.tentative_install_notes}`
                      : ""}
                  </span>
                  <span className={styles.stripMeta}>
                    Stage: {job.stage.replace(/_/g, " ")}
                    {job.receive_date ? ` · Receive ${shortDate(job.receive_date)}` : ""}
                    {job.studio_ref ? ` · Studio ${job.studio_ref}` : ""}
                  </span>
                </div>
                <div className={styles.stripActions}>
                  {job.stage === "deposit_received" ? (
                    <button
                      type="button"
                      className={styles.navBtn}
                      disabled={busy}
                      onClick={() =>
                        void onAdvanceStage(job.id, { stage: "job_check" })
                      }
                    >
                      Job check
                    </button>
                  ) : null}
                  {job.stage === "job_check" ? (
                    <button
                      type="button"
                      className={styles.navBtn}
                      disabled={busy}
                      onClick={() => void onAdvanceStage(job.id, { stage: "ordered" })}
                    >
                      Ordered
                    </button>
                  ) : null}
                  <input
                    className={styles.receiveInput}
                    type="date"
                    value={receiveDraft[job.id] ?? job.receive_date ?? ""}
                    onChange={(e) =>
                      setReceiveDraft((m) => ({ ...m, [job.id]: e.target.value }))
                    }
                    aria-label="Receive date"
                  />
                  <button
                    type="button"
                    className={styles.navBtn}
                    disabled={busy || !(receiveDraft[job.id] ?? job.receive_date)}
                    onClick={() =>
                      void onAdvanceStage(job.id, {
                        receive_date: receiveDraft[job.id] ?? job.receive_date,
                        stage: job.stage === "deposit_received" ? "ordered" : job.stage,
                      })
                    }
                  >
                    Save receive
                  </button>
                  <button
                    type="button"
                    className={styles.assignBtn}
                    disabled={busy}
                    onClick={() => {
                      setScheduleJob(job);
                      setScheduleInstaller("");
                      setScheduleAt("");
                    }}
                  >
                    Schedule install
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <p className={styles.sideGroup}>All calendars</p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showCompany}
              onChange={(e) => setShowCompany(e.target.checked)}
            />
            All Company Events
          </label>

          <p className={styles.sideGroup}>Installs by Event</p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showUnassigned}
              onChange={(e) => setShowUnassigned(e.target.checked)}
            />
            <span className={`${styles.dot} ${styles.dotUnassigned}`} />
            Unassigned Installs
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showAssigned}
              onChange={(e) => setShowAssigned(e.target.checked)}
            />
            <span className={`${styles.dot} ${styles.dotAssigned}`} />
            Assigned Installs
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showService}
              onChange={(e) => setShowService(e.target.checked)}
            />
            <span className={`${styles.dot} ${styles.dotSvc}`} />
            Service / G/B
          </label>

          <p className={styles.sideGroup}>Installs by Resource</p>
          <p className={styles.sideHint}>
            {installers.length} installers · assign from an event card
          </p>
          <ul className={styles.resourceList}>
            {installers.map((person) => (
              <li key={person.id}>{person.name}</li>
            ))}
          </ul>
        </aside>

        <div className={styles.main}>
          <div className={styles.toolbar}>
            <div className={styles.navRow}>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => onWeekChange(addDays(weekStart, -7).toISOString())}
              >
                ‹
              </button>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => onWeekChange(startOfWeek().toISOString())}
              >
                Today
              </button>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => onWeekChange(addDays(weekStart, 7).toISOString())}
              >
                ›
              </button>
              <h2 className={styles.range}>{rangeLabel}</h2>
            </div>
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={view === "calendar" ? styles.viewOn : styles.viewOff}
                onClick={() => setView("calendar")}
              >
                Week
              </button>
              <button
                type="button"
                className={view === "list" ? styles.viewOn : styles.viewOff}
                onClick={() => setView("list")}
              >
                List
              </button>
              <button type="button" className={styles.navBtn} onClick={onRefresh}>
                Refresh
              </button>
            </div>
          </div>

          {view === "calendar" ? (
            <div className={styles.weekScroll}>
              <div className={styles.weekGrid}>
                {days.map((day) => {
                  const dayEvents = events.filter((e) => e.date === day.key);
                  return (
                    <div key={day.key} className={styles.dayCol}>
                      <div className={styles.dayHead}>
                        <span>{day.dow}</span>
                        <strong>{day.num}</strong>
                      </div>
                      {showCompany && day.dow === "Mon" ? (
                        <div className={styles.companyBlock}>
                          Company events show here when synced (OOO / sick)
                        </div>
                      ) : null}
                      {dayEvents.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          className={`${styles.card} ${
                            event.tag
                              ? styles.cardSvc
                              : event.assigned
                                ? styles.cardAssigned
                                : styles.cardUnassigned
                          }`}
                          onClick={() => {
                            setSelected(event);
                            setAssignId(event.installerId ?? "");
                          }}
                        >
                          <p className={styles.cardTitle}>
                            <span className={styles.truck} aria-hidden>
                              ▣
                            </span>{" "}
                            {event.title}
                          </p>
                          <p className={styles.cardLine}>{event.designer}</p>
                          <p className={styles.cardLine}>{event.amount}</p>
                          <p className={styles.cardLine}>{event.installerName}</p>
                          {event.notes ? (
                            <p className={styles.cardNotes}>{event.notes}</p>
                          ) : null}
                          {event.soldDate ? (
                            <p className={styles.cardDate}>{shortDate(event.soldDate)}</p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={styles.listWrap}>
              {events.length === 0 ? (
                <p className={styles.empty}>No installs this week for these filters.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Designer</th>
                      <th>Amount</th>
                      <th>Installer</th>
                      <th>Tag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((event) => (
                        <tr
                          key={event.id}
                          onClick={() => {
                            setSelected(event);
                            setAssignId(event.installerId ?? "");
                          }}
                        >
                          <td>{shortDate(event.date)}</td>
                          <td>{event.title}</td>
                          <td>{event.designer}</td>
                          <td>{event.amount}</td>
                          <td>{event.installerName}</td>
                          <td>{event.tag ?? "Install"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-label="Assigned Installs"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHead}>
              <div>
                <p className={styles.modalEyebrow}>Assigned Installs · Event</p>
                <h3 className={styles.modalTitle}>
                  {selected.title} · {shortDate(selected.date)}
                </h3>
              </div>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
            </header>

            <div className={styles.modalTabs}>
              <span className={styles.modalTabOn}>General</span>
              <span className={styles.modalTab}>Chatter</span>
              <span className={styles.modalTab}>Attendees</span>
            </div>

            <div className={styles.modalBody}>
              <p>
                <span className={styles.fieldLabel}>Name</span>
                {selected.clientName}
              </p>
              <p>
                <span className={styles.fieldLabel}>Business Phone</span>
                {selected.phone || "—"}
              </p>
              <p>
                <span className={styles.fieldLabel}>Event Location</span>
                {selected.address || "—"}
              </p>
              <p>
                <span className={styles.fieldLabel}>Description</span>
                {selected.notes || "—"}
              </p>
              <p>
                <span className={styles.fieldLabel}>Designer</span>
                {selected.designer}
              </p>
              <p>
                <span className={styles.fieldLabel}>Amount</span>
                {selected.amount}
              </p>

              <div className={styles.assignBlock}>
                <span className={styles.fieldLabel}>Attached Resources (Installer)</span>
                <div className={styles.assignRow}>
                  <select
                    className={styles.select}
                    value={assignId}
                    onChange={(e) => setAssignId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Unassigned</option>
                    {installers.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.assignBtn}
                    disabled={busy}
                    onClick={() => void saveAssign()}
                  >
                    + Save
                  </button>
                </div>
                <p className={styles.sideHint}>Current: {selected.installerName}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {scheduleJob ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setScheduleJob(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-label="Schedule install"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHead}>
              <div>
                <p className={styles.modalEyebrow}>Ready to Schedule</p>
                <h3 className={styles.modalTitle}>
                  {scheduleJob.client?.name ?? "Client"}
                </h3>
              </div>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => setScheduleJob(null)}
              >
                ✕
              </button>
            </header>
            <div className={styles.modalBody}>
              <p>
                <span className={styles.fieldLabel}>Contract</span>
                {dollars(scheduleJob.contract_cents)}
              </p>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Install date & time</span>
                <input
                  className={styles.select}
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </label>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Installer</span>
                <select
                  className={styles.select}
                  value={scheduleInstaller}
                  onChange={(e) => setScheduleInstaller(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {installers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.assignBtn}
                disabled={busy || !scheduleAt}
                onClick={() => void saveSchedule()}
              >
                Save on Install Calendar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
