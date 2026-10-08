"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./warehouse.module.css";

type TodoKind = "scan" | "kit" | "delivery" | "soon";

type TodoRow = {
  id: string;
  client_name: string;
  title: string | null;
  install_date: string | null;
  installer_name: string | null;
  headline: string;
  actions: Array<{ kind: TodoKind; label: string; href: string }>;
};

const FILTERS: Array<{ id: "all" | TodoKind; label: string }> = [
  { id: "all", label: "All" },
  { id: "scan", label: "Scan" },
  { id: "kit", label: "Kit" },
  { id: "delivery", label: "Delivery" },
  { id: "soon", label: "Coming soon" },
];

const ACTION_CLASS: Record<TodoKind, string> = {
  scan: styles.todoScan,
  kit: styles.todoKit,
  delivery: styles.todoDelivery,
  soon: styles.todoSoon,
};

export default function OpsWarehouseTodo() {
  const [rows, setRows] = useState<TodoRow[]>([]);
  const [filter, setFilter] = useState<"all" | TodoKind>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/inspired-closets/ops/warehouse/todo");
        const payload = (await response.json()) as { ok?: boolean; rows?: TodoRow[]; error?: string; hint?: string };
        if (!payload.ok) {
          setError([payload.error, payload.hint].filter(Boolean).join(" "));
          return;
        }
        setRows(payload.rows ?? []);
      } catch {
        setError("Could not load the to do list.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: rows.length };
    for (const row of rows) for (const action of row.actions) out[action.kind] = (out[action.kind] ?? 0) + 1;
    return out;
  }, [rows]);

  const visible = filter === "all" ? rows : rows.filter((row) => row.actions.some((action) => action.kind === filter));

  return (
    <OpsShell title="To do" subtitle="What to scan, kit, and expect, most urgent first.">
      <div className={styles.stack}>
        <div className={styles.todoFilters} role="tablist" aria-label="Filter to dos">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={`${styles.todoFilter} ${filter === item.id ? styles.todoFilterOn : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label} <span>{counts[item.id] ?? 0}</span>
            </button>
          ))}
        </div>
        {error ? <p className={styles.notice}>{error}</p> : null}
        {loading ? <p className={styles.meta}>Loading to dos…</p> : null}
        {!loading && !error && visible.length === 0 ? (
          <p className={styles.meta}>{filter === "all" ? "Nothing to do right now." : "Nothing in this list."}</p>
        ) : null}
        {visible.map((row) => (
          <article key={row.id} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <p className={styles.client}>{row.client_name}</p>
                {row.title ? <p className={styles.title}>{row.title}</p> : null}
              </div>
              <span className={styles.meta}>{row.installer_name ?? "No installer yet"}</span>
            </div>
            <p className={styles.meta}>{row.headline}</p>
            <div className={styles.todoActions}>
              {row.actions.map((action) => (
                <Link
                  key={action.kind}
                  href={action.href}
                  className={`${styles.todoAction} ${ACTION_CLASS[action.kind]}`}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </OpsShell>
  );
}
