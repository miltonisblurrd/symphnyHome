"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import payroll from "./ops-payroll.module.css";

type DocKind = "stow_sales_order" | "packing_slip" | "product_summary";

type Doc = {
  id: string;
  kind: DocKind;
  title: string;
  filename: string | null;
  soNumber: string | null;
  jobId: string | null;
  jobName: string | null;
  status: string;
  itemCount: number | null;
  createdAt: string;
  publicUrl: string | null;
  href: string;
};

type JobOption = {
  id: string;
  client: { name: string } | null;
  stage: string;
};

function whenLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function kindLabel(kind: DocKind): string {
  if (kind === "stow_sales_order") return "Stow sales order";
  if (kind === "packing_slip") return "Packaging slip";
  return "Studio order";
}

function statusLabel(kind: DocKind, status: string): string {
  if (kind === "stow_sales_order") {
    if (status === "unmatched") return "Needs a job";
    if (status === "attached") return "On a job";
    if (status === "error") return "Could not read";
    if (status === "ignored") return "Ignored";
  }
  if (kind === "packing_slip") {
    if (status === "complete") return "Received";
    if (status === "in_progress") return "Receiving";
    if (status === "parsing") return "Reading";
    return "Ready to scan";
  }
  if (status === "confirmed") return "Confirmed";
  if (status === "review") return "Needs confirm";
  return status;
}

function sourceLabel(kind: DocKind): string {
  if (kind === "stow_sales_order") return "Gmail → OS";
  return "Frank uploaded";
}

