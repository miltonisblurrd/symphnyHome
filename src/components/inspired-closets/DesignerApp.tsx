"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import InspiredClosetsLogo from "@/components/inspired-closets/InspiredClosetsLogo";
import InstallerHomeCalendar from "@/components/inspired-closets/InstallerHomeCalendar";
import InstallerMonthPage from "@/components/inspired-closets/InstallerMonthPage";
import access from "@/app/inspired-closets/access/access.module.css";
import styles from "./field.module.css";

const LOGO_SRC = "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png";

type DesignerTab = "today" | "schedule" | "leads" | "jobs";

const NAV: { id: DesignerTab; label: string }[] = [
  { id: "today", label: "Home" },
  { id: "schedule", label: "Schedule" },
  { id: "leads", label: "Leads" },
  { id: "jobs", label: "Jobs" },
];

const DESIGN_STAGES = new Set([
  "lead",
  "consultation",
  "quoted",
  "deposit_pending",
  "deposit_received",
  "job_check",
]);
const INSTALLED_STAGES = new Set(["install_complete", "final_payment", "closed"]);

type Designer = { id: string; name: string; avatar_url?: string | null; phone?: string | null };

type Contact = { client_phone?: string | null; client_address?: string | null };

type LeadRow = Contact & {
  id: string;
  client_name: string;
  stage: string;
  source: string | null;
  notes: string | null;
  updated_at: string;
  converted_job_id: string | null;
};

type JobRow = Contact & {
  id: string;
  client_name: string;
  title: string | null;
  stage: string;
  stage_label?: string;
  job_kind?: string | null;
  visit_window?: string | null;
  install_date: string | null;
  sold_date: string | null;
  install_grade?: number | null;
  skip_job_check?: boolean | null;
};

type AppointmentRow = Contact & {
  id: string;
  lead_id: string | null;
  job_id: string | null;
  client_name: string;
  subject: string | null;
  kind: string;
  scheduled_at: string;
  status: string;
  location_text: string | null;
};

type Photo = {
  id: string;
  kind_label: string;
  caption: string | null;
  created_at: string;
  public_url: string | null;
  installer_name: string | null;
};

type JobDetail = {
  id: string;
  title: string | null;
  stage: string;
  stage_label: string;
  job_kind?: string | null;
  install_date?: string | null;
  visit_window?: string | null;
  proposal_url?: string | null;
  notes: string | null;
  field_notes: string | null;
  install_grade: number | null;
  install_grade_note: string | null;
  skip_job_check: boolean | null;
  client: { name: string; phone?: string | null; address?: string | null } | null;
  installer: { name: string } | null;
};

type Notice = { kind: "info" | "ok" | "error"; text: string };

