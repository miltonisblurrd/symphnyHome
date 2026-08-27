"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import OpsShell from "@/components/inspired-closets/OpsShell";
import OpsInstallCalendar from "@/components/inspired-closets/OpsInstallCalendar";
import type { IcJobKind } from "@/lib/inspired-closets-ops-jobs";
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

type Closing = {
  id: string;
  name: string;
  assigned: number;
  converted: number;
  closingRatioPct: number | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  appointments?: Appointment[];
  installJobs?: InstallJob[];
  readyToSchedule?: InstallJob[];
  awaitingDeposit?: InstallJob[];
  closing?: Closing[];
  staff?: Staff[];
  clients?: Client[];
  kinds?: Option[];
  locations?: Option[];
  statuses?: Option[];
  appointment?: Appointment;
  googleCalendar?: {
    configured?: boolean;
    calendarId?: string | null;
    serviceAccountEmail?: string | null;
    officeChecklist?: string[];
    ok?: boolean;
    skipped?: boolean;
    reason?: string;
    error?: string;
    action?: string;
  };
};

function startOfWeek(d = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function addDays(iso: string, days: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d;
}

export default function OpsScheduleWorkspace({
  forcedTab,
}: {
  forcedTab?: "appointments" | "installs" | "designers";
} = {}) {
  const searchParams = useSearchParams();
  const presetLeadId = searchParams.get("leadId");
  const tabParam = forcedTab ?? searchParams.get("tab");
  const mainTab =
    tabParam === "installs" ? "installs" : tabParam === "designers" ? "designers" : "appointments";

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [installJobs, setInstallJobs] = useState<InstallJob[]>([]);
  const [readyToSchedule, setReadyToSchedule] = useState<InstallJob[]>([]);
  const [awaitingDeposit, setAwaitingDeposit] = useState<InstallJob[]>([]);
  const [closing, setClosing] = useState<Closing[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [kinds, setKinds] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [designerFilter, setDesignerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<ApiResponse["googleCalendar"] | null>(null);
  const [reschedule, setReschedule] = useState<Record<string, { at: string; reason: string }>>({});
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [form, setForm] = useState({
    lead_id: presetLeadId ?? "",
    client_id: "",
    job_id: "",
    designer_id: "",
    installer_id: "",
    kind: "consultation",
    location_type: "on_site",
    scheduled_at: "",
    notes: "",
    community_ref: "",
  });

  const consultAppts = useMemo(
    () => appointments.filter((a) => a.kind !== "install"),
    [appointments],
  );

  useEffect(() => {
    if (presetLeadId) {
      setForm((f) => ({ ...f, lead_id: presetLeadId, kind: "consultation" }));
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = weekStart;
      const to = addDays(weekStart, 7).toISOString();
      const params = new URLSearchParams({ from, to });
      if (designerFilter) params.set("designerId", designerFilter);
      const response = await fetch(`/api/inspired-closets/ops/appointments?${params.toString()}`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load schedule.");
      setAppointments(payload.appointments ?? []);
      setInstallJobs(payload.installJobs ?? []);
      setReadyToSchedule(payload.readyToSchedule ?? []);
      setAwaitingDeposit(payload.awaitingDeposit ?? []);
      setClosing(payload.closing ?? []);
      setStaff(payload.staff ?? []);
      setClients(payload.clients ?? []);
      setKinds(payload.kinds ?? []);
      setLocations(payload.locations ?? []);
      setCalendarStatus(payload.googleCalendar ?? null);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load schedule.",
      });
    } finally {
      setLoading(false);
    }
  }, [designerFilter, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

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
      if (leadId && !/^[0-9a-f-]{36}$/i.test(leadId)) {
        throw new Error(
          "Lead id looks incomplete. Paste the full UUID from Leads, or clear the field and pick Client.",
        );
      }
      const response = await fetch("/api/inspired-closets/ops/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lead_id: leadId || null,
          client_id: form.client_id || null,
          job_id: form.job_id || null,
          designer_id: form.kind === "install" ? null : form.designer_id || null,
          installer_id: form.kind === "install" ? form.installer_id || null : null,
          scheduled_at: when.toISOString(),
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create appointment.");
      const cal = payload.googleCalendar;
      const calNote =
        cal?.ok === true
          ? ` Google Calendar: ${cal.action ?? "synced"}.`
          : cal?.skipped
            ? " Google Calendar not connected yet (office setup)."
            : cal?.error
              ? ` Google Calendar error: ${cal.error}`
              : "";
      setNotice({
        kind: "info",
        text: `Appointment saved. Confirm in Community as needed.${calNote}`,
      });
      setForm((f) => ({
        ...f,
        scheduled_at: "",
        notes: "",
        job_id: "",
      }));
      await load();
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

  async function scheduleInstall(input: {
    jobId: string;
    leadId: string | null;
    scheduledAt: string;
    installerId: string | null;
    acknowledgeNoReceiveDate?: boolean;
    jobKind?: string;
    visitWindow?: string | null;
  }) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "install",
          job_id: input.jobId,
          lead_id: input.leadId,
          scheduled_at: input.scheduledAt,
          installer_id: input.installerId,
          location_type: "on_site",
          job_kind: input.jobKind ?? null,
          visit_window: input.visitWindow ?? null,
          notes: input.acknowledgeNoReceiveDate
            ? "Scheduled without Studio receive date (Des acknowledged)."
            : null,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Could not schedule install.");
      setNotice({
        kind: "info",
        text: "Install scheduled — Slack notified. Log customer confirm from the event card when sent.",
      });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not schedule install.",
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

  async function advanceJobStage(jobId: string, patch: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, ...patch }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not update job.");
      setNotice({ kind: "info", text: "Job stage updated." });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not update job.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsShell
      title={mainTab === "installs" ? "Installs" : mainTab === "designers" ? "Designer load" : "Appointments"}
      subtitle={
        mainTab === "installs"
          ? "Scheduled installs this week — assign from the lead/project with Install Event"
          : mainTab === "designers"
            ? "Which designer got which leads (closing ratio)"
            : "Scheduled appointments — prefer New Event on the lead so there’s no double entry"
      }
      actions={
        <>
          <select
            className={styles.input}
            style={{ width: "auto" }}
            value={designerFilter}
            onChange={(e) => setDesignerFilter(e.target.value)}
          >
            <option value="">All designers</option>
            {designers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
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

      <nav className={styles.tabs}>
        <a
          className={`${styles.tab} ${mainTab === "appointments" ? styles.tabActive : ""}`}
          href="/inspired-closets/ops/appointments"
          style={{ textDecoration: "none" }}
        >
          Appointments
        </a>
        <a
          className={`${styles.tab} ${mainTab === "installs" ? styles.tabActive : ""}`}
          href="/inspired-closets/ops/installs"
          style={{ textDecoration: "none" }}
        >
          Installs
        </a>
        <a
          className={`${styles.tab} ${mainTab === "designers" ? styles.tabActive : ""}`}
          href="/inspired-closets/ops/schedule?tab=designers"
          style={{ textDecoration: "none" }}
        >
          Designers
        </a>
      </nav>

      <p className={styles.notice}>
        {calendarStatus?.configured ? (
          <>
            Google Calendar: <strong>connected</strong>
            {calendarStatus.calendarId ? ` · ${calendarStatus.calendarId}` : ""}. New /
            rescheduled appointments push automatically.
          </>
        ) : (
          <>
            Google Calendar: <strong>not connected</strong> — appointments still save here.
            Prefer booking from the lead’s <strong>New Event</strong> so the lead auto-moves to
            Scheduled.
          </>
        )}
      </p>

      {mainTab === "designers" ? (
        <div className={styles.panel}>
          <div className={styles.summaryRow}>
            {closing.map((row) => (
              <span key={row.id}>
                {row.name}{" "}
                <span className={styles.summaryStrong}>
                  {row.closingRatioPct == null ? "—" : `${row.closingRatioPct}%`}
                </span>
                <span
                  style={{
                    color:
                      row.closingRatioPct != null && row.closingRatioPct < 50
                        ? "var(--ic-red)"
                        : undefined,
                  }}
                >
                  {" "}
                  ({row.converted}/{row.assigned})
                </span>
              </span>
            ))}
          </div>
          {closing.length === 0 ? (
            <p className={styles.empty}>No designer stats yet.</p>
          ) : null}
        </div>
      ) : null}

      {mainTab === "appointments" ? (
      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
          Manual add (only if needed — normally use New Event on the lead)
        </p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>When</span>
            <input
              className={styles.input}
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Kind</span>
            <select
              className={styles.input}
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  kind: e.target.value,
                  designer_id: "",
                  installer_id: "",
                }))
              }
            >
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
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
          {form.kind === "install" ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Installer</span>
              <select
                className={styles.input}
                value={form.installer_id}
                onChange={(e) => setForm((f) => ({ ...f, installer_id: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {installers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
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
          )}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Client</span>
            <select
              className={styles.input}
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
            >
              <option value="">From lead / none</option>
              {clients.slice(0, 400).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Lead id (optional)</span>
            <input
              className={styles.input}
              value={form.lead_id}
              onChange={(e) => setForm((f) => ({ ...f, lead_id: e.target.value }))}
              placeholder="From Leads → Set appointment"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Job id (install)</span>
            <input
              className={styles.input}
              value={form.job_id}
              onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))}
              placeholder="Required for install kind"
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
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={busy || !form.scheduled_at}
              onClick={() => void createAppointment()}
            >
              Save appointment
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {mainTab !== "designers" ? (
      <div className={styles.panel}>
        {loading ? (
          <p className={styles.empty}>Loading schedule…</p>
        ) : mainTab === "appointments" ? (
          <>
            <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
              Appointments this week (design / consult)
            </p>
            {consultAppts.length === 0 ? (
              <p className={styles.empty}>No appointments this week.</p>
            ) : (
              <table className={styles.table} style={{ minWidth: "48rem" }}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>Client</th>
                    <th>Designer</th>
                    <th>Status</th>
                    <th>Podium confirm</th>
                    <th>Reschedule</th>
                  </tr>
                </thead>
                <tbody>
                  {consultAppts.map((row) => {
                    const draft = reschedule[row.id] ?? {
                      at: row.scheduled_at.slice(0, 16),
                      reason: "",
                    };
                    return (
                      <tr key={row.id}>
                        <td>{formatStamp(row.scheduled_at)}</td>
                        <td>{kinds.find((k) => k.id === row.kind)?.label ?? row.kind}</td>
                        <td>{row.client?.name ?? "—"}</td>
                        <td>{row.designer?.name ?? "—"}</td>
                        <td>{row.status}</td>
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
            )}
          </>
        ) : (
          <OpsInstallCalendar
            jobs={installJobs}
            readyToSchedule={readyToSchedule}
            awaitingDeposit={awaitingDeposit}
            installers={installers}
            busy={busy}
            weekStartIso={weekStart}
            onWeekChange={setWeekStart}
            onRefresh={() => void load()}
            onAssignInstaller={assignInstaller}
            onScheduleInstall={scheduleInstall}
            onAdvanceStage={advanceJobStage}
            onLogInstallConfirm={logInstallConfirm}
          />
        )}
      </div>
      ) : null}
    </OpsShell>
  );
}