export default function OpsReceivingDocuments({
  refreshToken = 0,
  onCount,
}: {
  refreshToken?: number;
  onCount?: (count: number) => void;
}) {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"all" | DocKind>("all");
  const [query, setQuery] = useState("");
  const [attach, setAttach] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, jobsRes] = await Promise.all([
        fetch("/api/inspired-closets/ops/inventory/documents"),
        fetch("/api/inspired-closets/ops/jobs"),
      ]);
      const docsPayload = (await docsRes.json()) as {
        ok?: boolean;
        documents?: Doc[];
        error?: string;
      };
      const jobsPayload = (await jobsRes.json()) as {
        ok?: boolean;
        jobs?: JobOption[];
      };
      if (!docsPayload.ok) throw new Error(docsPayload.error ?? "Could not load documents.");
      const rows = docsPayload.documents ?? [];
      setDocuments(rows);
      onCount?.(rows.length);
      if (jobsPayload.ok) {
        setJobs(
          (jobsPayload.jobs ?? []).filter((job) => !["closed", "cancelled"].includes(job.stage)),
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const counts = useMemo(
    () => ({
      all: documents.length,
      stow_sales_order: documents.filter((doc) => doc.kind === "stow_sales_order").length,
      packing_slip: documents.filter((doc) => doc.kind === "packing_slip").length,
      product_summary: documents.filter((doc) => doc.kind === "product_summary").length,
    }),
    [documents],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (kind !== "all" && doc.kind !== kind) return false;
      if (!q) return true;
      const hay = `${doc.title} ${doc.filename ?? ""} ${doc.soNumber ?? ""} ${doc.jobName ?? ""} ${kindLabel(doc.kind)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [documents, kind, query]);

  async function attachSalesOrder(orderId: string) {
    const jobId = attach[orderId];
    if (!jobId) return;
    setBusyId(orderId);
    try {
      const response = await fetch("/api/inspired-closets/ops/stow-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, job_id: jobId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not attach sales order.");
      const jobName = jobs.find((job) => job.id === jobId)?.client?.name ?? null;
      setDocuments((rows) =>
        rows.map((row) =>
          row.kind === "stow_sales_order" && row.id === orderId
            ? {
                ...row,
                status: "attached",
                jobId,
                jobName,
                href: `/inspired-closets/ops/projects?id=${jobId}`,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach sales order.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className={payroll.summaryRow}>
        <span>
          <span className={payroll.summaryStrong}>{counts.stow_sales_order}</span> Stow sales orders
        </span>
        <span>
          <span className={payroll.summaryStrong}>{counts.packing_slip}</span> packaging slips
        </span>
        <span>
          <span className={payroll.summaryStrong}>{counts.product_summary}</span> Studio orders
        </span>
      </div>
      <label className={payroll.field} style={{ marginBottom: "0.65rem", maxWidth: "28rem" }}>
        <span className={payroll.fieldLabel}>Find a document</span>
        <input
          className={payroll.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="SO number, job, filename"
        />
      </label>
      <div className={payroll.filterChips}>
        {(
          [
            ["all", `All (${counts.all})`],
            ["stow_sales_order", `Stow sales orders (${counts.stow_sales_order})`],
            ["packing_slip", `Packaging slips (${counts.packing_slip})`],
            ["product_summary", `Studio orders (${counts.product_summary})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${payroll.chip} ${kind === id ? payroll.chipOn : ""}`}
            onClick={() => setKind(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <p className={payroll.notice}>{error}</p> : null}
      {loading && documents.length === 0 ? (
        <p className={payroll.empty}>Loading documents…</p>
      ) : visible.length === 0 ? (
        <p className={payroll.empty}>
          {query.trim() || kind !== "all"
            ? "No documents match that filter."
            : "Nothing in yet. Stow sales orders land from Gmail. Frank uploads the packaging slip and Studio order here."}
        </p>
      ) : (
        <table className={`${payroll.table} ${payroll.docsTable}`}>
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Document</th>
              <th>Job</th>
              <th>Status</th>
              <th>Lines</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((doc) => (
              <tr key={`${doc.kind}-${doc.id}`}>
                <td>{whenLabel(doc.createdAt)}</td>
                <td>
                  <div>{kindLabel(doc.kind)}</div>
                  <div className={payroll.empty} style={{ margin: 0 }}>
                    {sourceLabel(doc.kind)}
                  </div>
                </td>
                <td>
                  <strong>{doc.title}</strong>
                  <div className={payroll.empty} style={{ margin: 0 }}>
                    {[doc.soNumber ? `SO ${doc.soNumber}` : null, doc.filename]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </td>
                <td style={{ whiteSpace: "normal", minWidth: "12rem" }}>
                  {doc.jobId ? (
                    <Link href={doc.href}>{doc.jobName ?? "Open job"}</Link>
                  ) : doc.kind === "stow_sales_order" && doc.status === "unmatched" ? (
                    <span style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      <select
                        className={payroll.input}
                        value={attach[doc.id] ?? ""}
                        onChange={(event) =>
                          setAttach((current) => ({ ...current, [doc.id]: event.target.value }))
                        }
                      >
                        <option value="">Choose job…</option>
                        {jobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.client?.name ?? "Job"} · {job.stage}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={payroll.buttonGhost}
                        disabled={!attach[doc.id] || busyId === doc.id}
                        onClick={() => void attachSalesOrder(doc.id)}
                      >
                        {busyId === doc.id ? "Saving…" : "Attach"}
                      </button>
                    </span>
                  ) : (
                    doc.jobName ?? "—"
                  )}
                </td>
                <td>
                  <span
                    className={`${payroll.statusBadge} ${
                      doc.status === "unmatched" || doc.status === "error" || doc.status === "review"
                        ? payroll.statusHeld
                        : doc.status === "attached" ||
                            doc.status === "confirmed" ||
                            doc.status === "complete"
                          ? payroll.statusPaid
                          : payroll.statusOpen
                    }`}
                  >
                    {statusLabel(doc.kind, doc.status)}
                  </span>
                </td>
                <td>{doc.itemCount ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link href={doc.href} target={doc.href.startsWith("http") ? "_blank" : undefined}>
                    {doc.href.includes("/receiving/")
                      ? "Receiving"
                      : doc.kind === "product_summary"
                        ? "PDF"
                        : "Job"}
                  </Link>
                  {doc.publicUrl ? (
                    <>
                      {" · "}
                      <a href={doc.publicUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

