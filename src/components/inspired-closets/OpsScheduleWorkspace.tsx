"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import OpsShell from "@/components/inspired-closets/OpsShell";
import OpsWeekCalendar, {
  type WeekCalEvent,
} from "@/components/inspired-closets/OpsWeekCalendar";
import type { IcJobKind } from "@/lib/inspired-closets-ops-jobs";
import { CONSULT_OUTCOMES } from "@/lib/inspired-closets-ops-appointments";
import { installerOffOn, eachDateInclusive } from "@/lib/inspired-closets-field-dates";
import {
  classifyAppointment,
  classifyJob,
  ymdFromIso,
  type CalendarLane,
} from "@/lib/inspired-closets-ops-calendar";
import styles from "./ops-payroll.module.css";

type Staff = { id: string; name: string; role: string; active: boolean };
type Client = { id: string; name: string; phone: string | null; address: string | null };
type Option = { id: string; label: string };

type Appointment = {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  job_id: string | null;
  designer_id: string | null;
  installer_id?: string | null;
  kind: string;
  scheduled_at: string;
  location_type: string;
  status: string;
  delay_reason: string | null;
  confirmation_sent_at: string | null;
  confirmation_note: string | null;
  community_ref: string | null;
  notes: string | null;
  client: Client | null;
  designer: Staff | null;
  installer?: Staff | null;
};

type InstallJob = {
  id: string;
  install_date: string | null;
  sold_date?: string | null;
  stage: string;
  contract_cents?: number;
  notes?: string | null;
  serviceTag?: "SVC" | "G/B" | null;
  job_kind?: IcJobKind | null;
  visit_window?: string | null;
  lead_id?: string | null;
  studio_ref?: string | null;
  community_ref?: string | null;
  receive_date?: string | null;
  tentative_install_notes?: string | null;
  site_ready_notes?: string | null;
  deposit_intake_status?: string | null;
  client: Client | null;
  designer: Staff | null;
  installer?: Staff | null;
  jobCheckOwner?: Staff | null;
};

type LeadOption = {
  id: string;
  client_id: string | null;
  designer_id: string | null;
  converted_job_id: string | null;
  name: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  appointments?: Appointment[];
  installJobs?: InstallJob[];
  readyToSchedule?: InstallJob[];
  awaitingDeposit?: InstallJob[];
  staff?: Staff[];
  clients?: Client[];
  leads?: LeadOption[];
  kinds?: Option[];
  locations?: Option[];
  statuses?: Option[];
  timeOff?: Array<{
    id: string;
    installer_id: string;
    installerName: string;
    kind: string;
    start_date: string;
    end_date: string;
    status: string;
  }>;
};

const CALENDAR_TABS = ["all", "appointments", "installs", "showroom", "gobacks"] as const;
type CalendarTab = (typeof CALENDAR_TABS)[number];

const TAB_LANE: Record<Exclude<CalendarTab, "all">, CalendarLane> = {
  appointments: "appointment",
  installs: "install",
  showroom: "showroom",
  gobacks: "goback",
};

const TAB_CLASS: Record<CalendarTab, string> = {
  all: "",
  appointments: styles.tabAppointment,
  installs: styles.tabInstall,
  showroom: styles.tabShowroom,
  gobacks: styles.tabGoback,
};

const TAB_COPY: Record<CalendarTab, { label: string; subtitle: string }> = {
  all: {
    label: "All",
    subtitle: "Every appointment, install, showroom visit, and go-back this month.",
  },
  appointments: {
    label: "Appointments",
    subtitle: "Design consults this month. Log the outcome after the visit so Des gets Slack.",
  },
  installs: {
    label: "Installs",
    subtitle: "Installs this month — calendar on top, list underneath.",
  },
  showroom: {
    label: "Showroom",
    subtitle: "Showroom visits this month — calendar on top, list underneath.",
  },
  gobacks: {
    label: "Go-backs",
    subtitle: "Go-backs this month — calendar on top, list underneath.",
  },
};

