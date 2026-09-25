"use client";

import { useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import { mediaKindLabel, isImageMime } from "@/lib/inspired-closets-ops-media";
import styles from "./ops-payroll.module.css";

type DesignerCard = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  initials: string;
  hasPassword: boolean;
  openLeads: number;
  jobs: number;
};

type LeadRow = {
  id: string;
  clientName: string;
  phone: string | null;
  address: string | null;
  stage: string;
  source: string;
  notes: string | null;
  updatedAt: string;
  open: boolean;
};

type JobRow = {
  id: string;
  clientName: string;
  address: string | null;
  phone: string | null;
  title: string | null;
  stage: string;
  installDate: string | null;
  visitWindow: string | null;
  notes: string | null;
  fieldNotes: string | null;
  designerNotes: string | null;
  installGrade: number | null;
  installGradeNote: string | null;
  frank: string;
  proposalFilename: string | null;
  proposalUrl: string | null;
};

type ScheduleRow = {
  id: string;
  clientName: string;
  kind: string;
  scheduledAt: string;
  status: string;
  locationText: string | null;
};

type MediaRow = {
  id: string;
  jobId: string;
  clientName: string;
  kind: string;
  caption: string | null;
  mimeType: string | null;
  publicUrl: string | null;
  createdAt: string;
};

type DetailTab = "details" | "schedule" | "leads" | "jobs" | "photos";

function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Avatar({ person, large }: { person: Pick<DesignerCard, "avatarUrl" | "initials" | "name">; large?: boolean }) {
  const className = large ? styles.installerAvatarLg : styles.installerAvatar;
  if (person.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={person.avatarUrl} alt="" className={className} />
    );
  }
  return (
    <span className={className} aria-hidden>
      {person.initials || person.name.slice(0, 1)}
    </span>
  );
}

