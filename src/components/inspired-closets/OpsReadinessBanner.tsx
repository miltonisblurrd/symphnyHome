"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./ops-payroll.module.css";

type Reminder = {
  id: string;
  job_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
};

/** Tentative installs coming up at 3 weeks, 2 weeks, 1 week, and 3 days out. */
export default function OpsReadinessBanner() {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/inspired-closets/ops/notifications");
      const payload = (await response.json()) as { ok?: boolean; notifications?: Reminder[] };
      if (!payload.ok) return;
      setReminders(
        (payload.notifications ?? []).filter((row) => row.kind.startsWith("readiness_") && !row.read_at),
      );
    } catch {
      /* banner is best-effort */
    }
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem("ic-readiness-ran") !== today) {
      sessionStorage.setItem("ic-readiness-ran", today);
      void fetch("/api/inspired-closets/ops/cron/readiness", { method: "POST" }).then(() => load());
    } else {
      void load();
    }
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function dismiss(id: string) {
    setReminders((current) => current.filter((row) => row.id !== id));
    await fetch("/api/inspired-closets/ops/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
  }

  if (reminders.length === 0) return null;

  return (
    <section className={`${styles.notice} ${styles.noticeWarn}`} aria-label="Tentative installs coming up">
      <strong>
        {reminders.length} tentative install{reminders.length === 1 ? "" : "s"} coming up
      </strong>
      <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.35rem" }}>
        {reminders.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            {row.body ? ` — ${row.body}` : ""}{" "}
            {row.job_id ? (
              <Link href={`/inspired-closets/ops/projects?id=${row.job_id}`}>Open project</Link>
            ) : null}
            {" · "}
            <button
              type="button"
              onClick={() => void dismiss(row.id)}
              style={{ appearance: "none", border: 0, background: "none", padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