const EMPTY_EVENT = {
  lead_id: "",
  client_id: "",
  job_id: "",
  designer_id: "",
  installer_id: "",
  kind: "consultation",
  location_type: "on_site",
  scheduled_at: "",
  notes: "",
};

function isCalendarTab(value: string | null | undefined): value is CalendarTab {
  return CALENDAR_TABS.includes(value as CalendarTab);
}

function startOfMonth(d = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return date.toISOString();
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeLabel(value: string | null | undefined): string {
  if (!value) return "All day";
  if (value.length === 10) return "All day";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function eventKindLabel(row: Appointment, kinds: Option[]): string {
  if (row.location_type === "showroom") return "Showroom";
  return kinds.find((k) => k.id === row.kind)?.label ?? row.kind;
}

export default function OpsScheduleWorkspace({
  forcedTab,
}: {
  forcedTab?: CalendarTab;
} = {}) {
  const searchParams = useSearchParams();
  const presetLeadId = searchParams.get("leadId");
  const queryTab = searchParams.get("tab");
  const mainTab: CalendarTab = isCalendarTab(queryTab)
    ? queryTab
    : isCalendarTab(forcedTab)
      ? forcedTab
      : "all";

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [installJobs, setInstallJobs] = useState<InstallJob[]>([]);
  const [readyToSchedule, setReadyToSchedule] = useState<InstallJob[]>([]);
  const [awaitingDeposit, setAwaitingDeposit] = useState<InstallJob[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [kinds, setKinds] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [listUpdatedAt, setListUpdatedAt] = useState<Date | null>(null);
  const [reschedule, setReschedule] = useState<Record<string, { at: string; reason: string }>>({});
  const [weekStart, setWeekStart] = useState(() => startOfMonth());
  const [timeOff, setTimeOff] = useState<NonNullable<ApiResponse["timeOff"]>>([]);
  const [form, setForm] = useState({
    ...EMPTY_EVENT,
    lead_id: presetLeadId ?? "",
  });

  useEffect(() => {
    if (presetLeadId) {
      setForm((f) => ({ ...f, lead_id: presetLeadId, kind: "consultation" }));
      setEventOpen(true);
    }
  }, [presetLeadId]);

  const designers = useMemo(
    () => staff.filter((s) => s.role === "designer" || s.role === "owner"),
    [staff],
  );
  const installers = useMemo(
    () => staff.filter((s) => s.role === "installer"),
    [staff],
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const from = weekStart;
      const monthCursor = new Date(weekStart);
      const to = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1).toISOString();
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/inspired-closets/ops/appointments?${params.toString()}`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load schedule.");
      setAppointments(payload.appointments ?? []);
      setInstallJobs(payload.installJobs ?? []);
      setReadyToSchedule(payload.readyToSchedule ?? []);
      setAwaitingDeposit(payload.awaitingDeposit ?? []);
      setStaff(payload.staff ?? []);
      setLeads(payload.leads ?? []);
      setKinds(payload.kinds ?? []);
      setLocations(payload.locations ?? []);
      setTimeOff(payload.timeOff ?? []);
      setListUpdatedAt(new Date());
    } catch (error) {
      if (!opts?.silent) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load schedule.",
        });
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [weekStart]);

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
    if (!eventOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setEventOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eventOpen]);

  const appointmentLaneAppts = useMemo(
    () => appointments.filter((row) => classifyAppointment(row) === "appointment"),
    [appointments],
  );
  const showroomAppts = useMemo(
    () => appointments.filter((row) => classifyAppointment(row) === "showroom"),
    [appointments],
  );
  const installAppts = useMemo(
    () => appointments.filter((row) => classifyAppointment(row) === "install"),
    [appointments],
  );
  const gobackAppts = useMemo(
    () => appointments.filter((row) => classifyAppointment(row) === "goback"),
    [appointments],
  );
  const uncoveredJobs = useMemo(() => {
    const coveredInstall = new Set(
      appointments
        .filter((row) => row.kind === "install" && row.job_id)
        .map((row) => row.job_id as string),
    );
    const coveredGoback = new Set(
      appointments
        .filter((row) => row.kind === "job_check" && row.job_id)
        .map((row) => row.job_id as string),
    );
    return installJobs.filter((job) => {
      const lane = classifyJob(job);
      if (lane === "install") return !coveredInstall.has(job.id);
      if (lane === "goback") return !coveredGoback.has(job.id);
      return true;
    });
  }, [appointments, installJobs]);
  const installLaneJobs = useMemo(
    () => uncoveredJobs.filter((job) => classifyJob(job) === "install"),
    [uncoveredJobs],
  );
  const gobackLaneJobs = useMemo(
    () => uncoveredJobs.filter((job) => classifyJob(job) === "goback"),
    [uncoveredJobs],
  );

  const calendarEvents = useMemo(() => {
    const events: WeekCalEvent[] = [];
    for (const row of appointments) {
      events.push({
        id: `appt-${row.id}`,
        lane: classifyAppointment(row),
        date: ymdFromIso(row.scheduled_at),
        timeLabel: formatTimeLabel(row.scheduled_at),
        title: row.client?.name ?? "Event",
        meta: [row.designer?.name, row.installer?.name].filter(Boolean).join(" · ") || undefined,
      });
    }
    for (const job of uncoveredJobs) {
      if (!job.install_date) continue;
      events.push({
        id: `job-${job.id}`,
        lane: classifyJob(job),
        date: ymdFromIso(job.install_date),
        timeLabel: "All day",
        title: job.client?.name ?? "Job",
        meta: [job.installer?.name, job.designer?.name].filter(Boolean).join(" · ") || undefined,
      });
    }
    for (const row of timeOff) {
      for (const day of eachDateInclusive(row.start_date, row.end_date)) {
        events.push({
          id: `off-${row.id}-${day}`,
          lane: "timeoff",
          date: day,
          timeLabel: row.kind === "sick" ? "Sick" : "PTO",
          title: row.installerName,
          meta: "Off — not bookable",
        });
      }
    }
    return events;
  }, [appointments, timeOff, uncoveredJobs]);

  const visibleEvents = useMemo(() => {
    if (mainTab === "all") return calendarEvents;
    const lane = TAB_LANE[mainTab];
    return calendarEvents.filter((event) => event.lane === lane);
  }, [calendarEvents, mainTab]);

  async function createAppointment() {
    setBusy(true);
    setNotice(null);
    try {
      if (!form.scheduled_at || form.scheduled_at.length < 16) {
        throw new Error("Pick both a date and a time in When (e.g. 08/09/2026, 10:00 AM).");
      }
      const when = new Date(form.scheduled_at);
      if (Number.isNaN(when.getTime())) {
        throw new Error("When is invalid — set a full date and time.");
      }
      const leadId = form.lead_id.trim();
      if (!leadId) {
        throw new Error("Pick the lead this event is for.");
      }
      const isShowroom = form.kind === "showroom";
      const response = await fetch("/api/inspired-closets/ops/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          kind: isShowroom ? "consultation" : form.kind,
          location_type: isShowroom ? "showroom" : form.location_type,
          lead_id: leadId,
          client_id: form.client_id || null,
          job_id: form.job_id || null,
          designer_id: form.designer_id || null,
          installer_id: form.installer_id || null,
          scheduled_at: when.toISOString(),
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create appointment.");
      setNotice({
        kind: "info",
        text: "Event saved. It will show on this schedule and on the lead.",
      });
      setForm({ ...EMPTY_EVENT });
      setEventOpen(false);
      await load({ silent: true });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create appointment.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function patchAppointment(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Update failed.");
      if (body.action === "complete_consult") {
        setNotice({
          kind: "info",
          text: "Consult logged. Des was pinged on Slack.",
        });
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

  async function assignInstaller(jobId: string, installerId: string | null) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, installer_id: installerId }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not assign installer.");
      setNotice({ kind: "info", text: "Installer updated on install." });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not assign installer.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function logInstallConfirm(jobId: string) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          kind: "install",
          action: "confirm_install",
          confirmation_note: "Logged install confirm (Podium/text sent manually)",
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Could not log confirm.");
      setNotice({ kind: "info", text: "Install confirm logged." });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not log confirm.",
      });
    } finally {
      setBusy(false);
    }
  }

  const jobChoices = useMemo(() => {
    const seen = new Set<string>();
    const rows: InstallJob[] = [];
    for (const job of [...readyToSchedule, ...installJobs, ...awaitingDeposit]) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      rows.push(job);
    }
    return rows.filter((job) => !form.lead_id || job.lead_id === form.lead_id);
  }, [readyToSchedule, installJobs, awaitingDeposit, form.lead_id]);

  function applyLead(leadId: string) {
    const lead = leads.find((row) => row.id === leadId);
    setForm((f) => ({
      ...f,
      lead_id: leadId,
      client_id: lead?.client_id ?? "",
      designer_id: lead?.designer_id ?? f.designer_id,
      job_id: lead?.converted_job_id ?? (f.kind === "install" ? "" : f.job_id),
    }));
  }

  function openNewEvent() {
    const lead = presetLeadId ? leads.find((row) => row.id === presetLeadId) : null;
    const kind =
      mainTab === "installs"
        ? "install"
        : mainTab === "showroom"
          ? "showroom"
          : mainTab === "gobacks"
            ? "job_check"
            : "consultation";
    setForm({
      ...EMPTY_EVENT,
      kind,
      location_type: kind === "showroom" ? "showroom" : "on_site",
      lead_id: presetLeadId ?? "",
      client_id: lead?.client_id ?? "",
      designer_id: lead?.designer_id ?? "",
      job_id: lead?.converted_job_id ?? "",
    });
    setEventOpen(true);
  }

  function renderAppointmentTable(rows: Appointment[]) {
    if (rows.length === 0) {
      return <p className={styles.empty}>Nothing this month.</p>;
    }
    return (
      <table className={styles.table} style={{ minWidth: "48rem" }}>
        <thead>
          <tr>
            <th>When</th>
            <th>Kind</th>
            <th>Client</th>
            <th>Designer</th>
            <th>Status</th>
            <th>After consult</th>
            <th>Podium confirm</th>
            <th>Reschedule</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const draft = reschedule[row.id] ?? {
              at: row.scheduled_at.slice(0, 16),
              reason: "",
            };
            return (
              <tr key={row.id}>
                <td>{formatStamp(row.scheduled_at)}</td>
                <td>{eventKindLabel(row, kinds)}</td>
                <td>{row.client?.name ?? "—"}</td>
                <td>{row.designer?.name ?? "—"}</td>
                <td>{row.status}</td>
                <td>
                  {row.kind !== "consultation" ? (
                    <span className={styles.handoffDone}>—</span>
                  ) : row.status === "completed" ? (
                    <span className={`${styles.statusBadge} ${styles.statusPaid}`}>
                      Consult logged
                    </span>
                  ) : row.status === "cancelled" ? (
                    <span className={styles.handoffDone}>Cancelled</span>
                  ) : (
                    <div className={styles.handoffRow}>
                      {CONSULT_OUTCOMES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={styles.handoffBtn}
                          disabled={busy}
                          onClick={() =>
                            void patchAppointment({
                              id: row.id,
                              action: "complete_consult",
                              outcome: item.id,
                            })
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {row.confirmation_sent_at ? (
                    <span className={`${styles.statusBadge} ${styles.statusPaid}`}>
                      Logged {formatStamp(row.confirmation_sent_at)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.buttonGhost}
                      disabled={busy}
                      onClick={() =>
                        void patchAppointment({
                          id: row.id,
                          action: "confirm_podium",
                        })
                      }
                    >
                      Log Podium confirm
                    </button>
                  )}
                </td>
                <td>
                  <div style={{ display: "grid", gap: "0.25rem", minWidth: "12rem" }}>
                    <input
                      className={styles.input}
                      type="datetime-local"
                      value={draft.at}
                      onChange={(e) =>
                        setReschedule((m) => ({
                          ...m,
                          [row.id]: { ...draft, at: e.target.value },
                        }))
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Delay reason (required)"
                      value={draft.reason}
                      onChange={(e) =>
                        setReschedule((m) => ({
                          ...m,
                          [row.id]: { ...draft, reason: e.target.value },
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={styles.buttonGhost}
                      disabled={busy || !draft.reason.trim() || !draft.at}
                      onClick={() =>
                        void patchAppointment({
                          id: row.id,
                          action: "reschedule",
                          scheduled_at: new Date(draft.at).toISOString(),
                          delay_reason: draft.reason,
                        })
                      }
                    >
                      Reschedule
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  function renderJobishTable(
    appts: Appointment[],
    jobs: InstallJob[],
    emptyText: string,
    withInstallConfirm: boolean,
  ) {
    if (appts.length === 0 && jobs.length === 0) {
      return <p className={styles.empty}>{emptyText}</p>;
    }
    return (
      <table className={styles.table} style={{ minWidth: "42rem" }}>
        <thead>
          <tr>
            <th>When</th>
            <th>Client</th>
            <th>Designer</th>
            <th>Installer</th>
            <th>Status</th>
            {withInstallConfirm ? <th>Confirm</th> : null}
          </tr>
        </thead>
        <tbody>
          {appts.map((row) => (
            <tr key={`appt-${row.id}`}>
              <td>{formatStamp(row.scheduled_at)}</td>
              <td>{row.client?.name ?? "—"}</td>
              <td>{row.designer?.name ?? "—"}</td>
              <td>{row.installer?.name ?? "—"}</td>
              <td>{row.status}</td>
              {withInstallConfirm ? (
                <td>
                  {row.confirmation_sent_at ? (
                    <span className={`${styles.statusBadge} ${styles.statusPaid}`}>
                      Logged
                    </span>
                  ) : row.job_id ? (
                    <button
                      type="button"
                      className={styles.buttonGhost}
                      disabled={busy}
                      onClick={() => void logInstallConfirm(row.job_id as string)}
                    >
                      Log confirm
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              ) : null}
            </tr>
          ))}
          {jobs.map((job) => (
            <tr key={`job-${job.id}`}>
              <td>{formatStamp(job.install_date)}</td>
              <td>{job.client?.name ?? "—"}</td>
              <td>{job.designer?.name ?? "—"}</td>
              <td>
                <select
                  className={styles.input}
                  value={job.installer?.id ?? ""}
                  disabled={busy}
                  onChange={(e) => void assignInstaller(job.id, e.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {installers.map((person) => {
                    const day = job.install_date ?? "";
                    const off = day ? installerOffOn(person.id, day, timeOff) : false;
                    return (
                      <option key={person.id} value={person.id} disabled={off}>
                        {person.name}
                        {off ? " (PTO/sick)" : ""}
                      </option>
                    );
                  })}
                </select>
              </td>
              <td>{job.stage}</td>
              {withInstallConfirm ? (
                <td>
                  <button
                    type="button"
                    className={styles.buttonGhost}
                    disabled={busy}
                    onClick={() => void logInstallConfirm(job.id)}
                  >
                    Log confirm
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <OpsShell title="Calendar" subtitle={TAB_COPY[mainTab].subtitle}>
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <div className={styles.listToolbar}>
        <nav className={styles.tabs} aria-label="Calendar views">
          {CALENDAR_TABS.map((tab) => (
            <a
              key={tab}
              className={`${styles.tab} ${TAB_CLASS[tab]} ${mainTab === tab ? styles.tabActive : ""}`}
              href={
                tab === "all"
                  ? "/inspired-closets/ops/appointments"
                  : `/inspired-closets/ops/appointments?tab=${tab}`
              }
              style={{ textDecoration: "none" }}
            >
              {TAB_COPY[tab].label}
            </a>
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
          <button type="button" className={styles.buttonPrimary} onClick={openNewEvent}>
            + New Event
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.panel}>
          <p className={styles.empty}>Loading calendar…</p>
        </div>
      ) : (
        <>
          <OpsWeekCalendar
            events={visibleEvents}
            weekStartIso={weekStart}
            onWeekChange={setWeekStart}
          />

          {mainTab === "appointments" ? (
            <div className={styles.panel}>
              <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
                Appointments this month
              </p>
              {renderAppointmentTable(appointmentLaneAppts)}
            </div>
          ) : null}

          {mainTab === "installs" ? (
            <div className={styles.panel}>
              <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
                Installs this month
              </p>
              {renderJobishTable(installAppts, installLaneJobs, "No installs this month.", true)}
            </div>
          ) : null}

          {mainTab === "showroom" ? (
            <div className={styles.panel}>
              <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
                Showroom this month
              </p>
              {renderAppointmentTable(showroomAppts)}
            </div>
          ) : null}

          {mainTab === "gobacks" ? (
            <div className={styles.panel}>
              <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
                Go-backs this month
              </p>
              {renderJobishTable(gobackAppts, gobackLaneJobs, "No go-backs this month.", false)}
            </div>
          ) : null}
        </>
      )}

      {eventOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setEventOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-label="New Event"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>New Event</h3>
            <p className={styles.leadContact} style={{ marginBottom: "0.75rem" }}>
              Same as New Event on a lead. Pick the person, then who is going — designer,
              installer, or both.
            </p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <select
                className={styles.input}
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value;
                  setForm((f) => ({
                    ...f,
                    kind,
                    location_type: kind === "showroom" ? "showroom" : kind === "consultation" ? "on_site" : f.location_type,
                    job_id: kind === "install" ? f.job_id : "",
                  }));
                }}
              >
                <option value="consultation">Design Event</option>
                <option value="showroom">Showroom</option>
                <option value="install">Install Event</option>
                <option value="job_check">Go-back</option>
              </select>
            </label>
            <label className={styles.field} style={{ marginTop: "0.55rem" }}>
              <span className={styles.fieldLabel}>Lead</span>
              <select
                className={styles.input}
                value={form.lead_id}
                onChange={(e) => applyLead(e.target.value)}
              >
                <option value="">Select a lead</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field} style={{ marginTop: "0.55rem" }}>
              <span className={styles.fieldLabel}>When</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              />
            </label>
            {form.kind !== "showroom" ? (
              <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                <span className={styles.fieldLabel}>Location</span>
                <select
                  className={styles.input}
                  value={form.location_type}
                  onChange={(e) => setForm((f) => ({ ...f, location_type: e.target.value }))}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className={styles.field} style={{ marginTop: "0.55rem" }}>
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
            <label className={styles.field} style={{ marginTop: "0.55rem" }}>
              <span className={styles.fieldLabel}>Installer (optional)</span>
              <select
                className={styles.input}
                value={form.installer_id}
                onChange={(e) => setForm((f) => ({ ...f, installer_id: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {installers.map((person) => {
                  const day = form.scheduled_at ? form.scheduled_at.slice(0, 10) : "";
                  const off = day ? installerOffOn(person.id, day, timeOff) : false;
                  return (
                    <option key={person.id} value={person.id} disabled={off}>
                      {person.name}
                      {off ? " (PTO/sick)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            {form.kind === "install" ? (
              <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                <span className={styles.fieldLabel}>Job</span>
                <select
                  className={styles.input}
                  value={form.job_id}
                  onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))}
                >
                  <option value="">Select the sold job</option>
                  {jobChoices.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.client?.name ?? "Job"} {job.studio_ref ? `· ${job.studio_ref}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className={styles.formActions} style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => setEventOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={busy || !form.scheduled_at || !form.lead_id}
                onClick={() => void createAppointment()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </OpsShell>
  );
}
