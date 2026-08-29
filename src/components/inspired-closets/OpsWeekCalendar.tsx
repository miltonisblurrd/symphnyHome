"use client";

import { useMemo } from "react";
import { CALENDAR_LANES, type CalendarLane } from "@/lib/inspired-closets-ops-calendar";
import styles from "./ops-payroll.module.css";

export type WeekCalEvent = {
  id: string;
  lane: CalendarLane | "timeoff";
  date: string;
  timeLabel: string;
  title: string;
  meta?: string;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1, 0, 0, 0, 0);
}

function monthGrid(monthStart: Date): Date[] {
  const first = startOfMonth(monthStart);
  const weekday = first.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() + mondayOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

const LANE_CLASS: Record<CalendarLane | "timeoff", string> = {
  appointment: styles.calChipAppointment,
  install: styles.calChipInstall,
  showroom: styles.calChipShowroom,
  goback: styles.calChipGoback,
  timeoff: styles.calChipTimeoff,
};

export default function OpsWeekCalendar({
  events,
  weekStartIso,
  onWeekChange,
}: {
  events: WeekCalEvent[];
  weekStartIso: string;
  onWeekChange: (iso: string) => void;
}) {
  const monthStart = useMemo(() => startOfMonth(new Date(weekStartIso)), [weekStartIso]);
  const days = useMemo(() => monthGrid(monthStart), [monthStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, WeekCalEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
    }
    return map;
  }, [events]);

  const range = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthIndex = monthStart.getMonth();

  return (
    <div className={styles.panel} style={{ marginBottom: "1rem" }}>
      <div className={styles.calWeekToolbar}>
        <div className={styles.calWeekNav}>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => onWeekChange(addMonths(monthStart, -1).toISOString())}
          >
            ‹
          </button>
          <p className={styles.calWeekRange}>{range}</p>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => onWeekChange(addMonths(monthStart, 1).toISOString())}
          >
            ›
          </button>
        </div>
        <div className={styles.calLegend} aria-label="Event colors">
          {CALENDAR_LANES.map((lane) => (
            <span key={lane.id} className={`${styles.calLegendChip} ${LANE_CLASS[lane.id]}`}>
              {lane.label}
            </span>
          ))}
          <span className={`${styles.calLegendChip} ${styles.calChipTimeoff}`}>PTO / sick</span>
        </div>
        <button
          type="button"
          className={styles.buttonGhost}
          onClick={() => onWeekChange(startOfMonth(new Date()).toISOString())}
        >
          This month
        </button>
      </div>
      <div className={styles.calWeekScroll}>
        <div className={styles.calWeekGrid}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <p key={label} className={styles.calMonthDow}>
              {label}
            </p>
          ))}
          {days.map((day) => {
            const key = ymd(day);
            const items = byDay.get(key) ?? [];
            const inMonth = day.getMonth() === monthIndex;
            return (
              <div
                key={key}
                className={`${styles.calWeekDay} ${styles.calMonthDay} ${
                  inMonth ? "" : styles.calMonthDayMute
                }`}
              >
                <p className={styles.calWeekDayHead}>
                  <strong>{day.getDate()}</strong>
                </p>
                {items.length === 0 ? (
                  <p className={styles.calWeekEmpty}>—</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className={`${styles.calChip} ${LANE_CLASS[item.lane]}`}>
                      <span className={styles.calChipTime}>{item.timeLabel}</span>
                      <span className={styles.calChipTitle}>{item.title}</span>
                      {item.meta ? <span className={styles.calChipMeta}>{item.meta}</span> : null}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
