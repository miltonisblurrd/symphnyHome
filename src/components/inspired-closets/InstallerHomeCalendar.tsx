"use client";

import { useMemo, useState } from "react";
import { eachDateInclusive } from "@/lib/inspired-closets-field-dates";
import styles from "./field.module.css";

type CalJob = {
  id: string;
  install_date: string | null;
  visit_window?: string | null;
  client: { name: string } | null;
};

type CalTimeOff = {
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

export default function InstallerHomeCalendar({
  jobs,
  timeOff,
  onOpenJob,
}: {
  jobs: CalJob[];
  timeOff: CalTimeOff[];
  onOpenJob: (jobId: string) => void;
}) {
  const [view, setView] = useState<"week" | "month">("week");
  const [cursor, setCursor] = useState(() => atNoon(new Date()));
  const today = ymd(new Date());

  const jobsByDate = useMemo(() => {
    const map = new Map<string, CalJob[]>();
    for (const job of jobs) {
      if (!job.install_date) continue;
      const key = job.install_date.slice(0, 10);
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

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return [0, 1, 2, 3, 4, 5].map((offset) => {
      const date = addDays(start, offset);
      return { key: ymd(date), date, label: date.toLocaleDateString("en-US", { weekday: "short" }) };
    });
  }, [cursor]);

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const start = startOfWeek(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
    const end = addDays(startOfWeek(last), 6);
    const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];
    for (let date = start; date.getTime() <= end.getTime(); date = addDays(date, 1)) {
      cells.push({
        key: ymd(date),
        day: date.getDate(),
        inMonth: date.getMonth() === cursor.getMonth(),
      });
    }
    return cells;
  }, [cursor]);

  const heading =
    view === "week"
      ? `${weekDays[0]?.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[5]?.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function shift(direction: -1 | 1) {
    setCursor((current) =>
      view === "week"
        ? addDays(current, direction * 7)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1, 12),
    );
  }

  return (
    <section className={styles.dashCard} aria-label="Your schedule">
      <div className={styles.calHead}>
        <p className={`${styles.colLabel} ${styles.calTitle}`}>Your schedule</p>
        <div className={styles.calToggle} role="tablist" aria-label="Schedule view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "week"}
            className={`${styles.calToggleBtn} ${view === "week" ? styles.calToggleBtnOn : ""}`}
            onClick={() => setView("week")}
          >
            Week
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "month"}
            className={`${styles.calToggleBtn} ${view === "month" ? styles.calToggleBtnOn : ""}`}
            onClick={() => setView("month")}
          >
            Month
          </button>
        </div>
      </div>

      <div className={styles.calNav}>
        <button type="button" className={styles.calNavBtn} aria-label="Previous" onClick={() => shift(-1)}>
          ‹
        </button>
        <p className={styles.calRange}>{heading}</p>
        <button type="button" className={styles.calNavBtn} aria-label="Next" onClick={() => shift(1)}>
          ›
        </button>
      </div>

      {view === "week" ? (
        <div className={styles.calWeek}>
          {weekDays.map((day) => {
            const dayJobs = jobsByDate.get(day.key) ?? [];
            return (
              <div key={day.key} className={`${styles.calWeekRow} ${day.key === today ? styles.calToday : ""}`}>
                <p className={styles.calWeekLabel}>
                  {day.label} {day.date.getDate()}
                  {ptoDays.has(day.key) ? <span>PTO</span> : null}
                </p>
                {dayJobs.length === 0 ? (
                  <p className={styles.calEmpty}>{ptoDays.has(day.key) ? "Off" : "—"}</p>
                ) : (
                  dayJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className={styles.calJob}
                      onClick={() => onOpenJob(job.id)}
                    >
                      <strong>{lastName(job.client?.name)}</strong>
                      {job.visit_window ? <span>{job.visit_window}</span> : null}
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.calMonth}>
          <div className={styles.calDow}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className={styles.calGrid}>
            {monthCells.map((cell) => {
              const count = jobsByDate.get(cell.key)?.length ?? 0;
              return (
                <div
                  key={cell.key}
                  className={`${styles.calCell} ${cell.inMonth ? "" : styles.calCellMute} ${
                    cell.key === today ? styles.calToday : ""
                  } ${ptoDays.has(cell.key) ? styles.calCellPto : ""}`}
                >
                  <span>{cell.day}</span>
                  {count > 0 ? <i className={styles.calDot} aria-hidden /> : null}
                </div>
              );
            })}
          </div>
          <ul className={styles.calMonthJobs}>
            {jobs
              .filter((job) => {
                if (!job.install_date) return false;
                const key = job.install_date.slice(0, 10);
                return key.startsWith(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
              })
              .sort((a, b) => (a.install_date ?? "").localeCompare(b.install_date ?? ""))
              .map((job) => (
                <li key={job.id}>
                  <button type="button" className={styles.calJob} onClick={() => onOpenJob(job.id)}>
                    <strong>{job.client?.name ?? "Job"}</strong>
                    <span>
                      {job.install_date
                        ? new Date(`${job.install_date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "TBD"}
                      {job.visit_window ? ` · ${job.visit_window}` : ""}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
