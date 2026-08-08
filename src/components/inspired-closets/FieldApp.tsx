"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ISSUE_TYPES,
  MEDIA_KINDS,
  isInstallerRole,
} from "@/lib/inspired-closets-ops-field";
import styles from "./field.module.css";

type Staff = { id: string; name: string; role: string; active: boolean };

type TimeEntry = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_lat: string | null;
  clock_in_lng: string | null;
  clock_out_lat: string | null;
  clock_out_lng: string | null;
};

type Job = {
  id: string;
  stage: string;
  install_date: string | null;
  contract_cents: number;
  notes: string | null;
  risk_flag: boolean;
  mine: boolean;
  client: { id: string; name: string; address: string | null; phone: string | null } | null;
  openClock: TimeEntry | null;
  timeEntries?: TimeEntry[];
};

type Media = {
  id: string;
  kind: string;
  public_url: string | null;
  caption: string | null;
  created_at: string;
};

type Issue = {
  id: string;
  issue_type: string;
  description: string;
  status: string;
  created_at: string;
};

type OfflineItem = {
  id: string;
  kind: "clock" | "issue";
  payload: Record<string, unknown>;
  createdAt: string;
};

type ApiPayload = {
  ok: boolean;
  error?: string;
  message?: string;
  installers?: Staff[];
  staff?: Staff;
  installer?: { id: string; name: string };
  jobs?: Job[];
  media?: Media[];
  issues?: Issue[];
};

const OFFLINE_KEY = "ic-field-offline-queue";

function readQueue(): OfflineItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? "[]") as OfflineItem[];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineItem[]) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(items));
}

function getGeo(): Promise<{ lat: string | null; lng: string | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
        }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

