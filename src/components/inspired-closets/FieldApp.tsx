"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ISSUE_TYPES,
  MEDIA_KINDS,
  isInstallerRole,
} from "@/lib/inspired-closets-ops-field";
import FieldWeekBoard, {
  type FieldBoardCrew,
} from "@/components/inspired-closets/FieldWeekBoard";
import styles from "./field.module.css";

type Staff = { id: string; name: string; role: string; active: boolean };

type InstallerProfile = {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
  hiredAt: string | null;
  title: string;
  initials: string;
  tenureLabel: string;
  onSiteNow: boolean;
  stats: {
    installsCompleted: number;
    activeJobs: number;
    issuesReported: number;
    openIssues: number;
  };
  recentInstalls: Array<{
    id: string;
    clientName: string;
    address: string | null;
    stage: string;
    installDate: string | null;
    completedDate: string | null;
  }>;
};

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
  profiles?: InstallerProfile[];
  profile?: InstallerProfile | null;
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

function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(clockIn: string, clockOut: string | null, now = Date.now()): string {
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const minutes = Math.round((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function Avatar({
  profile,
  large,
}: {
  profile: Pick<InstallerProfile, "avatarUrl" | "initials" | "name">;
  large?: boolean;
}) {
  if (profile.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatarUrl}
        alt={profile.name}
        className={`${styles.avatar} ${large ? styles.avatarLg : ""}`}
      />
    );
  }
  return (
    <div
      className={`${styles.avatar} ${styles.avatarFallback} ${large ? styles.avatarLg : ""}`}
      aria-hidden
    >
      {profile.initials || "?"}
    </div>
  );
}

export default function FieldApp() {
  const [online, setOnline] = useState(true);
  const [profiles, setProfiles] = useState<InstallerProfile[]>([]);
  const [installer, setInstaller] = useState<{ id: string; name: string } | null>(null);
  const [myProfile, setMyProfile] = useState<InstallerProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error" | "ok"; text: string } | null>(
    null,
  );
  const [newDriverName, setNewDriverName] = useState("");
  const [mediaKind, setMediaKind] = useState("before");
  const [issueType, setIssueType] = useState("site_not_ready");
  const [issueText, setIssueText] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const [tab, setTab] = useState<"board" | "jobs" | "profile">("board");
  const [boardDays, setBoardDays] = useState<Array<{ key: string; dow: string; num: number }>>([]);
  const [boardCrew, setBoardCrew] = useState<FieldBoardCrew[]>([]);
  const [boardUnassigned, setBoardUnassigned] = useState<Record<string, FieldBoardCrew["cells"][string]>>({});

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const refreshQueueCount = useCallback(() => {
    setQueueCount(readQueue().length);
  }, []);

  const loadProfiles = useCallback(async (staffId?: string) => {
    const url = staffId
      ? `/api/inspired-closets/field/profiles?id=${staffId}`
      : "/api/inspired-closets/field/profiles";
    const response = await fetch(url);
    const payload = (await response.json()) as ApiPayload;
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load installer profiles.");
    if (staffId) {
      setMyProfile(payload.profile ?? null);
    } else {
      setProfiles(payload.profiles ?? []);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/inspired-closets/field/jobs");
    if (response.status === 401) {
      setInstaller(null);
      setMyProfile(null);
      setJobs([]);
      return;
    }
    const payload = (await response.json()) as ApiPayload;
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load jobs.");
    setInstaller(payload.installer ?? null);
    setJobs(payload.jobs ?? []);
    setSelectedId((current) => current ?? payload.jobs?.[0]?.id ?? null);
    if (payload.installer?.id) {
      await loadProfiles(payload.installer.id);
    }
    try {
      const boardRes = await fetch("/api/inspired-closets/field/board");
      const boardPayload = (await boardRes.json()) as {
        ok: boolean;
        days?: Array<{ key: string; dow: string; num: number }>;
        installers?: FieldBoardCrew[];
        unassigned?: FieldBoardCrew["cells"];
      };
      if (boardPayload.ok) {
        setBoardDays(boardPayload.days ?? []);
        setBoardCrew(boardPayload.installers ?? []);
        setBoardUnassigned(boardPayload.unassigned ?? {});
      }
    } catch {
      /* board is additive */
    }
  }, [loadProfiles]);

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
        await loadProfiles();
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
  }, [flushQueue, loadJobs, loadProfiles]);

  useEffect(() => {
    if (selectedId) void loadJobDetails(selectedId);
  }, [selectedId, loadJobDetails]);

  const hasOpenClock = jobs.some((job) => Boolean(job.openClock));
  useEffect(() => {
    if (!hasOpenClock) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [hasOpenClock]);

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
      setTab("board");
      await loadJobs();
      await loadProfiles(payload.staff.id);
      setNotice({ kind: "ok", text: `Welcome back, ${payload.staff.name}.` });
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
      setTab("board");
      await loadProfiles();
      await loadJobs();
      await loadProfiles(payload.staff.id);
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
    setMyProfile(null);
    setJobs([]);
    setSelectedId(null);
    setTab("jobs");
    await loadProfiles();
    setNotice({
      kind: "info",
      text: "Signed out. Pick your profile when you’re ready for the next stop.",
    });
  }

  async function uploadAvatar(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/inspired-closets/field/profiles", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as ApiPayload;
      if (!data.ok) throw new Error(data.error ?? "Could not update photo.");
      if (installer) await loadProfiles(installer.id);
      await loadProfiles();
      setNotice({ kind: "ok", text: "Profile photo updated." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not update photo.",
      });
    } finally {
      setBusy(false);
    }
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
        text: action === "in" ? `Clocked in at ${stamp}.` : `Clocked out at ${stamp}.`,
      });
      await loadJobs();
      if (installer) await loadProfiles(installer.id);
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
      if (installer) await loadProfiles(installer.id);
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
      if (installer) await loadProfiles(installer.id);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not complete job.",
      });
    } finally {
      setBusy(false);
    }
  }

  const noticeEl = notice ? (
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
  ) : null;

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
            <p className={styles.subtitle}>Installer profiles · clock · photos · issues</p>
          </div>
        </header>
        {noticeEl}
        <div className={styles.loginHero}>
          <h2 className={styles.loginHeroTitle}>Who’s on the truck?</h2>
          <p className={styles.loginHeroText}>
            Tap your profile to start the day. You’ll see today’s installs, clock time, photos, and
            your past jobs — same account every time.
          </p>
        </div>
        <section className={`${styles.card} ${styles.loginCard}`}>
          <p className={styles.sectionTitle} style={{ marginTop: 0 }}>
            Installer roster
          </p>
          {profiles.length === 0 ? (
            <p className={styles.jobMeta}>No installer profiles yet — add yourself below.</p>
          ) : (
            <div className={styles.profileList}>
              {profiles.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={styles.profileCard}
                  disabled={busy}
                  onClick={() => void signIn(member.id)}
                >
                  <Avatar profile={member} />
                  <div className={styles.profileMain}>
                    <h3 className={styles.profileName}>{member.name}</h3>
                    <p className={styles.profileMeta}>
                      {member.title} · {member.tenureLabel}
                    </p>
                    <div className={styles.statRow}>
                      <span className={styles.statChip}>
                        {member.stats.installsCompleted} installs done
                      </span>
                      {member.stats.activeJobs > 0 ? (
                        <span className={styles.statChip}>
                          {member.stats.activeJobs} active
                        </span>
                      ) : null}
                      {member.onSiteNow ? (
                        <span className={`${styles.statChip} ${styles.statChipLive}`}>On site</span>
                      ) : null}
                    </div>
                    {member.recentInstalls.length > 0 ? (
                      <ul className={styles.historyPreview}>
                        {member.recentInstalls.slice(0, 2).map((job) => (
                          <li key={job.id}>
                            {job.clientName}
                            {job.completedDate || job.installDate
                              ? ` · ${formatDay(job.completedDate ?? job.installDate)}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.profileMeta}>No completed installs yet</p>
                    )}
                    <p className={styles.tapHint}>Tap to sign in →</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className={styles.newDriverBox}>
            <div className={styles.field}>
              <span className={styles.label}>New to the crew?</span>
              <input
                className={styles.input}
                value={newDriverName}
                onChange={(event) => setNewDriverName(event.target.value)}
                placeholder="Your full name"
              />
            </div>
            <button
              type="button"
              className={`${styles.btn} ${styles.full}`}
              style={{ marginTop: "0.75rem", width: "100%" }}
              disabled={busy || !newDriverName.trim()}
              onClick={() => void createDriver()}
            >
              Create my profile & sign in
            </button>
          </div>
        </section>
      </div>
    );
  }

  const profile = myProfile;

  return (
    <div className={styles.page}>
      {!online ? (
        <div className={styles.offlineBanner}>
          Offline mode · {queueCount} queued action{queueCount === 1 ? "" : "s"}
        </div>
      ) : queueCount > 0 ? (
        <div className={styles.offlineBanner}>Syncing {queueCount} queued action(s)…</div>
      ) : null}

      <div className={styles.profileHeader}>
        {profile ? <Avatar profile={profile} large /> : null}
        <div>
          <p className={styles.brand}>Inspired Closets OS · Field</p>
          <h1 className={styles.title}>{installer.name}</h1>
          <p className={styles.subtitle}>
            {profile
              ? `${profile.title} · ${profile.tenureLabel}`
              : "Clock · photos · issues · complete"}
          </p>
          {profile ? (
            <div className={styles.statRow}>
              <span className={styles.statChip}>
                {profile.stats.installsCompleted} completed
              </span>
              <span className={styles.statChip}>{profile.stats.activeJobs} active</span>
              {profile.onSiteNow ? (
                <span className={`${styles.statChip} ${styles.statChipLive}`}>Clocked in</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={styles.profileHeaderActions}>
          <button type="button" className={styles.pill} onClick={() => void signOut()}>
            Sign out
          </button>
          <label className={styles.avatarUpload}>
            Photo
            <input
              type="file"
              accept="image/*"
              capture="user"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAvatar(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {noticeEl}

      <div className={styles.tabRow} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "board"}
          className={`${styles.tabBtn} ${tab === "board" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("board")}
        >
          This week
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "jobs"}
          className={`${styles.tabBtn} ${tab === "jobs" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("jobs")}
        >
          My jobs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "profile"}
          className={`${styles.tabBtn} ${tab === "profile" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("profile")}
        >
          My profile
        </button>
      </div>

      {tab === "profile" && profile ? (
        <>
          <section className={styles.card}>
            <h2 className={styles.jobName}>About you</h2>
            <p className={styles.jobMeta} style={{ marginTop: "0.45rem" }}>
              {profile.title}
              {profile.phone ? ` · ${profile.phone}` : " · No phone on file"}
            </p>
            <p className={styles.jobMeta}>
              Tenure: {profile.tenureLabel}
              {profile.hiredAt ? ` (started ${formatDay(profile.hiredAt)})` : ""}
            </p>
            <div className={styles.statRow} style={{ marginTop: "0.75rem" }}>
              <span className={styles.statChip}>
                {profile.stats.installsCompleted} installs completed
              </span>
              <span className={styles.statChip}>{profile.stats.activeJobs} active jobs</span>
              <span className={styles.statChip}>
                {profile.stats.issuesReported} issues reported
              </span>
              {profile.stats.openIssues > 0 ? (
                <span className={`${styles.statChip} ${styles.badgeHot}`}>
                  {profile.stats.openIssues} open
                </span>
              ) : null}
            </div>
          </section>

          <p className={styles.sectionTitle}>Previous installs</p>
          {profile.recentInstalls.length === 0 ? (
            <p className={styles.empty}>No completed installs on your record yet.</p>
          ) : (
            profile.recentInstalls.map((job) => (
              <article key={job.id} className={styles.card}>
                <div className={styles.historyItem}>
                  <span className={styles.historyDate}>
                    {formatDay(job.completedDate ?? job.installDate)}
                  </span>
                  <h3 className={styles.jobName}>{job.clientName}</h3>
                  <p className={styles.jobMeta}>{job.address || "No address on file"}</p>
                  <div className={styles.badgeRow}>
                    <span className={styles.badge}>{stageLabel(job.stage)}</span>
                  </div>
                </div>
              </article>
            ))
          )}
        </>
      ) : null}

      {tab === "board" ? (
        <FieldWeekBoard
          days={boardDays}
          installers={boardCrew}
          unassigned={boardUnassigned}
          onOpenMine={(jobId) => {
            setSelectedId(jobId);
            setTab("jobs");
          }}
        />
      ) : null}

      {tab === "jobs" ? (
        <>
          <p className={styles.sectionTitle}>Assigned / available installs</p>
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
                    {formatDuration(selected.openClock.clock_in_at, null, nowTick)}
                    {selected.openClock.clock_in_lat
                      ? ` · GPS ${Number(selected.openClock.clock_in_lat).toFixed(4)}, ${Number(selected.openClock.clock_in_lng).toFixed(4)}`
                      : ""}
                  </p>
                ) : (
                  <p className={styles.jobMeta} style={{ marginTop: "0.55rem" }}>
                    Not clocked in — tap Clock in when you arrive so job time is recorded.
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
                    disabled={
                      busy ||
                      ["install_complete", "final_payment", "closed"].includes(selected.stage)
                    }
                    onClick={() => void completeJob()}
                  >
                    Mark install complete
                  </button>
                </div>
                <div style={{ marginTop: "0.85rem" }}>
                  <p className={styles.label}>Time log (saved to Supabase)</p>
                  {(selected.timeEntries?.length ?? 0) === 0 ? (
                    <p className={styles.jobMeta} style={{ marginTop: "0.35rem" }}>
                      No clock times yet for this job. Clock in / out here — Gavin and ops can use
                      these for how long installs take.
                    </p>
                  ) : (
                    selected.timeEntries?.map((entry) => (
                      <p key={entry.id} className={styles.jobMeta} style={{ marginTop: "0.35rem" }}>
                        In {formatStamp(entry.clock_in_at)}
                        {entry.clock_out_at
                          ? ` → Out ${formatStamp(entry.clock_out_at)} · ${formatDuration(entry.clock_in_at, entry.clock_out_at)}`
                          : ` → still on site · ${formatDuration(entry.clock_in_at, null, nowTick)}`}
                      </p>
                    ))
                  )}
                </div>
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
