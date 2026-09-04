"use client";

import { useMemo, useState } from "react";
import { eachDateInclusive } from "@/lib/inspired-closets-field-dates";
import { ymdFromIso } from "@/lib/inspired-closets-ops-calendar";
import styles from "./field.module.css";

type MonthJob = {
  id: string;
  install_date: string | null;
  visit_window?: string | null;
  job_kind?: string | null;
  client: { name: string } | null;
};

type MonthTimeOff = {
  start_date: string;
  end_date: string;
  status: string;
};

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function atNoon(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
}

function addDays(value: Date, days: number): Date {
  const next = atNoon(value);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(value: Date): Date {
  const date = atNoon(value);
  const diff = date.getDay() === 0 ? -6 : 1 - date.getDay();
  date.setDate(date.getDate() + diff);
  return date;
}

function lastName(full: string | null | undefined): string {
  if (!full) return "Job";
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] ?? full;
}

function kindClass(kind: string | null | undefined): string {
  if (kind === "service") return styles.chipService;
  if (kind === "go_back") return styles.chipGoBack;
  return styles.chipNew;
}

export default function InstallerMonthPage({
  jobs,
  timeOff,
  onOpenJob,
}: {
  jobs: MonthJob[];
  timeOff: MonthTimeOff[];
  onOpenJob: (jobId: string) => void;
}) {
  const [cursor, setCursor] = useState(() => atNoon(new Date()));
  const today = ymd(new Date());
  const [selected, setSelected] = useState(today);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, MonthJob[]>();
    for (const job of jobs) {
      if (!job.install_date) continue;
      const key = ymdFromIso(job.install_date);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [jobs]);

  const ptoDays = useMemo(() => {
    const days = new Set<string>();
    for (const row of timeOff) {
      if (row.status !== "approved") continue;
      for (const day of eachDateInclusive(row.start_date, row.end_date)) days.add(day);
    }
    return days;
  }, [timeOff]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const start = startOfWeek(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
    const end = addDays(startOfWeek(last), 6);
    const out: Array<{ key: string; day: number; inMonth: boolean }> = [];
    for (let date = start; date.getTime() <= end.getTime(); date = addDays(date, 1)) {
      out.push({
        key: ymd(date),
        day: date.getDate(),
        inMonth: date.getMonth() === cursor.getMonth(),
      });
    }
    return out;
  }, [cursor]);

  const selectedJobs = jobsByDate.get(selected) ?? [];
  const selectedLabel = new Date(`${selected}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  function shiftMonth(direction: -1 | 1) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1, 12);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setCursor(next);
    setSelected(today.startsWith(nextKey) ? today : `${nextKey}-01`);
  }

  return (
    <section className={styles.monthPage} aria-label="Your calendar">
      <div className={styles.monthPageHead}>
        <button
          type="button"
          className={styles.calNavBtn}
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <h1 className={styles.monthPageTitle}>
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h1>
        <button
          type="button"
          className={styles.calNavBtn}
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
        >
          ›
        </button>
      </div>

      <div className={styles.monthPageDow}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className={styles.monthPageDesktop}>
        <div className={styles.monthPageGrid}>
          {cells.map((cell) => {
            const dayJobs = jobsByDate.get(cell.key) ?? [];
            return (
              <div
                key={cell.key}
                className={`${styles.monthPageCell} ${cell.inMonth ? "" : styles.monthPageCellMute} ${
                  cell.key === today ? styles.monthPageToday : ""
                } ${ptoDays.has(cell.key) ? styles.monthPagePto : ""}`}
              >
                <p className={styles.monthPageNum}>
                  {cell.day}
                  {ptoDays.has(cell.key) ? <span>PTO</span> : null}
                </p>
                {dayJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className={`${styles.monthPageJob} ${kindClass(job.job_kind)}`}
                    onClick={() => onOpenJob(job.id)}
                  >
                    <strong>{lastName(job.client?.name)}</strong>
                    {job.visit_window ? <span>{job.visit_window}</span> : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.monthPageMobile}>
        <div className={styles.monthCompactGrid}>
          {cells.map((cell) => {
            const count = jobsByDate.get(cell.key)?.length ?? 0;
            return (
              <button
                key={cell.key}
                type="button"
                className={`${styles.monthCompactDay} ${cell.inMonth ? "" : styles.monthPageCellMute} ${
                  cell.key === today ? styles.monthPageToday : ""
                } ${cell.key === selected ? styles.monthCompactOn : ""} ${
                  ptoDays.has(cell.key) ? styles.monthPagePto : ""
                }`}
                onClick={() => setSelected(cell.key)}
              >
                <span>{cell.day}</span>
                {count > 0 ? <i className={styles.calDot} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
        <div className={styles.monthAgenda}>
          <p className={styles.colLabel}>{selectedLabel}</p>
          {ptoDays.has(selected) ? <p className={styles.monthAgendaPto}>PTO</p> : null}
          {selectedJobs.length === 0 ? (
            <p className={styles.empty}>{ptoDays.has(selected) ? "You’re off this day." : "No install this day."}</p>
          ) : (
            <ul className={styles.recentList}>
              {selectedJobs.map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    className={`${styles.recentItem} ${styles.monthAgendaJob}`}
                    onClick={() => onOpenJob(job.id)}
                  >
                    <strong>{job.client?.name ?? "Job"}</strong>
                    <span>{job.visit_window || lastName(job.client?.name)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