function pretty(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDay(value: string | null | undefined): string {
  if (!value) return "Date TBD";
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function localYmd(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function phoneHref(phone: string, scheme: "tel" | "sms"): string {
  return `${scheme}:${phone.replace(/[^\d+]/g, "")}`;
}

function directionsHref(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

function jobKindClass(kind: string | null | undefined) {
  if (kind === "service") return styles.chipService;
  if (kind === "go_back") return styles.chipGoBack;
  return styles.chipNew;
}

function jobKindLabel(kind: string | null | undefined) {
  if (kind === "service") return "Service";
  if (kind === "go_back") return "Go-back";
  return "New install";
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function Avatar({ designer, xl }: { designer: Designer; xl?: boolean }) {
  const sizeClass = xl ? styles.avatarXl : "";
  if (designer.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={designer.avatar_url} alt="" className={`${styles.avatar} ${sizeClass}`} />;
  }
  return (
    <div className={`${styles.avatar} ${styles.avatarFallback} ${sizeClass}`} aria-hidden>
      {initialsOf(designer.name)}
    </div>
  );
}

function TabIcon({ id }: { id: DesignerTab }) {
  if (id === "today") {
    return (
      <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1v-9.4Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "schedule") {
    return (
      <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "leads") {
    return (
      <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M5 20c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="8" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 8V6.2A2.2 2.2 0 0 1 10.2 4h3.6A2.2 2.2 0 0 1 16 6.2V8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ContactActions({ phone, address }: { phone?: string | null; address?: string | null }) {
  if (!phone && !address) return null;
  return (
    <div className={styles.packetActions}>
      {phone ? (
        <a className={styles.packetActionBtn} href={phoneHref(phone, "tel")}>
          Call
        </a>
      ) : null}
      {phone ? (
        <a className={styles.packetActionBtn} href={phoneHref(phone, "sms")}>
          Text
        </a>
      ) : null}
      {address ? (
        <a className={styles.packetActionBtn} href={directionsHref(address)} target="_blank" rel="noreferrer">
          Directions
        </a>
      ) : null}
    </div>
  );
}

export default function DesignerApp() {
  const [designer, setDesigner] = useState<Designer | null>(null);
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<DesignerTab>("today");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [grade, setGrade] = useState(0);
  const [gradeNote, setGradeNote] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadHome = useCallback(async () => {
    const response = await fetch("/api/inspired-closets/designers/home");
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      designer?: Designer;
      leads?: LeadRow[];
      jobs?: JobRow[];
      appointments?: AppointmentRow[];
    };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not load your work.");
    if (payload.designer) setDesigner(payload.designer);
    setLeads(payload.leads ?? []);
    setJobs(payload.jobs ?? []);
    setAppointments(payload.appointments ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/inspired-closets/designers/auth");
      const payload = (await response.json()) as { designer?: Designer | null };
      setDesigner(payload.designer ?? null);
      setReady(true);
      if (payload.designer) {
        try {
          await loadHome();
        } catch (error) {
          setNotice({
            kind: "error",
            text: error instanceof Error ? error.message : "Could not load your work.",
          });
        }
      }
    })();
  }, [loadHome]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const upcoming = useMemo(() => {
    const now = Date.now() - 60 * 60 * 1000;
    return appointments.filter((row) => new Date(row.scheduled_at).getTime() >= now);
  }, [appointments]);

  const calendarItems = useMemo(
    () =>
      appointments
        .map((row) => ({
          id: `appt:${row.id}`,
          install_date: localYmd(row.scheduled_at),
          visit_window: [formatTime(row.scheduled_at), pretty(row.kind)].filter(Boolean).join(" · "),
          job_kind: "new_install",
          client: { name: row.subject || row.client_name },
        }))
        .filter((row) => row.install_date),
    [appointments],
  );

  const scheduleItems = useMemo(
    () => [
      ...calendarItems,
      ...jobs
        .filter((row) => row.install_date)
        .map((row) => ({
          id: `job:${row.id}`,
          install_date: row.install_date,
          visit_window: ["Install", row.visit_window].filter(Boolean).join(" · "),
          job_kind: row.job_kind ?? "new_install",
          client: { name: row.client_name },
        })),
    ],
    [calendarItems, jobs],
  );

  const needsDesign = useMemo(() => jobs.filter((row) => DESIGN_STAGES.has(row.stage)), [jobs]);
  const toGrade = useMemo(
    () => jobs.filter((row) => INSTALLED_STAGES.has(row.stage) && !row.install_grade),
    [jobs],
  );
  const inProduction = useMemo(
    () =>
      jobs.filter(
        (row) => !DESIGN_STAGES.has(row.stage) && !INSTALLED_STAGES.has(row.stage) && row.stage !== "cancelled",
      ),
    [jobs],
  );
  const graded = useMemo(() => jobs.filter((row) => row.install_grade), [jobs]);
  const openLeads = useMemo(() => leads.filter((row) => !row.converted_job_id), [leads]);
  const soldLeads = useMemo(() => leads.filter((row) => row.converted_job_id), [leads]);
  const nextAppointment = upcoming[0] ?? null;
  const heroJob = needsDesign[0] ?? toGrade[0] ?? null;

  const actionItems = useMemo(
    () => [
      ...needsDesign.map((row) => ({
        key: `design-${row.id}`,
        jobId: row.id,
        tag: "Design",
        title: row.client_name,
        body: `${row.stage_label ?? pretty(row.stage)} — tell Frank if it needs a job check.`,
      })),
      ...toGrade.map((row) => ({
        key: `grade-${row.id}`,
        jobId: row.id,
        tag: "Grade",
        title: row.client_name,
        body: `Installed ${formatDay(row.install_date)}. Look at the photos and grade it 1–5.`,
      })),
    ],
    [needsDesign, toGrade],
  );

  function goToTab(next: DesignerTab) {
    setTab(next);
    setJob(null);
    setMenuOpen(false);
    setNotice(null);
  }

  function openCalendarItem(itemId: string) {
    const [kind, id] = itemId.split(":");
    if (kind === "job") {
      void openJob(id);
      return;
    }
    const appointment = appointments.find((row) => row.id === id);
    if (appointment?.job_id) {
      void openJob(appointment.job_id);
      return;
    }
    goToTab("leads");
  }

  async function signIn() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/designers/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; designer?: Designer };
      if (!response.ok || !payload.ok || !payload.designer) {
        throw new Error(payload.error ?? "Could not sign in.");
      }
      setDesigner(payload.designer);
      setPassword("");
      await loadHome();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not sign in." });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/inspired-closets/designers/auth", { method: "DELETE" });
    setDesigner(null);
    setJob(null);
    setLeads([]);
    setJobs([]);
    setAppointments([]);
    setMenuOpen(false);
  }

  async function openJob(id: string) {
    setBusy(true);
    setNotice(null);
    setTab("jobs");
    try {
      const response = await fetch(`/api/inspired-closets/designers/jobs?id=${id}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        job?: JobDetail;
        photos?: Photo[];
      };
      if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.error ?? "Could not open the job.");
      setJob(payload.job);
      setPhotos(payload.photos ?? []);
      setGrade(payload.job.install_grade ?? 0);
      setGradeNote(payload.job.install_grade_note ?? "");
      window.scrollTo({ top: 0 });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not open the job." });
    } finally {
      setBusy(false);
    }
  }

  async function saveGrade() {
    if (!job || grade < 1) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/designers/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, action: "grade", grade, note: gradeNote }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save the grade.");
      setNotice({ kind: "ok", text: "Grade saved on the job." });
      setJob({ ...job, install_grade: grade, install_grade_note: gradeNote });
      await loadHome();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save the grade." });
    } finally {
      setBusy(false);
    }
  }

  async function finishDesign(choice: "job_check" | "skip") {
    if (!job) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/designers/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, action: "design_done", choice }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        job?: { stage?: string; skip_job_check?: boolean };
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not notify Frank.");
      const stage = payload.job?.stage ?? job.stage;
      setJob({
        ...job,
        stage,
        stage_label: stage === job.stage ? job.stage_label : pretty(stage),
        skip_job_check: payload.job?.skip_job_check ?? choice === "skip",
      });
      setNotice({
        kind: "ok",
        text:
          choice === "skip"
            ? "Frank was notified. Job check is skipped and the job can be ordered."
            : "Frank was notified. This job stays on the job-check list.",
      });
      await loadHome();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not notify Frank." });
    } finally {
      setBusy(false);
    }
  }

  const noticeEl = notice ? (
    <p
      className={`${styles.notice} ${
        notice.kind === "error" ? styles.noticeError : notice.kind === "ok" ? styles.noticeOk : ""
      }`}
    >
      {notice.text}
    </p>
  ) : null;

  if (!ready) {
    return <main className={access.page} />;
  }

  if (!designer) {
    return (
      <main className={access.page}>
        <div className={access.card}>
          <div className={access.header}>
            <div className={access.brandBlock}>
              <Image
                src={LOGO_SRC}
                alt="Inspired Closets"
                width={88}
                height={81}
                className={access.logo}
                priority
                unoptimized
              />
              <p className={access.eyebrow}>Inspired Closets · private preview</p>
            </div>
            <h1 className={access.title}>Designer Login</h1>
            <p className={access.lead}>Sign in with your name and password</p>
          </div>
          <form
            className={access.form}
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <input
              className={access.input}
              autoComplete="username"
              aria-label="Name"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Name"
              required
            />
            <input
              className={access.input}
              type="password"
              autoComplete="current-password"
              aria-label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
            />
            {notice?.kind === "error" ? <p className={access.error}>{notice.text}</p> : null}
            <button
              className={access.button}
              type="submit"
              disabled={busy || !username.trim() || !password.trim()}
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  const jobTile = (row: JobRow, past = false) => (
    <button
      key={row.id}
      type="button"
      className={`${styles.dashCard} ${styles.jobTile} ${past ? styles.jobTilePast : ""}`}
      onClick={() => void openJob(row.id)}
    >
      <div className={styles.jobsHeroTop}>
        <p className={styles.colLabel}>{row.stage_label ?? pretty(row.stage)}</p>
        {row.install_grade ? (
          <span className={`${styles.chip} ${styles.chipNew}`}>{row.install_grade}/5</span>
        ) : (
          <span className={`${styles.chip} ${jobKindClass(row.job_kind)}`}>{jobKindLabel(row.job_kind)}</span>
        )}
      </div>
      <h3 className={styles.jobTileName}>{row.client_name}</h3>
      <p className={styles.jobMeta}>
        {[row.title, row.install_date ? `Install ${formatDay(row.install_date)}` : null]
          .filter(Boolean)
          .join(" · ") || "No install date yet"}
      </p>
      {row.skip_job_check ? <p className={styles.jobMeta}>Job check skipped</p> : null}
    </button>
  );

  const bodyClass =
    tab === "today" ? styles.bodyHome : tab === "schedule" ? styles.bodyMonth : styles.bodyJobs;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.topbarLogo}
              aria-label="Home"
              onClick={() => goToTab("today")}
            >
              <InspiredClosetsLogo compact />
            </button>
            <nav className={styles.topbarNav} aria-label="Designers">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.topbarLink} ${tab === item.id ? styles.topbarLinkActive : ""}`}
                  onClick={() => goToTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className={styles.topbarActions}>
            <div className={styles.menuAnchor} ref={menuRef}>
              <button
                type="button"
                className={styles.avatarBtn}
                aria-label="Account"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Avatar designer={designer} />
              </button>
              {menuOpen ? (
                <div className={`${styles.dropdown} ${styles.dropdownNarrow}`} role="menu">
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setMenuOpen(false);
                      void loadHome();
                    }}
                  >
                    Refresh
                  </button>
                  <button type="button" className={styles.dropdownItem} onClick={() => void signOut()}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <div className={`${styles.body} ${bodyClass}`}>
          {!job ? noticeEl : null}

          {tab === "today" ? (
            <div className={styles.homeGrid}>
              <div className={styles.homeLeft}>
                <section className={`${styles.dashCard} ${styles.profileCol}`}>
                  <div className={styles.profileHero}>
                    <Avatar designer={designer} xl />
                    <div className={styles.profileCopy}>
                      <h2 className={styles.profileNameLg}>{designer.name}</h2>
                      <p className={styles.profileRole}>Designer</p>
                      <span className={`${styles.statusPill} ${nextAppointment ? styles.statusOn : ""}`}>
                        {nextAppointment
                          ? `Next · ${formatDay(nextAppointment.scheduled_at)} ${formatTime(nextAppointment.scheduled_at)}`
                          : "Nothing booked"}
                      </span>
                    </div>
                  </div>
                  <dl className={`${styles.statList} ${styles.profileStats}`}>
                    <div>
                      <dt>Open leads</dt>
                      <dd>{openLeads.length}</dd>
                    </div>
                    <div>
                      <dt>In design</dt>
                      <dd>{needsDesign.length}</dd>
                    </div>
                    <div>
                      <dt>To grade</dt>
                      <dd>{toGrade.length}</dd>
                    </div>
                  </dl>
                  <div className={styles.profileActions}>
                    <button type="button" className={styles.btnOk} onClick={() => goToTab("jobs")}>
                      My jobs
                    </button>
                    <button type="button" className={styles.btnGhost} onClick={() => goToTab("leads")}>
                      My leads
                    </button>
                  </div>
                </section>

                <div className={styles.homeCal}>
                  <InstallerHomeCalendar jobs={scheduleItems} timeOff={[]} onOpenJob={openCalendarItem} />
                </div>
              </div>

              <div className={styles.feedStack}>
                <section className={`${styles.dashCard} ${styles.feedCol}`} aria-label="Needs you">
                  <p className={styles.colLabel}>Needs you</p>
                  {actionItems.length === 0 ? (
                    <p className={styles.empty}>
                      You&apos;re caught up. Jobs waiting on your design and installs to grade show here.
                    </p>
                  ) : (
                    <div className={styles.feedList}>
                      {actionItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={styles.feedCard}
                          style={{ textAlign: "left", cursor: "pointer", font: "inherit", width: "100%" }}
                          onClick={() => void openJob(item.jobId)}
                        >
                          <div className={styles.feedCardTop}>
                            <span
                              className={`${styles.feedTag} ${
                                item.tag === "Design" ? styles.feedTagCompany : styles.feedTagPersonal
                              }`}
                            >
                              {item.tag}
                            </span>
                          </div>
                          <h3 className={styles.jobName}>{item.title}</h3>
                          <p className={styles.jobMeta}>{item.body}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className={styles.quickStack}>
                <aside className={`${styles.dashCard} ${styles.quickCol}`}>
                  <p className={styles.colLabel}>Quick context</p>
                  <dl className={styles.statList}>
                    <div>
                      <dt>Next appointment</dt>
                      <dd>{nextAppointment ? nextAppointment.subject || nextAppointment.client_name : "None booked"}</dd>
                      <p className={styles.statHint}>
                        {nextAppointment
                          ? [
                              formatDay(nextAppointment.scheduled_at),
                              formatTime(nextAppointment.scheduled_at),
                              pretty(nextAppointment.kind),
                            ].join(" · ")
                          : "When the office books you, it shows here."}
                      </p>
                      {nextAppointment ? (
                        <ContactActions
                          phone={nextAppointment.client_phone}
                          address={nextAppointment.location_text || nextAppointment.client_address}
                        />
                      ) : null}
                    </div>
                    <div>
                      <dt>Graded installs</dt>
                      <dd>{graded.length}</dd>
                    </div>
                  </dl>
                  {heroJob ? (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.packetBtn}`}
                      style={{ marginBottom: "1rem" }}
                      onClick={() => void openJob(heroJob.id)}
                    >
                      Open {heroJob.client_name}
                    </button>
                  ) : null}
                  <p className={styles.colLabel}>Recent jobs</p>
                  {jobs.length === 0 ? (
                    <p className={styles.empty}>No jobs assigned to you yet.</p>
                  ) : (
                    <ul className={styles.recentList}>
                      {jobs.slice(0, 5).map((row) => (
                        <li key={row.id}>
                          <button type="button" className={styles.recentItem} onClick={() => void openJob(row.id)}>
                            <strong>{row.client_name}</strong>
                            <span>{row.stage_label ?? pretty(row.stage)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
            </div>
          ) : null}

          {tab === "schedule" ? (
            <InstallerMonthPage jobs={scheduleItems} timeOff={[]} onOpenJob={openCalendarItem} />
          ) : null}

          {tab === "leads" ? (
            <div className={styles.jobsBoard}>
              {openLeads[0] ? (
                <section className={`${styles.dashCard} ${styles.jobsHero}`}>
                  <div className={styles.jobsHeroTop}>
                    <p className={styles.colLabel}>Newest lead</p>
                    <span className={`${styles.chip} ${styles.chipNew}`}>{pretty(openLeads[0].stage)}</span>
                  </div>
                  <h2 className={styles.jobsHeroName}>{openLeads[0].client_name}</h2>
                  <p className={styles.jobsHeroMeta}>
                    {[openLeads[0].source ? pretty(openLeads[0].source) : null, `Updated ${formatDay(openLeads[0].updated_at)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {openLeads[0].client_address ? (
                    <p className={styles.jobsHeroMeta}>{openLeads[0].client_address}</p>
                  ) : null}
                  {openLeads[0].notes ? <p className={styles.jobMeta}>{openLeads[0].notes}</p> : null}
                  <ContactActions phone={openLeads[0].client_phone} address={openLeads[0].client_address} />
                </section>
              ) : (
                <section className={`${styles.dashCard} ${styles.jobsHero}`}>
                  <p className={styles.colLabel}>Leads</p>
                  <h2 className={styles.jobsHeroName}>No open leads</h2>
                  <p className={styles.jobsHeroMeta}>When the office assigns you a lead, it lands here.</p>
                </section>
              )}

              {openLeads.length > 1 ? (
                <section>
                  <p className={styles.colLabel}>Open leads</p>
                  <div className={styles.jobsPair}>
                    {openLeads.slice(1).map((row) => (
                      <article key={row.id} className={`${styles.dashCard} ${styles.jobTile}`}>
                        <div className={styles.jobsHeroTop}>
                          <p className={styles.colLabel}>{pretty(row.stage)}</p>
                          {row.source ? (
                            <span className={`${styles.chip} ${styles.chipService}`}>{pretty(row.source)}</span>
                          ) : null}
                        </div>
                        <h3 className={styles.jobTileName}>{row.client_name}</h3>
                        <p className={styles.jobMeta}>Updated {formatDay(row.updated_at)}</p>
                        {row.notes ? <p className={styles.jobMeta}>{row.notes}</p> : null}
                        <ContactActions phone={row.client_phone} address={row.client_address} />
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <p className={styles.colLabel}>Became jobs</p>
                {soldLeads.length === 0 ? (
                  <p className={styles.empty}>Sold leads show here and open as jobs.</p>
                ) : (
                  <div className={styles.jobsQuad}>
                    {soldLeads.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className={`${styles.dashCard} ${styles.jobTile} ${styles.jobTilePast}`}
                        onClick={() => row.converted_job_id && void openJob(row.converted_job_id)}
                      >
                        <p className={styles.colLabel}>Sold</p>
                        <h3 className={styles.jobTileName}>{row.client_name}</h3>
                        <p className={styles.jobMeta}>Open job</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "jobs" && !job ? (
            <div className={styles.jobsBoard}>
              {heroJob ? (
                <button
                  type="button"
                  className={`${styles.dashCard} ${styles.jobsHero}`}
                  onClick={() => void openJob(heroJob.id)}
                >
                  <div className={styles.jobsHeroTop}>
                    <p className={styles.colLabel}>{needsDesign[0] ? "Needs your design" : "Ready to grade"}</p>
                    <span className={`${styles.chip} ${jobKindClass(heroJob.job_kind)}`}>
                      {jobKindLabel(heroJob.job_kind)}
                    </span>
                  </div>
                  <h2 className={styles.jobsHeroName}>{heroJob.client_name}</h2>
                  <p className={styles.jobsHeroMeta}>
                    {[heroJob.stage_label ?? pretty(heroJob.stage), heroJob.title].filter(Boolean).join(" · ")}
                  </p>
                  {heroJob.client_address ? <p className={styles.jobsHeroMeta}>{heroJob.client_address}</p> : null}
                  <span className={styles.jobsHeroCta}>Open job packet</span>
                </button>
              ) : (
                <section className={`${styles.dashCard} ${styles.jobsHero}`}>
                  <p className={styles.colLabel}>Jobs</p>
                  <h2 className={styles.jobsHeroName}>Nothing waiting on you</h2>
                  <p className={styles.jobsHeroMeta}>Jobs that need a design or a grade will land here.</p>
                </section>
              )}

              {needsDesign.length > 1 ? (
                <section>
                  <p className={styles.colLabel}>In design</p>
                  <div className={styles.jobsPair}>{needsDesign.slice(1).map((row) => jobTile(row))}</div>
                </section>
              ) : null}

              {toGrade.length > (needsDesign.length ? 0 : 1) ? (
                <section>
                  <p className={styles.colLabel}>Installed — grade these</p>
                  <div className={styles.jobsPair}>
                    {(needsDesign.length ? toGrade : toGrade.slice(1)).map((row) => jobTile(row))}
                  </div>
                </section>
              ) : null}

              <section>
                <p className={styles.colLabel}>In production</p>
                {inProduction.length === 0 ? (
                  <p className={styles.empty}>Ordered and scheduled jobs show here.</p>
                ) : (
                  <div className={styles.jobsQuad}>{inProduction.map((row) => jobTile(row, true))}</div>
                )}
              </section>

              {graded.length > 0 ? (
                <section>
                  <p className={styles.colLabel}>Graded</p>
                  <div className={styles.jobsQuad}>{graded.map((row) => jobTile(row, true))}</div>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "jobs" && job ? (
            <div className={styles.jobsPacketView}>
              <div className={styles.packetToolbar}>
                <button type="button" className={styles.btnGhost} onClick={() => setJob(null)}>
                  ← All jobs
                </button>
                <div className={styles.packetToolbarActions}>
                  <span className={`${styles.chip} ${jobKindClass(job.job_kind)}`}>{jobKindLabel(job.job_kind)}</span>
                </div>
              </div>

              <nav className={styles.packetJump} aria-label="Packet sections">
                {[
                  { id: "packet-brief", label: "Brief" },
                  { id: "packet-design", label: "Design done" },
                  { id: "packet-photos", label: "Photos" },
                  { id: "packet-grade", label: "Grade" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.packetJumpBtn}
                    onClick={() =>
                      document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              {noticeEl}

              <div className={styles.packetLayout}>
                <div className={styles.packetBriefCol}>
                  <section className={styles.dashCard} id="packet-brief">
                    <p className={styles.colLabel}>Job packet</p>
                    <h2 className={styles.packetTitle}>{job.client?.name ?? "Job"}</h2>
                    <p className={styles.packetLead}>
                      {[job.stage_label, job.install_date ? `Install ${formatDay(job.install_date)}` : null, job.visit_window]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <ContactActions phone={job.client?.phone} address={job.client?.address} />
                    {job.client?.address ? <p className={styles.packetAddress}>{job.client.address}</p> : null}
                    {job.client?.phone ? (
                      <p className={styles.packetAddress}>
                        <a href={phoneHref(job.client.phone, "tel")}>{job.client.phone}</a>
                      </p>
                    ) : null}
                    {job.proposal_url ? (
                      <div className={styles.packetActions}>
                        <a className={styles.packetActionBtn} href={job.proposal_url} target="_blank" rel="noreferrer">
                          Design / proposal
                        </a>
                      </div>
                    ) : null}
                    {job.title ? (
                      <div className={styles.packetBlock}>
                        <h3 className={styles.packetSection}>Project</h3>
                        <p className={styles.packetBody}>{job.title}</p>
                      </div>
                    ) : null}
                    <div className={styles.packetBlock}>
                      <h3 className={styles.packetSection}>Office notes</h3>
                      <p className={styles.packetBody} style={{ whiteSpace: "pre-wrap" }}>
                        {job.notes || "No office notes."}
                      </p>
                    </div>
                    <div className={styles.packetBlock}>
                      <h3 className={styles.packetSection}>Installer</h3>
                      <p className={styles.packetBody}>{job.installer?.name ?? "Not assigned yet"}</p>
                    </div>
                    {job.field_notes ? (
                      <div className={styles.packetBlock}>
                        <h3 className={styles.packetSection}>Installer notes</h3>
                        <p className={styles.packetBody} style={{ whiteSpace: "pre-wrap" }}>
                          {job.field_notes}
                        </p>
                      </div>
                    ) : null}
                  </section>

                  <section className={`${styles.dashCard} ${styles.packetOpsCard}`} id="packet-design">
                    <p className={styles.colLabel}>Hand off to Frank</p>
                    <h3 className={styles.packetSection}>Design is done</h3>
                    {DESIGN_STAGES.has(job.stage) ? (
                      <>
                        <p className={styles.jobMeta}>
                          Tell Frank what happens next. Nothing goes to the customer.
                        </p>
                        <div className={styles.profileActions}>
                          <button
                            type="button"
                            className={styles.btnOk}
                            disabled={busy}
                            onClick={() => void finishDesign("job_check")}
                          >
                            Needs a job check
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            disabled={busy}
                            onClick={() => void finishDesign("skip")}
                          >
                            Simple closet, skip job check
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.packetEmpty}>
                        {job.skip_job_check
                          ? "Simple closet — job check skipped. Frank has it."
                          : `This job is at ${job.stage_label}. Frank has it.`}
                      </p>
                    )}
                  </section>
                </div>

                <div className={styles.packetDocCol}>
                  <section className={`${styles.dashCard} ${styles.packetDocCard}`} id="packet-photos">
                    <div className={styles.packetDocHead}>
                      <div>
                        <p className={styles.colLabel}>From the install crew</p>
                        <h3 className={styles.packetSection}>Photos</h3>
                        <p className={styles.jobMeta}>Everything the installers posted on this job.</p>
                      </div>
                      <span className={styles.packetCount}>{photos.length}</span>
                    </div>
                    {photos.length > 0 ? (
                      <div className={styles.mediaGrid}>
                        {photos.map((photo) =>
                          photo.public_url ? (
                            <figure key={photo.id} className={styles.mediaFigure}>
                              <a href={photo.public_url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photo.public_url}
                                  alt={photo.caption || photo.kind_label}
                                  className={styles.mediaThumb}
                                />
                              </a>
                              <figcaption className={styles.mediaCaption}>
                                <span>
                                  {photo.kind_label}
                                  {photo.installer_name ? ` · ${photo.installer_name}` : ""}
                                </span>
                                {photo.caption ? <span>{photo.caption}</span> : null}
                              </figcaption>
                            </figure>
                          ) : null,
                        )}
                      </div>
                    ) : (
                      <p className={styles.packetEmpty}>No installer photos on this job yet.</p>
                    )}
                  </section>

                  <section className={styles.dashCard} id="packet-grade">
                    <p className={styles.colLabel}>Quality</p>
                    <h3 className={styles.packetSection}>Grade the install</h3>
                    <p className={styles.jobMeta}>1 is poor, 5 is perfect. Only the office sees this.</p>
                    <div className={styles.kindChips} role="group" aria-label="Install grade">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`${styles.kindChip} ${grade === value ? styles.kindChipActive : ""}`}
                          onClick={() => setGrade(value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                    <label className={styles.field}>
                      <span className={styles.label}>Note (optional)</span>
                      <textarea
                        className={`${styles.textarea} ${styles.packetNotesArea}`}
                        value={gradeNote}
                        onChange={(event) => setGradeNote(event.target.value)}
                        placeholder="What stood out — good or bad?"
                      />
                    </label>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.packetBtn}`}
                      disabled={busy || grade < 1}
                      onClick={() => void saveGrade()}
                    >
                      {job.install_grade ? "Update grade" : "Save grade"}
                    </button>
                  </section>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <nav className={styles.tabBar} aria-label="Designers">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.tabBarBtn} ${tab === item.id ? styles.tabBarBtnOn : ""}`}
            onClick={() => goToTab(item.id)}
          >
            <TabIcon id={item.id} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
