"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./ops-shell.module.css";

type Note = {
  id: string;
  job_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  severity: string;
  created_at: string;
  read_at: string | null;
};

export default function OpsNotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const unread = notes.filter((row) => !row.read_at).length;

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/inspired-closets/ops/notifications");
      const payload = (await response.json()) as { ok?: boolean; notifications?: Note[] };
      if (payload.ok) setNotes(payload.notifications ?? []);
    } catch {
      /* bell is best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const today = new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem("ic-readiness-ran") !== today) {
      sessionStorage.setItem("ic-readiness-ran", today);
      void fetch("/api/inspired-closets/ops/cron/readiness", { method: "POST" }).then(() => load());
    }
    return () => window.clearInterval(timer);
  }, [load]);

  async function markRead(id: string, jobId: string | null) {
    await fetch("/api/inspired-closets/ops/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    setNotes((current) => current.map((row) => (row.id === id ? { ...row, read_at: new Date().toISOString() } : row)));
    setOpen(false);
    if (jobId) router.push(`/inspired-closets/ops/projects?id=${jobId}`);
  }

  async function markAll() {
    await fetch("/api/inspired-closets/ops/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all_read: true }),
    });
    setNotes((current) => current.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })));
  }

  return (
    <div className={styles.bellWrap}>
      <button
        type="button"
        className={styles.bellBtn}
        aria-label={unread ? `${unread} unread job looks` : "Job looks"}
        onClick={() => setOpen((value) => !value)}
      >
        {unread > 0 ? <span className={styles.bellCount}>{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div className={styles.bellPanel} role="dialog" aria-label="Job looks">
          <div className={styles.bellHead}>
            <p>Looks</p>
            {notes.length > 0 ? (
              <button type="button" onClick={() => void markAll()}>
                Mark all read
              </button>
            ) : null}
          </div>
          {notes.length === 0 ? (
            <p className={styles.bellEmpty}>Nothing to look at right now.</p>
          ) : (
            <ul className={styles.bellList}>
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    className={note.read_at ? styles.bellItem : styles.bellItemUnread}
                    onClick={() => void markRead(note.id, note.job_id)}
                  >
                    <strong>{note.title}</strong>
                    {note.body ? <span>{note.body}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
