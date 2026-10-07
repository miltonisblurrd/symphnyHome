"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./warehouse.module.css";

type QueueJob = {
  id: string;
  client_name: string;
  title: string | null;
  install_date: string | null;
  installer_name: string | null;
  scan_received: number;
  scan_total: number;
  kit_progress: string;
  kit_label: string;
  line_count: number;
  marked_count: number;
  just_scanned: boolean;
};

function formatInstall(value: string | null): string {
  if (!value) return "No install date";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function badgeClass(progress: string): string {
  if (progress === "ready") return styles.badgeReady;
  if (progress === "hold" || progress === "no_summary") return progress === "hold" ? styles.badgeHold : styles.badgeMissing;
  if (progress === "gathering") return styles.badgeGather;
  return "";
}

export default function OpsWarehouseQueue() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/inspired-closets/ops/warehouse/queue");
        const payload = (await response.json()) as {
          ok?: boolean;
          jobs?: QueueJob[];
          error?: string;
          hint?: string;
        };
        if (!payload.ok) {
          setError([payload.error, payload.hint].filter(Boolean).join(" "));
          return;
        }
        setJobs(payload.jobs ?? []);
      } catch {
        setError("Could not load the staging queue.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) => {
      const hay = [job.client_name, job.title, job.installer_name].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [jobs, query]);

  return (
    <OpsShell
      title="Kitting"
      subtitle="Installs coming up, and jobs you just scanned."
    >
      <div className={styles.stack}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search client name"
          aria-label="Search client name"
        />
        {error ? <p className={styles.notice}>{error}</p> : null}
        {loading ? <p className={styles.meta}>Loading jobs…</p> : null}
        {!loading && !error && visible.length === 0 ? (
          <p className={styles.meta}>
            {query.trim()
              ? "No job matches that client."
              : "No installs in the next three weeks, and nothing just scanned."}
          </p>
        ) : null}
        {visible.map((job) => (
          <Link key={job.id} href={`/ops/warehouse/${job.id}`} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <p className={styles.client}>{job.client_name}</p>
                {job.title ? <p className={styles.title}>{job.title}</p> : null}
              </div>
              <span className={`${styles.badge} ${badgeClass(job.kit_progress)}`}>{job.kit_label}</span>
            </div>
            <p className={styles.meta}>
              {formatInstall(job.install_date)}
              {job.installer_name ? ` · ${job.installer_name}` : " · No installer yet"}
            </p>
            <p className={styles.meta}>
              {job.scan_total > 0
                ? `${job.scan_received}/${job.scan_total} scanned`
                : "No scan yet"}
              {job.line_count > 0 ? ` · ${job.marked_count}/${job.line_count} marked` : ""}
              {job.just_scanned ? " · Just scanned" : ""}
            </p>
          </Link>
        ))}
      </div>
    </OpsShell>
  );
}
