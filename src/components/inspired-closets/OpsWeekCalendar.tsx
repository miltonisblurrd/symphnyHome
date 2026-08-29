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

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const weekStart = useMemo(() => new Date(weekStartIso), [weekStartIso]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
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

  const end = addDays(weekStart, 6);
  const range = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className={styles.panel} style={{ marginBottom: "1rem" }}>
      <div className={styles.calWeekToolbar}>
        <div className={styles.calWeekNav}>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => onWeekChange(addDays(weekStart, -7).toISOString())}
          >
            ‹
          </button>
          <p className={styles.calWeekRange}>{range}</p>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => onWeekChange(addDays(weekStart, 7).toISOString())}
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
          onClick={() => onWeekChange(startOfWeekIso())}
        >
          This week
        </button>
      </div>
      <div className={styles.calWeekScroll}>
        <div className={styles.calWeekGrid}>
          {days.map((day) => {
            const key = ymd(day);
            const items = byDay.get(key) ?? [];
            return (
              <div key={key} className={styles.calWeekDay}>
                <p className={styles.calWeekDayHead}>
                  {day.toLocaleDateString("en-US", { weekday: "short" })}{" "}
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

function startOfWeekIso(): string {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
