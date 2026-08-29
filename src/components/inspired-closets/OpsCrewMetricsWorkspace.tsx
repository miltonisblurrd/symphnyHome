"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import { ISSUE_TYPES, MEDIA_KINDS } from "@/lib/inspired-closets-ops-field";
import { JOB_KINDS, stageLabel } from "@/lib/inspired-closets-ops-jobs";
import styles from "./ops-payroll.module.css";

type InstallerMetric = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  phone: string | null;
  email: string | null;
  title: string;
  hiredAt: string | null;
  tenureLabel: string;
  avatarUrl: string | null;
  initials: string;
  onSiteNow: boolean;
  sessions: number;
  openSessions: number;
  totalMinutes: number;
  avgSessionMinutes: number | null;
  avgJobMinutes: number | null;
  jobsClocked: number;
  completions: number;
  activeJobs: number;
  issuesReported: number;
  openIssues: number;
  hasPassword?: boolean;
};

type SessionRow = {
  id: string;
  installerName: string;
  clientName: string;
  clockInAt: string;
  clockOutAt: string | null;
  minutes: number | null;
  open: boolean;
  note: string | null;
};

type IssueFileRow = {
  id: string;
  clientName: string;
  issueType: string;
  status: string;
  description: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type JobFileRow = {
  id: string;
  clientName: string;
  address: string | null;
  phone: string | null;
  stage: string;
  installDate: string | null;
  completedDate: string | null;
  jobKind: string | null;
  visitWindow: string | null;
  notes: string | null;
};

type MediaRow = {
  id: string;
  kind: string;
  publicUrl: string | null;
  caption: string | null;
  createdAt: string;
  clientName: string;
};

type UpcomingRow = {
  id: string;
  kind: string;
  scheduledAt: string;
  status: string;
  subject: string | null;
  locationText: string | null;
  clientName: string;
};

type DetailFile = {
  installer: InstallerMetric;
  sessions: SessionRow[];
  issues: IssueFileRow[];
  jobs: JobFileRow[];
  media: MediaRow[];
  upcoming: UpcomingRow[];
  timeOff: Array<{
    id: string;
    kind: string;
    start_date: string;
    end_date: string;
    note: string | null;
    status: string;
  }>;
  pay: {
    last_pay_cents: number;
    last_pay_date: string | null;
    next_pay_date: string | null;
    classification: string | null;
    bank_last4: string | null;
    bank_status: string | null;
  } | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  installers?: InstallerMetric[];
  installer?: InstallerMetric;
  sessions?: SessionRow[];
  issues?: IssueFileRow[];
  jobs?: JobFileRow[];
  media?: MediaRow[];
  upcoming?: UpcomingRow[];
  timeOff?: DetailFile["timeOff"];
  pay?: DetailFile["pay"];
};

type DetailTab = "details" | "jobs" | "clocks" | "issues" | "photos" | "timeoff" | "access";
type ListFilter = "all" | "on_site";

function formatMinutes(mins: number | null | undefined): string {
  if (mins == null) return "—";
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  if (hours <= 0) return `${m}m`;
  return `${hours}h ${m}m`;
}

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

function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function issueLabel(id: string): string {
  return ISSUE_TYPES.find((item) => item.id === id)?.label ?? id.replace(/_/g, " ");
}

function mediaLabel(id: string): string {
  return MEDIA_KINDS.find((item) => item.id === id)?.label ?? id.replace(/_/g, " ");
}

function jobKindLabel(id: string | null): string {
  if (!id) return "—";
  return JOB_KINDS.find((item) => item.id === id)?.label ?? id.replace(/_/g, " ");
}

function Avatar({
  installer,
  large,
}: {
  installer: Pick<InstallerMetric, "avatarUrl" | "initials" | "name">;
  large?: boolean;
}) {
  const className = large ? styles.installerAvatarLg : styles.installerAvatar;
  if (installer.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={installer.avatarUrl} alt="" className={className} />
    );
  }
  return (
    <span className={className} aria-hidden>
      {installer.initials || installer.name.slice(0, 1)}
    </span>
  );
}

