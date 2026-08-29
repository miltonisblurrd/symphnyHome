"use client";

import type { IcJobKind } from "@/lib/inspired-closets-ops-jobs";
import styles from "./field.module.css";

export type FieldBoardJob = {
  id: string;
  lastName: string;
  clientName: string;
  job_kind: IcJobKind;
  visit_window: string | null;
  tag: "SVC" | "G/B" | null;
  address: string | null;
  installer_id: string | null;
  mine: boolean;
};

export type FieldBoardCrew = {
  id: string;
  name: string;
  mine: boolean;
  cells: Record<string, FieldBoardJob[]>;
};

export default function FieldWeekBoard({
  days,
  installers,
  unassigned,
  onOpenMine,
}: {
  days: Array<{ key: string; dow: string; num: number }>;
  installers: FieldBoardCrew[];
  unassigned: Record<string, FieldBoardJob[]>;
  onOpenMine?: (jobId: string) => void;
}) {
  const rows: FieldBoardCrew[] = [
    ...installers,
    {
      id: "unassigned",
      name: "Unassigned",
      mine: false,
      cells: unassigned,
    },
  ];

  return (
    <div>
      <p className={styles.sectionTitle}>Your week</p>
      <div className={styles.boardLegend} aria-hidden>
        <span className={`${styles.legendDot} ${styles.chipNew}`}>New</span>
        <span className={`${styles.legendDot} ${styles.chipGoBack}`}>Go-back</span>
        <span className={`${styles.legendDot} ${styles.chipService}`}>Service</span>
      </div>
      {rows.map((person) => (
        <section
          key={person.id}
          className={`${styles.crewRow} ${person.mine ? styles.crewRowMine : ""}`}
        >
          <h3 className={styles.crewName}>
            {person.name}
            {person.mine ? " · you" : ""}
          </h3>
          <div className={styles.crewDays}>
            {days.map((day) => {
              const jobs = person.cells[day.key] ?? [];
              return (
                <div key={day.key} className={styles.crewDay}>
                  <p className={styles.crewDayHead}>
                    {day.dow} {day.num}
                  </p>
                  {jobs.length === 0 ? (
                    <p className={styles.crewEmpty}>—</p>
                  ) : (
                    jobs.map((job) => {
                      const kindClass =
                        job.job_kind === "service"
                          ? styles.chipService
                          : job.job_kind === "go_back"
                            ? styles.chipGoBack
                            : styles.chipNew;
                      const label = job.tag ? `${job.tag} ${job.lastName}` : job.lastName;
                      return (
                        <button
                          key={job.id}
                          type="button"
                          className={`${styles.boardChip} ${kindClass}`}
                          onClick={() => {
                            if (job.mine) onOpenMine?.(job.id);
                          }}
                        >
                          <strong>{label}</strong>
                          {job.visit_window ? <span>{job.visit_window}</span> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
