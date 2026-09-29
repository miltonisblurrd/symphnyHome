"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ops-payroll.module.css";

type Contact = { name?: string | null; phone?: string | null; email?: string | null };

type Match = {
  id: string;
  target_type: "job" | "client" | "lead";
  target_id: string;
  matched_fields: Record<string, string>;
  mismatched_fields: Record<string, string>;
  reason: string;
  target: {
    stage?: string;
    title?: string | null;
    contract_cents?: number;
    install_date?: string | null;
    workbook_ref?: string | null;
    created_at?: string;
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    ic_clients?: Contact | null;
  } | null;
};

const BADGE: Record<Match["target_type"], string> = {
  job: "Confirm to link with job",
  client: "Confirm to link with client",
  lead: "Possible duplicate lead",
};

const LINK_LABEL: Record<Match["target_type"], string> = {
  job: "Link",
  client: "Link",
  lead: "Mark this lead duplicate",
};

function fieldList(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([field, value]) => `${field.replace(/_/g, " ")}: ${value}`)
    .join(" · ");
}

function targetSummary(match: Match): { title: string; lines: string[] } {
  const t = match.target;
  if (!t) return { title: "Record no longer available", lines: [] };
  const person = t.ic_clients ?? t;
  const contact = [person.phone, person.email, t.address].filter(Boolean).join(" · ");
  const lines = [contact || "No phone, email, or address on file"];
  if (match.target_type === "job") {
    const money = t.contract_cents ? `$${(t.contract_cents / 100).toLocaleString("en-US")}` : null;
    lines.push(
      [t.stage?.replace(/_/g, " "), money, t.install_date ? `install ${t.install_date}` : null]
        .filter(Boolean)
        .join(" · "),
    );
  } else if (match.target_type === "lead") {
    lines.push([t.stage?.replace(/_/g, " "), t.created_at ? `created ${t.created_at.slice(0, 10)}` : null].filter(Boolean).join(" · "));
  }
  const title =
    match.target_type === "job"
      ? `${person.name ?? "Job"}${t.title ? ` — ${t.title}` : ""}`
      : person.name ?? "Record";
  return { title, lines };
}

export function useLeadMatches(leadId: string | null) {
  const [matches, setMatches] = useState<Match[]>([]);
  const load = useCallback(async () => {
    if (!leadId) {
      setMatches([]);
      return;
    }
    const response = await fetch(`/api/inspired-closets/ops/lead-matches?lead_id=${leadId}`);
    const payload = (await response.json()) as { ok: boolean; matches?: Match[] };
    setMatches(payload.ok ? payload.matches ?? [] : []);
  }, [leadId]);
  useEffect(() => {
    void load();
  }, [load]);
  return { matches, reload: load };
}

export default function OpsLeadMatchReview({
  leadId,
  onResolved,
}: {
  leadId: string;
  onResolved?: () => void;
}) {
  const { matches, reload } = useLeadMatches(leadId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, action: "link" | "keep_separate") {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/lead-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not save.");
      await reload();
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusyId(null);
    }
  }

  if (!matches.length) return null;

  return (
    <div className={styles.mergeReview} style={{ margin: "0 0 0.85rem" }}>
      <div className={styles.mergeReviewHead}>
        <span className={styles.mergeBadge}>Needs confirmation</span>
        <p className={styles.mergeReviewWhy}>
          {matches.length === 1 ? "1 record partly matches this lead" : `${matches.length} records partly match this lead`}
        </p>
      </div>
      <p className={styles.mergeReviewCopy}>
        The OS did not connect these on its own because not enough info lines up. Link them if they are the
        same person or project, or keep them separate.
      </p>
      {error ? <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p> : null}
      <div className={styles.mergeReviewList}>
        {matches.map((match) => {
          const summary = targetSummary(match);
          const matched = fieldList(match.matched_fields);
          const mismatched = fieldList(match.mismatched_fields);
          return (
            <div key={match.id} className={styles.mergeReviewCard}>
              <span className={styles.mergeBadge} style={{ marginLeft: 0 }}>
                {BADGE[match.target_type]}
              </span>
              <strong>{summary.title}</strong>
              {summary.lines.map((line) => (line ? <span key={line}>{line}</span> : null))}
              <span>
                <strong>Matches:</strong> {matched || "—"}
              </span>
              <span>
                <strong>Doesn&apos;t match / missing:</strong> {mismatched || "—"}
              </span>
              <span className={styles.mergeReviewWhy}>{match.reason}</span>
              <div className={styles.formActions} style={{ margin: "0.35rem 0 0" }}>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  disabled={busyId === match.id}
                  onClick={() => void resolve(match.id, "link")}
                >
                  {LINK_LABEL[match.target_type]}
                </button>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  disabled={busyId === match.id}
                  onClick={() => void resolve(match.id, "keep_separate")}
                >
                  Keep separate
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