export default function OpsDesignersWorkspace() {
  const [designers, setDesigners] = useState<DesignerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("details");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [portalPassword, setPortalPassword] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalNote, setPortalNote] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/designers");
      const payload = (await response.json()) as { ok?: boolean; error?: string; designers?: DesignerCard[] };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load designers.");
      setDesigners(payload.designers ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to load designers.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/inspired-closets/ops/designers?id=${encodeURIComponent(id)}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        leads?: LeadRow[];
        jobs?: JobRow[];
        schedule?: ScheduleRow[];
        media?: MediaRow[];
      };
      if (!payload.ok) throw new Error(payload.error ?? "Designer not found.");
      setLeads(payload.leads ?? []);
      setJobs(payload.jobs ?? []);
      setSchedule(payload.schedule ?? []);
      setMedia(payload.media ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to open designer.");
      setSelectedId(null);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    setPortalPassword("");
    setPortalNote(null);
  }, [selectedId]);

  async function savePortalPassword(id: string) {
    setPortalBusy(true);
    setPortalNote(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/designers/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password: portalPassword }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; username?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not set password.");
      setPortalPassword("");
      setPortalNote(`Saved. They sign in at the designer portal with “${payload.username}” and this password.`);
      await loadList();
    } catch (error) {
      setPortalNote(error instanceof Error ? error.message : "Could not set password.");
    } finally {
      setPortalBusy(false);
    }
  }

  const person = designers.find((row) => row.id === selectedId) ?? null;
  const openLeadCount = designers.reduce((sum, row) => sum + row.openLeads, 0);
  const jobCount = designers.reduce((sum, row) => sum + row.jobs, 0);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingInstalls = jobs
    .filter((job) => job.installDate)
    .slice()
    .sort((a, b) => (a.installDate ?? "").localeCompare(b.installDate ?? ""))
    .filter((job) => (job.installDate ?? "") >= today);

  if (person) {
    const photoGroups = [...new Map(media.map((item) => [item.jobId, item.clientName])).entries()];
    return (
      <OpsShell title={person.name} hideTitle>
        {notice ? <p className={`${styles.notice} ${styles.noticeError}`}>{notice}</p> : null}
        <div className={styles.leadHeader}>
          <div className={styles.installerIdentity}>
            <Avatar person={person} large />
            <div>
              <h1 className={styles.leadName}>{person.name}</h1>
              <p className={styles.leadContact}>
                {person.phone ?? "No phone"}
                {person.email ? ` · ${person.email}` : ""}
              </p>
            </div>
          </div>
          <div className={styles.leadHeaderActions}>
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={() => {
                setSelectedId(null);
                setTab("details");
              }}
            >
              ← Back to designers
            </button>
          </div>
        </div>

        <div className={styles.leadTabs}>
          {(
            [
              ["details", "details"],
              ["schedule", "schedule"],
              ["leads", "leads"],
              ["jobs", "jobs"],
              ["photos", "photos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.leadTab} ${tab === id ? styles.leadTabActive : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.detailStack}>
          {tab === "details" ? (
            <section className={styles.panel}>
              <p className={styles.railTitle}>File</p>
              <div className={styles.detailGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <p className={styles.readValue}>{person.name}</p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <p className={styles.readValue}>{person.phone ?? "—"}</p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Email</span>
                  <p className={styles.readValue}>{person.email ?? "—"}</p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Portal login</span>
                  <p className={styles.readValue}>{person.hasPassword ? "Password is set" : "No password yet"}</p>
                </label>
                <form
                  className={styles.field}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void savePortalPassword(person.id);
                  }}
                >
                  <span className={styles.fieldLabel}>
                    {person.hasPassword ? "Reset password" : "Set password"} · signs in as “
                    {(person.name.trim().split(/\s+/)[0] ?? person.name).toLowerCase()}”
                  </span>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <input
                      className={styles.input}
                      type="text"
                      autoComplete="off"
                      minLength={6}
                      value={portalPassword}
                      onChange={(event) => setPortalPassword(event.target.value)}
                      placeholder="At least 6 characters"
                    />
                    <button
                      type="submit"
                      className={styles.buttonPrimary}
                      disabled={portalBusy || portalPassword.length < 6}
                    >
                      {portalBusy ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {portalNote ? <p className={styles.leadContact}>{portalNote}</p> : null}
                </form>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Open leads</span>
                  <p className={styles.readValue}>{person.openLeads}</p>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Jobs</span>
                  <p className={styles.readValue}>{person.jobs}</p>
                </label>
              </div>
            </section>
          ) : null}

          {tab === "schedule" ? (
            <section className={styles.panel}>
              <p className={styles.railTitle}>Appointments</p>
              {schedule.length === 0 ? <p className={styles.leadContact}>No appointments on her calendar.</p> : null}
              {schedule.slice(0, 12).map((item) => (
                <p key={item.id} className={styles.leadContact}>
                  <strong>{item.clientName}</strong>
                  {" · "}
                  {formatStamp(item.scheduledAt)} · {item.kind}
                  {item.locationText ? ` · ${item.locationText}` : ""}
                </p>
              ))}
              <p className={styles.railTitle} style={{ marginTop: "1rem" }}>
                Install dates on her jobs
              </p>
              {upcomingInstalls.length === 0 ? (
                <p className={styles.leadContact}>No upcoming install dates.</p>
              ) : (
                upcomingInstalls.slice(0, 8).map((job) => (
                  <p key={job.id} className={styles.leadContact}>
                    <strong>{job.clientName}</strong>
                    {" · "}
                    {formatDay(job.installDate)}
                    {job.visitWindow ? ` · ${job.visitWindow}` : ""}
                    {" · "}
                    {job.stage}
                  </p>
                ))
              )}
            </section>
          ) : null}

          {tab === "leads" ? (
            leads.filter((lead) => lead.open).length === 0 ? (
              <section className={styles.panel}>
                <p className={styles.empty}>No open leads assigned.</p>
              </section>
            ) : (
              leads
                .filter((lead) => lead.open)
                .map((lead) => (
                  <section key={lead.id} className={styles.panel}>
                    <div className={styles.gradeCardHead}>
                      <p className={styles.railTitle}>{lead.clientName}</p>
                      <span className={styles.leadContact}>{lead.stage}</span>
                    </div>
                    <p className={styles.leadContact}>
                      {lead.source}
                      {lead.phone ? ` · ${lead.phone}` : ""}
                      {lead.address ? ` · ${lead.address}` : ""}
                    </p>
                    {lead.notes ? <p className={styles.leadContact}>{lead.notes}</p> : null}
                  </section>
                ))
            )
          ) : null}

          {tab === "jobs" ? (
            jobs.length === 0 ? (
              <section className={styles.panel}>
                <p className={styles.empty}>No jobs assigned.</p>
              </section>
            ) : (
              jobs.map((job) => (
                <section key={job.id} className={styles.panel}>
                  <p className={styles.railTitle}>
                    {job.clientName}
                    {job.title ? ` · ${job.title}` : ""}
                  </p>
                  <p className={styles.leadContact}>
                    {job.stage} · Install {formatDay(job.installDate)}
                    {job.visitWindow ? ` · ${job.visitWindow}` : ""}
                    {job.address ? ` · ${job.address}` : ""}
                  </p>
                  <p className={styles.leadContact}>
                    <strong>Frank. </strong>
                    {job.frank}
                  </p>
                  <p className={styles.leadContact}>
                    <strong>Her notes. </strong>
                    {job.designerNotes || "None yet."}
                  </p>
                  <p className={styles.leadContact}>
                    <strong>Office notes. </strong>
                    {job.notes || "None."}
                  </p>
                  <p className={styles.leadContact}>
                    <strong>Field notes. </strong>
                    {job.fieldNotes || "None yet."}
                  </p>
                  {job.installGrade ? (
                    <p className={styles.leadContact}>
                      She graded this install {job.installGrade}/5
                      {job.installGradeNote ? ` — ${job.installGradeNote}` : ""}.
                    </p>
                  ) : null}
                  {job.proposalUrl ? (
                    <p className={styles.leadContact}>
                      <a href={job.proposalUrl} target="_blank" rel="noreferrer">
                        Open design PDF{job.proposalFilename ? ` · ${job.proposalFilename}` : ""}
                      </a>
                    </p>
                  ) : (
                    <p className={styles.leadContact}>No proposal on this job yet.</p>
                  )}
                </section>
              ))
            )
          ) : null}

          {tab === "photos" ? (
            media.length === 0 ? (
              <section className={styles.panel}>
                <p className={styles.empty}>No photos from this designer yet.</p>
              </section>
            ) : (
              photoGroups.map(([jobId, clientName]) => (
                <section key={jobId} className={styles.panel}>
                  <p className={styles.railTitle}>{clientName}</p>
                  <div className={styles.installerMediaGrid}>
                    {media
                      .filter((item) => item.jobId === jobId)
                      .map((item) => (
                        <figure key={item.id} className={styles.installerMediaCard}>
                          {item.publicUrl && isImageMime(item.mimeType) ? (
                            <a href={item.publicUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.publicUrl} alt={item.caption || item.kind} />
                            </a>
                          ) : item.publicUrl ? (
                            <a className={styles.installerMediaMissing} href={item.publicUrl} target="_blank" rel="noreferrer">
                              Open paperwork
                            </a>
                          ) : (
                            <div className={styles.installerMediaMissing}>No preview</div>
                          )}
                          <figcaption>
                            {mediaKindLabel(item.kind)}
                            {item.caption ? ` · ${item.caption}` : ""}
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                </section>
              ))
            )
          ) : null}
        </div>
      </OpsShell>
    );
  }

  return (
    <OpsShell title="Designer portal" subtitle="What each designer has on her leads, jobs, and schedule.">
      {notice ? <p className={`${styles.notice} ${styles.noticeError}`}>{notice}</p> : null}
      <div className={styles.statStrip} aria-label="Designer totals">
        <article className={styles.statCard}>
          <p className={styles.statCardLabel}>Designers</p>
          <p className={styles.statCardValue}>{designers.length}</p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statCardLabel}>Open leads</p>
          <p className={styles.statCardValue}>{openLeadCount}</p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statCardLabel}>Jobs</p>
          <p className={styles.statCardValue}>{jobCount}</p>
        </article>
      </div>

      {loading ? (
        <div className={styles.panel}>
          <p className={styles.empty}>Loading designers…</p>
        </div>
      ) : designers.length === 0 ? (
        <div className={styles.panel}>
          <p className={styles.empty}>No designers on file.</p>
        </div>
      ) : (
        <div className={styles.rosterGrid}>
          {designers.map((row) => (
            <button key={row.id} type="button" className={styles.rosterCard} onClick={() => setSelectedId(row.id)}>
              <div className={styles.rosterCardTop}>
                <Avatar person={row} />
                <div className={styles.rosterCardName}>
                  <strong>{row.name}</strong>
                </div>
              </div>
              <div className={styles.rosterStats}>
                <span>
                  <em>{row.openLeads}</em> open leads
                </span>
                <span>
                  <em>{row.jobs}</em> jobs
                </span>
              </div>
              {row.phone ? <p className={styles.leadContact}>{row.phone}</p> : null}
            </button>
          ))}
        </div>
      )}
    </OpsShell>
  );
}
