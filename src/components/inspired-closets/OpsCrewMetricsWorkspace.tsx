"use client";

import { useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type InstallerMetric = {
  id: string;
  name: string;
  role: string;
  sessions: number;
  openSessions: number;
  totalMinutes: number;
  avgSessionMinutes: number | null;
  avgJobMinutes: number | null;
  jobsClocked: number;
  completions: number;
  issuesReported: number;
  openIssues: number;
};

type SessionRow = {
  id: string;
  installerName: string;
  clientName: string;
  clockInAt: string;
  clockOutAt: string | null;
  minutes: number | null;
  open: boolean;
};

type IssueRow = {
  id: string;
  installerName: string;
  clientName: string;
  issueType: string;
  status: string;
  createdAt: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  storage?: { clocks: string; issues: string; completions: string };
  installers?: InstallerMetric[];
  recentSessions?: SessionRow[];
  recentIssues?: IssueRow[];
};

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

export default function OpsCrewMetricsWorkspace() {
  const [installers, setInstallers] = useState<InstallerMetric[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [storageNote, setStorageNote] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"crew" | "sessions" | "issues">("crew");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/crew-metrics");
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load crew metrics.");
      setInstallers(payload.installers ?? []);
      setSessions(payload.recentSessions ?? []);
      setIssues(payload.recentIssues ?? []);
      if (payload.storage) {
        setStorageNote(
          `Clocks → ${payload.storage.clocks} · Issues → ${payload.storage.issues} · Completions → ${payload.storage.completions}`,
        );
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load crew metrics.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalIssues = installers.reduce((sum, row) => sum + row.issuesReported, 0);
  const totalCompletions = installers.reduce((sum, row) => sum + row.completions, 0);
  const totalMinutes = installers.reduce((sum, row) => sum + row.totalMinutes, 0);

  return (
    <OpsShell
      title="Crew metrics"
      subtitle="Installer time, issues, and completions — fuel for Gavin and AI later."
      actions={
        <button type="button" className={styles.buttonGhost} onClick={() => void load()}>
          Refresh
        </button>
      }
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <div className={styles.summaryRow}>
        <span>
          Completions <span className={styles.summaryStrong}>{totalCompletions}</span>
        </span>
        <span>
          Issues reported <span className={styles.summaryStrong}>{totalIssues}</span>
        </span>
        <span>
          Clocked time <span className={styles.summaryStrong}>{formatMinutes(totalMinutes)}</span>
        </span>
      </div>
      {storageNote ? <p className={styles.subtitle}>{storageNote}</p> : null}

      <nav className={styles.tabs}>
        {(
          [
            ["crew", "By installer"],
            ["sessions", "Recent clocks"],
            ["issues", "Recent issues"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className={styles.panel}>
          <p className={styles.empty}>Loading crew metrics…</p>
        </div>
      ) : tab === "crew" ? (
        <div className={styles.panel}>
          {installers.length === 0 ? (
            <p className={styles.empty}>
              No installer activity yet. Have drivers Clock in / out on the Field app.
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
                {installers.map((row) => (
                  <tr key={row.id} className={row.openIssues > 0 ? styles.rowHeld : undefined}>
                    <td>{row.name}</td>
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
      ) : tab === "sessions" ? (
        <div className={styles.panel}>
          {sessions.length === 0 ? (
            <p className={styles.empty}>No clock entries in ic_time_entries yet.</p>
          ) : (
            <table className={styles.table} style={{ minWidth: "40rem" }}>
              <thead>
                <tr>
                  <th>Installer</th>
                  <th>Client</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.installerName}</td>
                    <td>{row.clientName}</td>
                    <td>{formatStamp(row.clockInAt)}</td>
                    <td>{row.open ? "On site" : formatStamp(row.clockOutAt)}</td>
                    <td>{row.open ? "—" : formatMinutes(row.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className={styles.panel}>
          {issues.length === 0 ? (
            <p className={styles.empty}>No field issues reported yet.</p>
          ) : (
            <table className={styles.table} style={{ minWidth: "36rem" }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Installer</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((row) => (
                  <tr key={row.id} className={row.status === "open" ? styles.rowHeld : undefined}>
                    <td>{formatStamp(row.createdAt)}</td>
                    <td>{row.installerName}</td>
                    <td>{row.clientName}</td>
                    <td>{row.issueType.replace(/_/g, " ")}</td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          row.status === "open" ? styles.statusHeld : styles.statusPaid
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </OpsShell>
  );
}
