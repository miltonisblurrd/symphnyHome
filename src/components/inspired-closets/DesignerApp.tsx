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
const GRADE_STAGES = new Set(["install_in_progress", "install_complete", "final_payment", "closed"]);

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

const PHOTO_KINDS = [
  { id: "before", label: "Before" },
  { id: "during", label: "During" },
  { id: "after", label: "After" },
  { id: "issue", label: "Issue" },
  { id: "staging", label: "Staging" },
  { id: "other", label: "Paperwork" },
] as const;

type Photo = {
  id: string;
  kind_label: string;
  caption: string | null;
  created_at: string;
  public_url: string | null;
  mime_type?: string | null;
  installer_name: string | null;
};

function isPhotoImage(photo: Photo): boolean {
  if (photo.mime_type) return photo.mime_type.startsWith("image/");
  return !/\.pdf(\?|$)/i.test(photo.public_url ?? "");
}

type JobDetail = {
  id: string;
  title: string | null;
  stage: string;
  stage_label: string;
  job_kind?: string | null;
  install_date?: string | null;
  visit_window?: string | null;
  proposal_url?: string | null;
  proposal_filename?: string | null;
  designer_notes?: string | null;
  design_ready_at?: string | null;
  design_ready_choice?: "job_check" | "skip" | string | null;
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

function ContactActions({
  phone,
  address,
  three,
}: {
  phone?: string | null;
  address?: string | null;
  three?: boolean;
}) {
  if (!phone && !address) return null;
  return (
    <div className={`${styles.packetActions} ${three ? styles.packetActionsThree : ""}`}>
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
  const [photoKind, setPhotoKind] = useState<(typeof PHOTO_KINDS)[number]["id"]>("other");
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [designerNotes, setDesignerNotes] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leadLimit, setLeadLimit] = useState(8);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openJobIdRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const proposalInputRef = useRef<HTMLInputElement | null>(null);

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

  const refreshOpenJob = useCallback(async (id: string) => {
    const response = await fetch(`/api/inspired-closets/designers/jobs?id=${id}`);
    const payload = (await response.json()) as { ok?: boolean; job?: JobDetail; photos?: Photo[] };
    if (!response.ok || !payload.ok || !payload.job || openJobIdRef.current !== id) return;
    setJob(payload.job);
    setPhotos(payload.photos ?? []);
  }, []);

  useEffect(() => {
    if (!designer) return;
    let timer = 0;
    const pull = () => {
      if (document.visibilityState === "hidden") return;
      void loadHome().catch(() => undefined);
      const id = openJobIdRef.current;
      if (id) void refreshOpenJob(id).catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    timer = window.setInterval(pull, 20000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", pull);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", pull);
    };
  }, [designer, loadHome, refreshOpenJob]);

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
    openJobIdRef.current = null;
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
    openJobIdRef.current = null;
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
      openJobIdRef.current = payload.job.id;
      setJob(payload.job);
      setPhotos(payload.photos ?? []);
      setGrade(payload.job.install_grade ?? 0);
      setGradeNote(payload.job.install_grade_note ?? "");
      setDesignerNotes(payload.job.designer_notes ?? "");
      window.scrollTo({ top: 0 });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not open the job." });
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(files: FileList | File[]) {
    if (!job) return;
    const list = Array.from(files).filter(
      (file) => file.type.startsWith("image/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    if (list.length === 0) {
      setNotice({ kind: "error", text: "Choose a photo or a PDF." });
      return;
    }
    if (list.some((file) => file.size > 12 * 1024 * 1024)) {
      setNotice({ kind: "error", text: "Keep each file under 12 MB." });
      return;
    }
    setPhotoBusy(true);
    setNotice(null);
    try {
      const added: Photo[] = [];
      for (const file of list) {
        const form = new FormData();
        form.set("id", job.id);
        form.set("kind", photoKind);
        if (photoCaption.trim()) form.set("caption", photoCaption.trim());
        form.set("file", file);
        const response = await fetch("/api/inspired-closets/designers/jobs", { method: "POST", body: form });
        const payload = (await response.json()) as { ok?: boolean; error?: string; photo?: Photo };
        if (!response.ok || !payload.ok || !payload.photo) {
          throw new Error(payload.error ?? "Could not save the file.");
        }
        added.push(payload.photo);
      }
      setPhotos((current) => [...added, ...current]);
      setPhotoCaption("");
      await loadHome();
      setNotice({
        kind: "ok",
        text:
          list.length === 1
            ? "Saved on the job. It shows on the project."
            : `${list.length} files saved on the job. They show on the project.`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save the file." });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function uploadProposal(file: File) {
    if (!job) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf && !file.type.startsWith("image/")) {
      setNotice({ kind: "error", text: "The proposal needs to be a PDF or a photo." });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice({ kind: "error", text: "Keep the proposal under 20 MB." });
      return;
    }
    setProposalBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("id", job.id);
      form.set("action", "proposal");
      form.set("file", file);
      const response = await fetch("/api/inspired-closets/designers/jobs", { method: "POST", body: form });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        proposal_url?: string;
        proposal_filename?: string;
      };
      if (!response.ok || !payload.ok || !payload.proposal_url) {
        throw new Error(payload.error ?? "Could not save the proposal.");
      }
      setJob({
        ...job,
        proposal_url: payload.proposal_url,
        proposal_filename: payload.proposal_filename ?? file.name,
      });
      await loadHome();
      setNotice({ kind: "ok", text: "Proposal saved on the job. Valu and the project can open it." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save the proposal." });
    } finally {
      setProposalBusy(false);
    }
  }

  async function saveDesignerNotes() {
    if (!job) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/designers/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, action: "notes", notes: designerNotes }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save the notes.");
      setJob({ ...job, designer_notes: designerNotes });
      await loadHome();
      setNotice({ kind: "ok", text: "Notes saved on the job." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save the notes." });
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
      await refreshOpenJob(job.id);
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
        design_ready_choice: choice,
        design_ready_at: new Date().toISOString(),
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
                <section className={`${styles.dashCard} ${styles.feedCol}`} aria-label="Leads">
                  <p className={styles.colLabel}>Leads</p>
                  {openLeads.length === 0 ? (
                    <p className={styles.empty}>No open leads assigned to you.</p>
                  ) : (
                    <div className={styles.feedList}>
                      {openLeads.slice(0, leadLimit).map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className={styles.feedCard}
                          style={{ textAlign: "left", cursor: "pointer", font: "inherit", width: "100%" }}
                          onClick={() => goToTab("leads")}
                        >
                          <div className={styles.feedCardTop}>
                            <span className={`${styles.feedTag} ${styles.feedTagCompany}`}>{pretty(row.stage)}</span>
                            <time className={styles.historyDate}>{formatDay(row.updated_at)}</time>
                          </div>
                          <h3 className={styles.jobName}>{row.client_name}</h3>
                          <p className={styles.jobMeta}>
                            {[row.source ? pretty(row.source) : null, row.notes].filter(Boolean).join(" · ") ||
                              "Open lead"}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {openLeads.length > leadLimit ? (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      style={{ marginTop: "0.85rem", width: "100%" }}
                      onClick={() => setLeadLimit((count) => count + 8)}
                    >
                      Load more
                    </button>
                  ) : null}
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
                <section className={styles.dashCard} aria-label="Needs you">
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
                  <ContactActions three phone={openLeads[0].client_phone} address={openLeads[0].client_address} />
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
                            <span className={`${styles.chip} ${styles.chipSource}`}>{pretty(row.source)}</span>
                          ) : null}
                        </div>
                        <h3 className={styles.jobTileName}>{row.client_name}</h3>
                        <p className={styles.jobMeta}>Updated {formatDay(row.updated_at)}</p>
                        {row.notes ? <p className={styles.jobMeta}>{row.notes}</p> : null}
                        <ContactActions three phone={row.client_phone} address={row.client_address} />
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
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    openJobIdRef.current = null;
                    setJob(null);
                  }}
                >
                  ← All jobs
                </button>
                <div className={styles.packetToolbarActions}>
                  <span className={`${styles.chip} ${jobKindClass(job.job_kind)}`}>{jobKindLabel(job.job_kind)}</span>
                </div>
              </div>

              <nav className={styles.packetJump} aria-label="Packet sections">
                {[
                  { id: "packet-brief", label: "Brief" },
                  { id: "packet-proposal", label: "Proposal" },
                  { id: "packet-notes", label: "Notes" },
                  { id: "packet-photos", label: "Photos" },
                  { id: "packet-design", label: "Design done" },
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

                  <section className={styles.dashCard} id="packet-proposal">
                    <p className={styles.colLabel}>For the installer and the project</p>
                    <h3 className={styles.packetSection}>Proposal</h3>
                    <p className={styles.jobMeta}>
                      Upload the design. It stays on this job, so Valu can open it with the install and the office sees it on the project.
                    </p>
                    {job.proposal_url ? (
                      <div className={styles.packetActions}>
                        <a className={styles.packetActionBtn} href={job.proposal_url} target="_blank" rel="noreferrer">
                          {job.proposal_filename || "Open proposal"}
                        </a>
                      </div>
                    ) : (
                      <p className={styles.packetEmpty}>No proposal on this job yet.</p>
                    )}
                    <input
                      ref={proposalInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className={styles.avatarFileInput}
                      disabled={proposalBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadProposal(file);
                        event.target.value = "";
                      }}
                    />
                    <div className={styles.photoActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.photoPrimary}`}
                        disabled={proposalBusy}
                        onClick={() => proposalInputRef.current?.click()}
                      >
                        {proposalBusy ? "Saving…" : job.proposal_url ? "Replace proposal" : "Upload proposal"}
                      </button>
                    </div>
                  </section>

                  <section className={styles.dashCard} id="packet-notes">
                    <p className={styles.colLabel}>Before the install</p>
                    <h3 className={styles.packetSection}>Your notes</h3>
                    <p className={styles.jobMeta}>
                      What you designed, what to watch for, anything the installer and the office should know.
                    </p>
                    <textarea
                      className={`${styles.textarea} ${styles.packetNotesArea}`}
                      value={designerNotes}
                      onChange={(event) => setDesignerNotes(event.target.value)}
                      placeholder="Measurements, finishes, what changed from the first visit…"
                    />
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.packetBtn}`}
                      disabled={busy}
                      onClick={() => void saveDesignerNotes()}
                    >
                      Save notes
                    </button>
                  </section>

                  <section className={`${styles.dashCard} ${styles.packetOpsCard}`} id="packet-design">
                    <p className={styles.colLabel}>Hand off to Frank</p>
                    <h3 className={styles.packetSection}>Design is done</h3>
                    {job.design_ready_choice || job.skip_job_check ? (
                      <p className={styles.jobMeta}>
                        {job.design_ready_choice === "skip" || job.skip_job_check
                          ? "Sent to Frank. Simple closet — job check skipped. He can get it ready to order."
                          : "Sent to Frank. This job needs a job check before it is ordered."}
                      </p>
                    ) : (
                      <p className={styles.jobMeta}>
                        Send Frank a confirmation when the design is finished. Nothing goes to the customer.
                      </p>
                    )}
                    {DESIGN_STAGES.has(job.stage) ? (
                      <div className={styles.profileActions}>
                        <button
                          type="button"
                          className={job.design_ready_choice === "job_check" ? styles.btnOk : styles.btnGhost}
                          disabled={busy}
                          onClick={() => void finishDesign("job_check")}
                        >
                          {job.design_ready_choice === "job_check" ? "Sent · needs a job check" : "Needs a job check"}
                        </button>
                        <button
                          type="button"
                          className={
                            job.design_ready_choice === "skip" || job.skip_job_check ? styles.btnOk : styles.btnGhost
                          }
                          disabled={busy}
                          onClick={() => void finishDesign("skip")}
                        >
                          {job.design_ready_choice === "skip" || job.skip_job_check
                            ? "Sent · skip job check"
                            : "Simple closet, skip job check"}
                        </button>
                      </div>
                    ) : null}
                  </section>
                </div>

                <div className={styles.packetDocCol}>
                  <section className={`${styles.dashCard} ${styles.packetDocCard}`} id="packet-photos">
                    <div className={styles.packetDocHead}>
                      <div>
                        <p className={styles.colLabel}>On this job</p>
                        <h3 className={styles.packetSection}>Photos</h3>
                        <p className={styles.jobMeta}>
                          Installer photos are here. Add your own, including paperwork that cannot be scanned.
                          It saves on the project.
                        </p>
                      </div>
                      <span className={styles.packetCount}>{photos.length}</span>
                    </div>

                    <div className={styles.kindChips} role="group" aria-label="File type">
                      {PHOTO_KINDS.map((kind) => (
                        <button
                          key={kind.id}
                          type="button"
                          className={`${styles.kindChip} ${photoKind === kind.id ? styles.kindChipActive : ""}`}
                          onClick={() => setPhotoKind(kind.id)}
                        >
                          {kind.label}
                        </button>
                      ))}
                    </div>
                    <label className={styles.field}>
                      <span className={styles.label}>Caption (optional)</span>
                      <input
                        className={styles.input}
                        value={photoCaption}
                        onChange={(event) => setPhotoCaption(event.target.value)}
                        placeholder="What is this?"
                      />
                    </label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      className={styles.avatarFileInput}
                      disabled={photoBusy}
                      onChange={(event) => {
                        const files = event.target.files;
                        if (files?.length) void uploadPhotos(files);
                        event.target.value = "";
                      }}
                    />
                    <div className={styles.photoActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.photoPrimary}`}
                        disabled={photoBusy}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {photoBusy ? "Saving…" : "Add photos or paperwork"}
                      </button>
                    </div>

                    {photos.length > 0 ? (
                      <div className={styles.mediaGrid}>
                        {photos.map((photo) =>
                          photo.public_url ? (
                            <figure key={photo.id} className={styles.mediaFigure}>
                              {isPhotoImage(photo) ? (
                                <a href={photo.public_url} target="_blank" rel="noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={photo.public_url}
                                    alt={photo.caption || photo.kind_label}
                                    className={styles.mediaThumb}
                                  />
                                </a>
                              ) : (
                                <a
                                  href={photo.public_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.mediaThumb}
                                  style={{
                                    display: "grid",
                                    placeItems: "center",
                                    fontWeight: 700,
                                    textDecoration: "none",
                                    color: "inherit",
                                  }}
                                >
                                  Open PDF
                                </a>
                              )}
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
                      <p className={styles.packetEmpty}>Nothing on this job yet.</p>
                    )}
                  </section>

                  <section className={styles.dashCard} id="packet-grade">
                    <p className={styles.colLabel}>After the install</p>
                    <h3 className={styles.packetSection}>Grade the install</h3>
                    {GRADE_STAGES.has(job.stage) || job.install_grade ? (
                      <p className={styles.jobMeta}>1 is poor, 5 is perfect. Only the office sees this.</p>
                    ) : (
                      <p className={styles.packetEmpty}>
                        Grade this after the installer has been to the job. Photos, the proposal, and your notes come first.
                      </p>
                    )}
                    {GRADE_STAGES.has(job.stage) || job.install_grade ? (
                      <>
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
                      </>
                    ) : null}
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
