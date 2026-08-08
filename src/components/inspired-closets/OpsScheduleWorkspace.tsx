"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import OpsShell from "@/components/inspired-closets/OpsShell";
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
  stage: string;
  client: Client | null;
  designer: Staff | null;
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
  closing?: Closing[];
  staff?: Staff[];
  clients?: Client[];
  kinds?: Option[];
  locations?: Option[];
  statuses?: Option[];
  appointment?: Appointment;
};

function startOfWeek(d = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfWeek(d = new Date()): string {
  const start = new Date(startOfWeek(d));
  start.setDate(start.getDate() + 7);
  return start.toISOString();
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

export default function OpsScheduleWorkspace() {
  const searchParams = useSearchParams();
  const presetLeadId = searchParams.get("leadId");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [installJobs, setInstallJobs] = useState<InstallJob[]>([]);
  const [closing, setClosing] = useState<Closing[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [kinds, setKinds] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [designerFilter, setDesignerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [reschedule, setReschedule] = useState<Record<string, { at: string; reason: string }>>({});
  const [form, setForm] = useState({
    lead_id: presetLeadId ?? "",
    client_id: "",
    job_id: "",
    designer_id: "",
    kind: "consultation",
    location_type: "on_site",
    scheduled_at: "",
    notes: "",
    community_ref: "",
  });

  useEffect(() => {
    if (presetLeadId) {
      setForm((f) => ({ ...f, lead_id: presetLeadId, kind: "consultation" }));
    }
  }, [presetLeadId]);

  const designers = useMemo(
    () => staff.filter((s) => s.role === "designer" || s.role === "owner"),
    [staff],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: startOfWeek(),
        to: endOfWeek(),
      });
      if (designerFilter) params.set("designerId", designerFilter);
      const response = await fetch(`/api/inspired-closets/ops/appointments?${params.toString()}`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load schedule.");
      setAppointments(payload.appointments ?? []);
      setInstallJobs(payload.installJobs ?? []);
      setClosing(payload.closing ?? []);
      setStaff(payload.staff ?? []);
      setClients(payload.clients ?? []);
      setKinds(payload.kinds ?? []);
      setLocations(payload.locations ?? []);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load schedule.",
      });
    } finally {
      setLoading(false);
    }
  }, [designerFilter]);

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
          designer_id: form.designer_id || null,
          scheduled_at: when.toISOString(),
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create appointment.");
      setNotice({
        kind: "info",
        text: "Appointment saved. Confirm in Community / Google Calendar as needed.",
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

  return (
    <OpsShell
      title="Schedule"
      subtitle="This week’s consultations, job checks, and installs. Manual double-entry with Community."
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

      <div className={styles.summaryRow}>
        {closing.slice(0, 8).map((row) => (
          <span key={row.id}>
            {row.name}{" "}
            <span className={styles.summaryStrong}>
              {row.closingRatioPct == null ? "—" : `${row.closingRatioPct}%`}
            </span>
            <span style={{ color: row.closingRatioPct != null && row.closingRatioPct < 50 ? "var(--ic-red)" : undefined }}>
              {" "}
              ({row.converted}/{row.assigned})
            </span>
          </span>
        ))}
      </div>

      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
          New appointment
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
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
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

      <div className={styles.panel}>
        {loading ? (
          <p className={styles.empty}>Loading schedule…</p>
        ) : (
          <>
            <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
              Appointments this week
            </p>
            {appointments.length === 0 ? (
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
                  {appointments.map((row) => {
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

            <p className={styles.subtitle} style={{ margin: "1.25rem 0 0.75rem" }}>
              Jobs with install dates (from Jobs spine)
            </p>
            {installJobs.length === 0 ? (
              <p className={styles.empty}>No install dates set this week.</p>
            ) : (
              <table className={styles.table} style={{ minWidth: "36rem" }}>
                <thead>
                  <tr>
                    <th>Install date</th>
                    <th>Client</th>
                    <th>Designer</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {installJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.install_date}</td>
                      <td>{job.client?.name ?? "—"}</td>
                      <td>{job.designer?.name ?? "—"}</td>
                      <td>{job.stage.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </OpsShell>
  );
}