function formatStamp(value: string | null | undefined): string {
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

function formatDuration(clockIn: string, clockOut: string | null): string {
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const minutes = Math.round((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export default function FieldApp() {
  const [online, setOnline] = useState(true);
  const [installers, setInstallers] = useState<Staff[]>([]);
  const [installer, setInstaller] = useState<{ id: string; name: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error" | "ok"; text: string } | null>(
    null,
  );
  const [newDriverName, setNewDriverName] = useState("");
  const [mediaKind, setMediaKind] = useState("before");
  const [issueType, setIssueType] = useState("site_not_ready");
  const [issueText, setIssueText] = useState("");
  const [queueCount, setQueueCount] = useState(0);

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const refreshQueueCount = useCallback(() => {
    setQueueCount(readQueue().length);
  }, []);

  const loadSessionStaff = useCallback(async () => {
    const response = await fetch("/api/inspired-closets/ops/session");
    const payload = (await response.json()) as ApiPayload;
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load drivers.");
    setInstallers(payload.installers ?? []);
  }, []);

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/inspired-closets/field/jobs");
    if (response.status === 401) {
      setInstaller(null);
      setJobs([]);
      return;
    }
    const payload = (await response.json()) as ApiPayload;
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load jobs.");
    setInstaller(payload.installer ?? null);
    setJobs(payload.jobs ?? []);
    setSelectedId((current) => current ?? payload.jobs?.[0]?.id ?? null);
  }, []);

  const loadJobDetails = useCallback(async (jobId: string) => {
    const [mediaRes, issuesRes] = await Promise.all([
      fetch(`/api/inspired-closets/field/media?jobId=${jobId}`),
      fetch(`/api/inspired-closets/field/issues?jobId=${jobId}`),
    ]);
    const mediaPayload = (await mediaRes.json()) as ApiPayload;
    const issuesPayload = (await issuesRes.json()) as ApiPayload;
    if (mediaPayload.ok) setMedia(mediaPayload.media ?? []);
    if (issuesPayload.ok) setIssues(issuesPayload.issues ?? []);
  }, []);

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) return;
    const remaining: OfflineItem[] = [];
    for (const item of queue) {
      try {
        if (item.kind === "clock") {
          const response = await fetch("/api/inspired-closets/field/clock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });
          if (!response.ok) remaining.push(item);
        } else if (item.kind === "issue") {
          const response = await fetch("/api/inspired-closets/field/issues", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });
          if (!response.ok) remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    refreshQueueCount();
    if (remaining.length < queue.length) {
      setNotice({ kind: "ok", text: `Synced ${queue.length - remaining.length} offline action(s).` });
      await loadJobs();
    }
  }, [loadJobs, refreshQueueCount]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    refreshQueueCount();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushQueue, refreshQueueCount]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadSessionStaff();
        await loadJobs();
        await flushQueue();
      } catch (error) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to start field app.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [flushQueue, loadJobs, loadSessionStaff]);

  useEffect(() => {
    if (selectedId) void loadJobDetails(selectedId);
  }, [selectedId, loadJobDetails]);

  async function signIn(staffId: string) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId }),
      });
      const payload = (await response.json()) as ApiPayload;
      if (!payload.ok || !payload.staff) throw new Error(payload.error ?? "Sign-in failed.");
      if (!isInstallerRole(payload.staff.role)) {
        throw new Error("This login is for drivers/installers only.");
      }
      setInstaller(payload.staff);
      await loadJobs();
      setNotice({ kind: "ok", text: `Signed in as ${payload.staff.name}.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Sign-in failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function createDriver() {
    if (!newDriverName.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create_name: newDriverName.trim(), role: "installer" }),
      });
      const payload = (await response.json()) as ApiPayload;
      if (!payload.ok || !payload.staff) {
        throw new Error(payload.error ?? "Could not create driver.");
      }
      setInstaller(payload.staff);
      setNewDriverName("");
      await loadSessionStaff();
      await loadJobs();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not create driver.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/inspired-closets/ops/session", { method: "DELETE" });
    setInstaller(null);
    setJobs([]);
    setSelectedId(null);
    setNotice({
      kind: "info",
      text: "Signed out of driver mode. You can open Jobs / Inventory / Payroll now.",
    });
  }

  async function clock(action: "in" | "out") {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    const geo = await getGeo();
    const payload = {
      job_id: selected.id,
      action,
      lat: geo.lat,
      lng: geo.lng,
    };
    try {
      if (!navigator.onLine) {
        const queue = readQueue();
        queue.push({
          id: crypto.randomUUID(),
          kind: "clock",
          payload,
          createdAt: new Date().toISOString(),
        });
        writeQueue(queue);
        refreshQueueCount();
        setNotice({
          kind: "info",
          text: `Offline — clock ${action} saved. Will sync when you’re back online.`,
        });
        return;
      }
      const response = await fetch("/api/inspired-closets/field/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ApiPayload;
      if (!data.ok) throw new Error(data.error ?? "Clock failed.");
      const stamp = formatStamp(new Date().toISOString());
      setNotice({
        kind: "ok",
        text:
          action === "in"
            ? `Clocked in at ${stamp}.`
            : `Clocked out at ${stamp}.`,
      });
      await loadJobs();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Clock failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      if (!navigator.onLine) {
        throw new Error("Photos need a connection. Capture when you’re back online.");
      }
      const form = new FormData();
      form.set("job_id", selected.id);
      form.set("kind", mediaKind);
      form.set("file", file);
      const response = await fetch("/api/inspired-closets/field/media", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as ApiPayload;
      if (!data.ok) throw new Error(data.error ?? "Upload failed.");
      setNotice({ kind: "ok", text: "Photo saved to job." });
      await loadJobDetails(selected.id);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function reportIssue() {
    if (!selected || !issueText.trim()) return;
    setBusy(true);
    const payload = {
      job_id: selected.id,
      issue_type: issueType,
      description: issueText.trim(),
    };
    try {
      if (!navigator.onLine) {
        const queue = readQueue();
        queue.push({
          id: crypto.randomUUID(),
          kind: "issue",
          payload,
          createdAt: new Date().toISOString(),
        });
        writeQueue(queue);
        refreshQueueCount();
        setIssueText("");
        setNotice({ kind: "info", text: "Offline — issue queued." });
        return;
      }
      const response = await fetch("/api/inspired-closets/field/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ApiPayload;
      if (!data.ok) throw new Error(data.error ?? "Could not report issue.");
      setIssueText("");
      setNotice({ kind: "ok", text: "Issue flagged for the office." });
      await loadJobDetails(selected.id);
      await loadJobs();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not report issue.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function completeJob() {
    if (!selected) return;
    if (!window.confirm(`Mark ${selected.client?.name ?? "this job"} install complete?`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selected.id, action: "complete" }),
      });
      const data = (await response.json()) as ApiPayload;
      if (!data.ok) throw new Error(data.error ?? "Could not complete job.");
      setNotice({
        kind: "ok",
        text: "Install complete. Office can trigger final payment.",
      });
      await loadJobs();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not complete job.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Loading field app…</p>
      </div>
    );
  }

  if (!installer) {
    return (
      <div className={styles.page}>
        {!online ? <div className={styles.offlineBanner}>You’re offline</div> : null}
        <header className={styles.top}>
          <div>
            <p className={styles.brand}>Inspired Closets OS</p>
            <h1 className={styles.title}>Field</h1>
            <p className={styles.subtitle}>Drivers & installers only</p>
          </div>
        </header>
        {notice ? (
          <p
            className={`${styles.notice} ${
              notice.kind === "error"
                ? styles.noticeError
                : notice.kind === "ok"
                  ? styles.noticeOk
                  : ""
            }`}
          >
            {notice.text}
          </p>
        ) : null}
        <section className={`${styles.card} ${styles.loginCard}`}>
          <h2 className={styles.jobName}>Who’s driving today?</h2>
          <p className={styles.jobMeta}>
            Pick your name. This app cannot open Jobs, Inventory, or Payroll.
          </p>
          <div className={styles.driverList}>
            {installers.map((member) => (
              <button
                key={member.id}
                type="button"
                className={styles.driverBtn}
                disabled={busy}
                onClick={() => void signIn(member.id)}
              >
                {member.name}
              </button>
            ))}
          </div>
          <div className={styles.field}>
            <span className={styles.label}>New driver</span>
            <input
              className={styles.input}
              value={newDriverName}
              onChange={(event) => setNewDriverName(event.target.value)}
              placeholder="First name"
            />
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.full}`}
            style={{ marginTop: "0.75rem", width: "100%" }}
            disabled={busy || !newDriverName.trim()}
            onClick={() => void createDriver()}
          >
            Add me & sign in
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {!online ? (
        <div className={styles.offlineBanner}>
          Offline mode · {queueCount} queued action{queueCount === 1 ? "" : "s"}
        </div>
      ) : queueCount > 0 ? (
        <div className={styles.offlineBanner}>Syncing {queueCount} queued action(s)…</div>
      ) : null}

      <header className={styles.top}>
        <div>
          <p className={styles.brand}>Inspired Closets OS · Field</p>
          <h1 className={styles.title}>{installer.name}</h1>
          <p className={styles.subtitle}>Clock · photos · issues · complete</p>
        </div>
        <button type="button" className={styles.pill} onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      {notice ? (
        <p
          className={`${styles.notice} ${
            notice.kind === "error"
              ? styles.noticeError
              : notice.kind === "ok"
                ? styles.noticeOk
                : ""
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <p className={styles.sectionTitle}>Today’s jobs</p>
      {jobs.length === 0 ? (
        <p className={styles.empty}>
          No install jobs assigned yet. Ops can move a job to Install scheduled, or you can claim
          an open one when it appears.
        </p>
      ) : (
        jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className={`${styles.card} ${selectedId === job.id ? styles.cardActive : ""}`}
            style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
            onClick={() => setSelectedId(job.id)}
          >
            <h2 className={styles.jobName}>{job.client?.name ?? "Client"}</h2>
            <p className={styles.jobMeta}>
              {job.client?.address || "No address on file"}
              {job.install_date ? ` · ${job.install_date}` : ""}
            </p>
            <div className={styles.badgeRow}>
              <span className={styles.badge}>{stageLabel(job.stage)}</span>
              {job.openClock ? (
                <span className={styles.badgeOk}>
                  In since {formatStamp(job.openClock.clock_in_at)}
                </span>
              ) : null}
              {job.risk_flag ? <span className={styles.badgeHot}>Issue</span> : null}
              {job.mine ? <span className={styles.badge}>Mine</span> : null}
            </div>
          </button>
        ))
      )}

      {selected ? (
        <>
          <p className={styles.sectionTitle}>On site · {selected.client?.name}</p>
          <section className={styles.card}>
            <p className={styles.jobMeta}>
              {selected.client?.phone ? `📞 ${selected.client.phone}` : "No phone"}
              {selected.notes ? ` · ${selected.notes}` : ""}
            </p>
            {selected.openClock ? (
              <p className={styles.jobMeta} style={{ marginTop: "0.55rem", fontWeight: 700 }}>
                Clocked in {formatStamp(selected.openClock.clock_in_at)} · live{" "}
                {formatDuration(selected.openClock.clock_in_at, null)}
                {selected.openClock.clock_in_lat
                  ? ` · GPS ${Number(selected.openClock.clock_in_lat).toFixed(4)}, ${Number(selected.openClock.clock_in_lng).toFixed(4)}`
                  : ""}
              </p>
            ) : (
              <p className={styles.jobMeta} style={{ marginTop: "0.55rem" }}>
                Not clocked in
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnOk}
                disabled={busy || Boolean(selected.openClock)}
                onClick={() => void clock("in")}
              >
                Clock in
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={busy || !selected.openClock}
                onClick={() => void clock("out")}
              >
                Clock out
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.full}`}
                disabled={busy || selected.stage === "install_complete"}
                onClick={() => void completeJob()}
              >
                Mark install complete
              </button>
            </div>
            {(selected.timeEntries?.length ?? 0) > 0 ? (
              <div style={{ marginTop: "0.85rem" }}>
                <p className={styles.label}>Time log</p>
                {selected.timeEntries?.map((entry) => (
                  <p key={entry.id} className={styles.jobMeta} style={{ marginTop: "0.35rem" }}>
                    In {formatStamp(entry.clock_in_at)}
                    {entry.clock_out_at
                      ? ` → Out ${formatStamp(entry.clock_out_at)} · ${formatDuration(entry.clock_in_at, entry.clock_out_at)}`
                      : " → still on site"}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className={styles.card}>
            <h3 className={styles.jobName}>Photos</h3>
            <div className={styles.field}>
              <span className={styles.label}>Type</span>
              <select
                className={styles.select}
                value={mediaKind}
                onChange={(event) => setMediaKind(event.target.value)}
              >
                {MEDIA_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Capture / upload</span>
              <input
                className={styles.input}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  event.target.value = "";
                }}
              />
            </div>
            {media.length > 0 ? (
              <div className={styles.mediaGrid}>
                {media.map((item) =>
                  item.public_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={item.id}
                      src={item.public_url}
                      alt={item.caption || item.kind}
                      className={styles.mediaThumb}
                    />
                  ) : null,
                )}
              </div>
            ) : (
              <p className={styles.jobMeta} style={{ marginTop: "0.65rem" }}>
                No photos yet — snap before / during / after.
              </p>
            )}
          </section>

          <section className={styles.card}>
            <h3 className={styles.jobName}>Report issue</h3>
            <div className={styles.field}>
              <span className={styles.label}>Type</span>
              <select
                className={styles.select}
                value={issueType}
                onChange={(event) => setIssueType(event.target.value)}
              >
                {ISSUE_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>What happened</span>
              <textarea
                className={styles.textarea}
                value={issueText}
                onChange={(event) => setIssueText(event.target.value)}
                placeholder="Site not ready, missing hardware, damage…"
              />
            </div>
            <button
              type="button"
              className={`${styles.btnDanger} ${styles.full}`}
              style={{ marginTop: "0.75rem", width: "100%" }}
              disabled={busy || !issueText.trim()}
              onClick={() => void reportIssue()}
            >
              Flag issue to office
            </button>
            {issues.length > 0 ? (
              <div style={{ marginTop: "0.75rem" }}>
                {issues.map((issue) => (
                  <p key={issue.id} className={styles.jobMeta}>
                    · {issue.issue_type.replace(/_/g, " ")} — {issue.description}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      <div className={styles.dock}>
        <button type="button" className={styles.btnGhost} onClick={() => void loadJobs()}>
          Refresh jobs
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => void flushQueue()}>
          Sync queue ({queueCount})
        </button>
      </div>
    </div>
  );
}
