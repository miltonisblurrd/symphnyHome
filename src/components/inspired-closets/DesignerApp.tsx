"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./designer.module.css";

type Designer = { id: string; name: string };

type LeadRow = {
  id: string;
  client_name: string;
  stage: string;
  notes: string | null;
  converted_job_id: string | null;
};

type JobRow = {
  id: string;
  client_name: string;
  title: string | null;
  stage: string;
  install_grade?: number | null;
  skip_job_check?: boolean | null;
};

type AppointmentRow = {
  id: string;
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
  notes: string | null;
  field_notes: string | null;
  install_grade: number | null;
  install_grade_note: string | null;
  skip_job_check: boolean | null;
  client: { name: string; phone?: string | null; address?: string | null } | null;
  installer: { name: string } | null;
};

function when(value: string): string {
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

export default function DesignerApp() {
  const [designer, setDesigner] = useState<Designer | null>(null);
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"schedule" | "leads" | "jobs">("jobs");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [grade, setGrade] = useState(0);
  const [gradeNote, setGradeNote] = useState("");
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadHome = useCallback(async () => {
    const response = await fetch("/api/inspired-closets/designers/home");
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      leads?: LeadRow[];
      jobs?: JobRow[];
      appointments?: AppointmentRow[];
    };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not load your work.");
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

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
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
  }

  async function openJob(id: string) {
    setBusy(true);
    setNotice(null);
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
      setNotice({ kind: "info", text: "Grade saved on the job." });
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
      setJob({
        ...job,
        stage: payload.job?.stage ?? job.stage,
        skip_job_check: payload.job?.skip_job_check ?? choice === "skip",
      });
      setNotice({
        kind: "info",
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

  if (!ready) {
    return (
      <main className={styles.page}>
        <p className={styles.wrap}>Loading…</p>
      </main>
    );
  }

  if (!designer) {
    return (
      <main className={styles.page}>
        <form className={styles.login} onSubmit={(event) => void signIn(event)}>
          <p className={styles.brand}>INSPIRED CLOSETS</p>
          <h1>Designer portal</h1>
          <p className={styles.meta}>Sign in with your name and the password the office set. Rebecca is the first login.</p>
          {notice ? <p className={`${styles.notice} ${styles.error}`}>{notice.text}</p> : null}
          <label>
            Name
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className={styles.button} type="submit" disabled={busy}>
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <div>
          <p className={styles.brand}>DESIGNER PORTAL</p>
          <p className={styles.name}>{designer.name}</p>
        </div>
        <button className={styles.ghost} type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <div className={styles.wrap}>
        {notice ? (
          <p className={`${styles.notice} ${notice.kind === "error" ? styles.error : ""}`}>{notice.text}</p>
        ) : null}

        {job ? (
          <section className={styles.panel}>
            <button className={styles.ghost} type="button" onClick={() => setJob(null)}>
              ← Back
            </button>
            <h2>{job.client?.name ?? "Job"}</h2>
            <p className={styles.meta}>
              {job.stage_label}
              {job.title ? ` · ${job.title}` : ""}
              {job.installer?.name ? ` · Installer ${job.installer.name}` : ""}
            </p>
            {job.client?.address ? <p className={styles.meta}>{job.client.address}</p> : null}
            <p className={styles.meta}>{job.field_notes || job.notes || "No notes on what was done yet."}</p>
            {job.skip_job_check ? <p className={styles.meta}>Simple closet — job check skipped.</p> : null}

            <h2 style={{ marginTop: "1rem" }}>Photos</h2>
            {photos.length === 0 ? (
              <p className={styles.meta}>No installer photos on this job yet.</p>
            ) : (
              <div className={styles.photos}>
                {photos.map((photo) => (
                  <figure key={photo.id} style={{ margin: 0 }}>
                    {photo.public_url ? (
                      <a href={photo.public_url} target="_blank" rel="noreferrer">
                        <img src={photo.public_url} alt={photo.caption || photo.kind_label} />
                      </a>
                    ) : null}
                    <figcaption className={styles.meta}>
                      {photo.kind_label}
                      {photo.installer_name ? ` · ${photo.installer_name}` : ""}
                      {photo.caption ? ` — ${photo.caption}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            <h2 style={{ marginTop: "1rem" }}>Grade the install</h2>
            <div className={styles.grades}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.grade} ${grade === value ? styles.gradeOn : ""}`}
                  onClick={() => setGrade(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <label style={{ marginTop: "0.6rem" }}>
              Note
              <textarea rows={2} value={gradeNote} onChange={(event) => setGradeNote(event.target.value)} />
            </label>
            <div className={styles.row}>
              <button className={styles.button} type="button" disabled={busy || grade < 1} onClick={() => void saveGrade()}>
                Save grade
              </button>
            </div>

            <h2 style={{ marginTop: "1rem" }}>Design is done</h2>
            <p className={styles.meta}>Tell Frank what happens next. No text goes to the customer.</p>
            <div className={styles.row}>
              <button className={styles.button} type="button" disabled={busy} onClick={() => void finishDesign("job_check")}>
                Needs a job check
              </button>
              <button className={styles.ghost} type="button" disabled={busy} onClick={() => void finishDesign("skip")}>
                Simple closet, skip job check
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className={styles.tabs}>
              {(
                [
                  ["schedule", "Schedule"],
                  ["leads", "Leads"],
                  ["jobs", "Jobs"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.tab} ${tab === id ? styles.tabOn : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "schedule" ? (
              <div className={styles.list}>
                {appointments.length === 0 ? <p className={styles.meta}>Nothing on your schedule.</p> : null}
                {appointments.map((row) => (
                  <article key={row.id} className={styles.card}>
                    <strong>{row.subject || row.client_name}</strong>
                    <p className={styles.meta}>
                      {when(row.scheduled_at)} · {row.kind.replace(/_/g, " ")}
                      {row.location_text ? ` · ${row.location_text}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}

            {tab === "leads" ? (
              <div className={styles.list}>
                {leads.length === 0 ? <p className={styles.meta}>No leads assigned to you.</p> : null}
                {leads.map((row) => (
                  <article key={row.id} className={styles.card}>
                    <strong>{row.client_name}</strong>
                    <p className={styles.meta}>
                      {row.stage.replace(/_/g, " ")}
                      {row.converted_job_id ? "" : " · not a job yet"}
                    </p>
                    {row.notes ? <p className={styles.meta}>{row.notes}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}

            {tab === "jobs" ? (
              <div className={styles.list}>
                {jobs.length === 0 ? <p className={styles.meta}>No jobs assigned to you.</p> : null}
                {jobs.map((row) => (
                  <button key={row.id} type="button" className={styles.card} onClick={() => void openJob(row.id)}>
                    <strong>{row.client_name}</strong>
                    <p className={styles.meta}>
                      {row.stage.replace(/_/g, " ")}
                      {row.title ? ` · ${row.title}` : ""}
                      {row.install_grade ? ` · grade ${row.install_grade}/5` : ""}
                      {row.skip_job_check ? " · job check skipped" : ""}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