export default function OpsCrewMetricsWorkspace() {
  const [installers, setInstallers] = useState<InstallerMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [listUpdatedAt, setListUpdatedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailFile | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [fieldPassword, setFieldPassword] = useState("");
  const [fieldPhone, setFieldPhone] = useState("");
  const [updateTitle, setUpdateTitle] = useState("");
  const [updateBody, setUpdateBody] = useState("");
  const [payLast, setPayLast] = useState("");
  const [payNext, setPayNext] = useState("");
  const [payAmount, setPayAmount] = useState("");

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/crew-metrics");
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load installers.");
      setInstallers(payload.installers ?? []);
      setListUpdatedAt(new Date());
    } catch (error) {
      if (!opts?.silent) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load installers.",
        });
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/inspired-closets/ops/crew-metrics?id=${encodeURIComponent(id)}`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok || !payload.installer) {
        throw new Error(payload.error ?? "Installer not found.");
      }
      setDetail({
        installer: payload.installer,
        sessions: payload.sessions ?? [],
        issues: payload.issues ?? [],
        jobs: payload.jobs ?? [],
        media: payload.media ?? [],
        upcoming: payload.upcoming ?? [],
        timeOff: payload.timeOff ?? [],
        pay: payload.pay ?? null,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to open installer.",
      });
      setSelectedId(null);
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    function onFocus() {
      if (selectedId) void loadDetail(selectedId);
      else void loadList({ silent: true });
    }
    const timer = window.setInterval(() => {
      if (selectedId) void loadDetail(selectedId);
      else void loadList({ silent: true });
    }, 30_000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadList, loadDetail, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
        setDetailTab("details");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const visibleInstallers = useMemo(
    () => (listFilter === "on_site" ? installers.filter((row) => row.onSiteNow) : installers),
    [installers, listFilter],
  );

  const totalIssues = installers.reduce((sum, row) => sum + row.issuesReported, 0);
  const totalCompletions = installers.reduce((sum, row) => sum + row.completions, 0);
  const totalMinutes = installers.reduce((sum, row) => sum + row.totalMinutes, 0);
  const onSiteCount = installers.filter((row) => row.onSiteNow).length;

  function closeFile() {
    setSelectedId(null);
    setDetailTab("details");
    setFieldPassword("");
  }

  async function saveFieldAccess() {
    if (!detail) return;
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/installers/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detail.installer.id,
          password: fieldPassword,
          phone: fieldPhone || detail.installer.phone || "",
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not set password.");
      setFieldPassword("");
      setNotice({
        kind: "info",
        text: "Saved. They sign in to Installers with this same phone and password.",
      });
      await loadDetail(detail.installer.id);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not set password.",
      });
    }
  }

  async function decideTimeOff(id: string, decision: "approved" | "denied") {
    try {
      const response = await fetch("/api/inspired-closets/ops/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not update.");
      setNotice({ kind: "info", text: decision === "approved" ? "Approved. Calendar will show it." : "Denied. They’ll see a bell." });
      if (selectedId) await loadDetail(selectedId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not update.",
      });
    }
  }

  async function savePayVision() {
    if (!detail) return;
    try {
      const response = await fetch("/api/inspired-closets/ops/time-off", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detail.installer.id,
          last_pay_dollars: payAmount,
          last_pay_date: payLast || null,
          next_pay_date: payNext || null,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not save pay preview.");
      setNotice({ kind: "info", text: "Pay dates saved for the installer Me screen." });
      await loadDetail(detail.installer.id);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save pay preview.",
      });
    }
  }

  async function postCompanyUpdate() {
    try {
      const response = await fetch("/api/inspired-closets/ops/company-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: updateTitle, body: updateBody }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not post.");
      setUpdateTitle("");
      setUpdateBody("");
      setNotice({ kind: "info", text: "Posted. Every installer will see it on Today." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not post.",
      });
    }
  }

  if (selectedId && detail) {
    const person = detail.installer;
    const contact = [
      person.phone ?? "No phone",
      person.email,
      person.title,
      person.tenureLabel,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <OpsShell title={person.name} hideTitle>
        {notice ? (
          <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
            {notice.text}
          </p>
        ) : null}

        <div className={styles.leadHeader}>
          <div className={styles.installerIdentity}>
            <Avatar installer={person} large />
            <div>
              <h1 className={styles.leadName}>
                {person.name}
                {person.onSiteNow ? <span className={styles.liveChip}>On site</span> : null}
              </h1>
              <p className={styles.leadContact}>{contact}</p>
            </div>
          </div>
          <div className={styles.leadHeaderActions}>
            <button type="button" className={styles.buttonGhost} onClick={closeFile}>
              ← Back to installers
            </button>
          </div>
        </div>

        <div className={styles.leadTabs}>
          {(
            [
              ["details", "details"],
              ["jobs", "jobs"],
              ["clocks", "clocks"],
              ["issues", "issues"],
              ["photos", "photos"],
              ["timeoff", "time off"],
              ["access", "app login"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.leadTab} ${detailTab === id ? styles.leadTabActive : ""}`}
              onClick={() => setDetailTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.leadLayout}>
          <div className={styles.panel}>
            {detailTab === "details" ? (
              <div className={styles.detailGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Title</span>
                  <p className={styles.readValue}>{person.title}</p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <p className={styles.readValue}>
                    {person.phone ? (
                      <a href={`tel:${person.phone}`}>{person.phone}</a>
                    ) : (
                      "—"
                    )}
                  </p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Email</span>
                  <p className={styles.readValue}>
                    {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : "—"}
                  </p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Started</span>
                  <p className={styles.readValue}>{formatDay(person.hiredAt)}</p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Tenure</span>
                  <p className={styles.readValue}>{person.tenureLabel}</p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Status</span>
                  <p className={styles.readValue}>
                    {person.onSiteNow ? "Clocked in" : "Not on a job"}
                    {!person.active ? " · Inactive" : ""}
                  </p>
                </label>
              </div>
            ) : null}

            {detailTab === "jobs" ? (
              detail.jobs.length === 0 ? (
                <p className={styles.empty}>No jobs assigned or timed for this installer yet.</p>
              ) : (
                <table className={styles.table} style={{ minWidth: "42rem" }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Address</th>
                      <th>Stage</th>
                      <th>Kind</th>
                      <th>Install</th>
                      <th>Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <strong>{job.clientName}</strong>
                        </td>
                        <td className={styles.notesCell}>{job.address ?? "—"}</td>
                        <td>{stageLabel(job.stage)}</td>
                        <td>{jobKindLabel(job.jobKind)}</td>
                        <td>{formatDay(job.installDate ?? job.completedDate)}</td>
                        <td>{job.visitWindow ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}

            {detailTab === "clocks" ? (
              detail.sessions.length === 0 ? (
                <p className={styles.empty}>No installer clocks yet.</p>
              ) : (
                <table className={styles.table} style={{ minWidth: "40rem" }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Duration</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.sessions.map((row) => (
                      <tr key={row.id} className={row.open ? styles.rowHeld : undefined}>
                        <td>{row.clientName}</td>
                        <td>{formatStamp(row.clockInAt)}</td>
                        <td>{row.open ? "On site" : formatStamp(row.clockOutAt)}</td>
                        <td>{row.open ? "—" : formatMinutes(row.minutes)}</td>
                        <td className={styles.notesCell}>{row.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}

            {detailTab === "issues" ? (
              detail.issues.length === 0 ? (
                <p className={styles.empty}>No field issues reported by this installer.</p>
              ) : (
                <table className={styles.table} style={{ minWidth: "40rem" }}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Client</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>What happened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.issues.map((row) => (
                      <tr key={row.id} className={row.status === "open" ? styles.rowHeld : undefined}>
                        <td>{formatStamp(row.createdAt)}</td>
                        <td>{row.clientName}</td>
                        <td>{issueLabel(row.issueType)}</td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${
                              row.status === "open" ? styles.statusHeld : styles.statusPaid
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className={styles.notesCell}>{row.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}

            {detailTab === "photos" ? (
              detail.media.length === 0 ? (
                <p className={styles.empty}>No photos from this installer yet.</p>
              ) : (
                <div className={styles.installerMediaGrid}>
                  {detail.media.map((item) => (
                    <figure key={item.id} className={styles.installerMediaCard}>
                      {item.publicUrl ? (
                        <a href={item.publicUrl} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.publicUrl} alt={item.caption || item.kind} />
                        </a>
                      ) : (
                        <div className={styles.installerMediaMissing}>No preview</div>
                      )}
                      <figcaption>
                        {mediaLabel(item.kind)} · {item.clientName}
                        {item.caption ? ` · ${item.caption}` : ""}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )
            ) : null}

            {detailTab === "timeoff" ? (
              detail.timeOff.length === 0 ? (
                <p className={styles.empty}>No PTO or sick requests yet.</p>
              ) : (
                <table className={styles.table} style={{ minWidth: "36rem" }}>
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Dates</th>
                      <th>Status</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.timeOff.map((row) => (
                      <tr key={row.id}>
                        <td>{row.kind === "sick" ? "Sick" : "PTO"}</td>
                        <td>
                          {row.start_date}
                          {row.end_date !== row.start_date ? ` → ${row.end_date}` : ""}
                        </td>
                        <td>{row.status}</td>
                        <td className={styles.notesCell}>{row.note ?? "—"}</td>
                        <td>
                          {row.status === "requested" ? (
                            <>
                              <button type="button" className={styles.buttonPrimary} onClick={() => void decideTimeOff(row.id, "approved")}>
                                Approve
                              </button>{" "}
                              <button type="button" className={styles.buttonGhost} onClick={() => void decideTimeOff(row.id, "denied")}>
                                Deny
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}

            {detailTab === "access" ? (
              <div className={styles.detailGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>App phone</span>
                  <input
                    className={styles.input}
                    value={fieldPhone || person.phone || ""}
                    onChange={(e) => setFieldPhone(e.target.value)}
                    placeholder="7025550100"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Set / reset password</span>
                  <input
                    className={styles.input}
                    type="password"
                    value={fieldPassword}
                    onChange={(e) => setFieldPassword(e.target.value)}
                    placeholder={person.hasPassword ? "New password" : "First password"}
                  />
                </label>
                <p className={styles.leadContact} style={{ gridColumn: "1 / -1" }}>
                  Installers sign-in uses this exact phone. A random number on the app screen will fail
                  unless you save it here first.
                  {person.hasPassword ? " A password is already on file — reset only if they forgot it." : " No password yet."}
                </p>
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.buttonPrimary}
                    disabled={fieldPassword.length < 6 || (fieldPhone || person.phone || "").replace(/\D/g, "").length < 10}
                    onClick={() => void saveFieldAccess()}
                  >
                    Save app login
                  </button>
                </div>
                <p className={styles.detailSectionTitle} style={{ gridColumn: "1 / -1" }}>
                  Pay preview (installer Me)
                </p>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Last pay $</span>
                  <input className={styles.input} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0" />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Last pay date</span>
                  <input className={styles.input} type="date" value={payLast} onChange={(e) => setPayLast(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Next pay date</span>
                  <input className={styles.input} type="date" value={payNext} onChange={(e) => setPayNext(e.target.value)} />
                </label>
                <p className={styles.leadContact} style={{ gridColumn: "1 / -1" }}>
                  {detail.pay?.bank_last4
                    ? `Deposit last 4 ···${detail.pay.bank_last4} · ${detail.pay.bank_status}`
                    : "No deposit last 4 on file."}
                </p>
                <div className={styles.formActions}>
                  <button type="button" className={styles.buttonGhost} onClick={() => void savePayVision()}>
                    Save pay preview
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <aside>
            <div className={styles.railCard}>
              <p className={styles.railTitle}>Snapshot</p>
              <p className={styles.leadContact}>
                Completions <strong>{person.completions}</strong>
              </p>
              <p className={styles.leadContact}>
                Active jobs <strong>{person.activeJobs}</strong>
              </p>
              <p className={styles.leadContact}>
                Issues <strong>{person.issuesReported}</strong>
                {person.openIssues > 0 ? ` · ${person.openIssues} open` : ""}
              </p>
              <p className={styles.leadContact}>
                Clocked <strong>{formatMinutes(person.totalMinutes)}</strong>
              </p>
              <p className={styles.leadContact}>
                Avg / session <strong>{formatMinutes(person.avgSessionMinutes)}</strong>
              </p>
              <p className={styles.leadContact}>
                Avg / job <strong>{formatMinutes(person.avgJobMinutes)}</strong>
              </p>
            </div>

            <div className={styles.railCard}>
              <p className={styles.railTitle}>Upcoming</p>
              {detail.upcoming.filter((item) =>
                item.status === "scheduled" || item.status === "confirmed",
              ).length === 0 ? (
                <p className={styles.leadContact}>No upcoming visits on the calendar.</p>
              ) : (
                detail.upcoming
                  .filter((item) => item.status === "scheduled" || item.status === "confirmed")
                  .slice()
                  .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                  .slice(0, 6)
                  .map((item) => (
                    <div key={item.id} className={`${styles.leadContact} ${styles.railEvent}`}>
                      <strong>{item.clientName}</strong>
                      <br />
                      {formatStamp(item.scheduledAt)} · {item.kind.replace(/_/g, " ")}
                      {item.locationText ? ` · ${item.locationText}` : ""}
                    </div>
                  ))
              )}
            </div>
          </aside>
        </div>
      </OpsShell>
    );
  }

  return (
    <OpsShell
      title="Install Workers"
      subtitle="Office file for each worker — clocks, jobs, issues, and photos from Installers."
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <div className={styles.statStrip} aria-label="Installer totals">
        {(
          [
            { label: "Workers", value: String(installers.length) },
            { label: "On site", value: String(onSiteCount), tone: onSiteCount > 0 ? "live" : undefined },
            { label: "Completions", value: String(totalCompletions) },
            { label: "Issues", value: String(totalIssues), tone: totalIssues > 0 ? "alert" : undefined },
            { label: "Clocked time", value: formatMinutes(totalMinutes) },
          ] as const
        ).map((item) => (
          <article
            key={item.label}
            className={`${styles.statCard} ${
              "tone" in item && item.tone === "live"
                ? styles.statCardLive
                : "tone" in item && item.tone === "alert"
                  ? styles.statCardAlert
                  : ""
            }`}
          >
            <p className={styles.statCardLabel}>{item.label}</p>
            <p className={styles.statCardValue}>{item.value}</p>
          </article>
        ))}
      </div>

      <div className={styles.listToolbar}>
        <nav className={styles.tabs} aria-label="Installer views">
          {(
            [
              ["all", "All"],
              ["on_site", "On site"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.tab} ${listFilter === id ? styles.tabActive : ""}`}
              onClick={() => setListFilter(id)}
            >
              {label}
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
        </div>
      </div>

      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.fieldLabel}>Company update — all installers see this on Today</p>
        <div className={styles.detailGrid} style={{ marginTop: "0.55rem" }}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input className={styles.input} value={updateTitle} onChange={(e) => setUpdateTitle(e.target.value)} placeholder="Saturday warehouse closed" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Message</span>
            <textarea
              className={styles.input}
              rows={3}
              value={updateBody}
              onChange={(e) => setUpdateBody(e.target.value)}
              placeholder="Warehouse closed Saturday. No pickups."
            />
          </label>
        </div>
        <button
          type="button"
          className={styles.buttonPrimary}
          style={{ marginTop: "0.65rem" }}
          disabled={!updateTitle.trim() || !updateBody.trim()}
          onClick={() => void postCompanyUpdate()}
        >
          Post to Installers
        </button>
      </div>

      <div className={styles.panel}>
        {loading ? (
          <p className={styles.empty}>Loading installers…</p>
        ) : visibleInstallers.length === 0 ? (
          <p className={styles.empty}>
            {listFilter === "on_site"
              ? "Nobody is clocked in right now."
              : "No workers on file yet. Add them in staff, then they clock in on Installers."}
          </p>
        ) : (
          <table className={styles.table} style={{ minWidth: "48rem" }}>
            <thead>
              <tr>
                <th>Installer</th>
                <th>Completions</th>
                <th>Issues</th>
                <th>Open issues</th>
                <th>Sessions</th>
                <th>Jobs timed</th>
                <th>Total time</th>
                <th>Avg / session</th>
                <th>Avg / job</th>
              </tr>
            </thead>
            <tbody>
              {visibleInstallers.map((row) => (
                <tr
                  key={row.id}
                  className={`${styles.leadRow} ${row.openIssues > 0 ? styles.rowHeld : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setDetailTab("details");
                    setSelectedId(row.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailTab("details");
                      setSelectedId(row.id);
                    }
                  }}
                >
                  <td>
                    <span className={styles.installerNameCell}>
                      <Avatar installer={row} />
                      <span>
                        <strong>{row.name}</strong>
                        {row.onSiteNow ? <span className={styles.liveChip}>On site</span> : null}
                      </span>
                    </span>
                  </td>
                  <td>{row.completions}</td>
                  <td>{row.issuesReported}</td>
                  <td>{row.openIssues}</td>
                  <td>
                    {row.sessions}
                    {row.openSessions > 0 ? ` (${row.openSessions} open)` : ""}
                  </td>
                  <td>{row.jobsClocked}</td>
                  <td>{formatMinutes(row.totalMinutes)}</td>
                  <td>{formatMinutes(row.avgSessionMinutes)}</td>
                  <td>{formatMinutes(row.avgJobMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </OpsShell>
  );
}
