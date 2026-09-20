"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney, formatShipDate } from "@/lib/inspired-closets-ops-shipment-display";
import payroll from "./ops-payroll.module.css";

type DocKind = "stow_sales_order" | "packing_slip" | "product_summary";

type Doc = {
  id: string;
  kind: DocKind;
  title: string;
  filename: string | null;
  soNumber: string | null;
  poNumber: string | null;
  jobId: string | null;
  jobName: string | null;
  status: string;
  itemCount: number | null;
  shipDate: string | null;
  orderTotal: number | null;
  weightLbs: number | null;
  vendor: string | null;
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
  if (kind === "stow_sales_order") return "Sales order";
  if (kind === "packing_slip") return "Packaging slip";
  return "Project summary";
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
  if (status === "unmatched") return "Needs a job";
  return status;
}

function sourceLabel(kind: DocKind): string {
  if (kind === "stow_sales_order") return "Gmail";
  return "Upload";
}

function needsJob(doc: Doc): boolean {
  return (
    !doc.jobId &&
    (doc.kind === "stow_sales_order" || doc.kind === "product_summary") &&
    doc.status !== "ignored"
  );
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
      const hay = [
        doc.title,
        doc.filename,
        doc.soNumber,
        doc.poNumber,
        doc.jobName,
        doc.vendor,
        kindLabel(doc.kind),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [documents, kind, query]);

  async function attachSalesOrder(orderId: string, jobId = attach[orderId]) {
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

  async function attachSummary(summaryId: string, jobId = attach[summaryId]) {
    if (!jobId) return;
    setBusyId(summaryId);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs/summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: summaryId, job_id: jobId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not attach project summary.");
      const jobName = jobs.find((job) => job.id === jobId)?.client?.name ?? null;
      setDocuments((rows) =>
        rows.map((row) =>
          row.kind === "product_summary" && row.id === summaryId
            ? {
                ...row,
                status: "review",
                jobId,
                jobName,
                href: `/inspired-closets/ops/projects?id=${jobId}`,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach project summary.");
    } finally {
      setBusyId(null);
    }
  }

  const tabs = [
    ["all", "All", counts.all],
    ["stow_sales_order", "Sales orders", counts.stow_sales_order],
    ["packing_slip", "Packaging slips", counts.packing_slip],
    ["product_summary", "Project summaries", counts.product_summary],
  ] as const;

  return (
    <div>
      <div className={payroll.listToolbar}>
        <nav className={payroll.tabs} aria-label="Document views">
          {tabs.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={`${payroll.tab} ${kind === id ? payroll.tabActive : ""}`}
              onClick={() => setKind(id)}
            >
              {label}
              {count ? <span className={payroll.tabCount}>{count}</span> : null}
            </button>
          ))}
        </nav>
        <input
          className={`${payroll.input} ${payroll.toolbarSearch}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find an SO, job, filename…"
          aria-label="Find a document"
        />
      </div>

      <div className={payroll.summaryRow}>
        <span>
          <span className={payroll.summaryStrong}>{counts.stow_sales_order}</span> sales orders
        </span>
        <span>
          <span className={payroll.summaryStrong}>{counts.packing_slip}</span> packaging slips
        </span>
        <span>
          <span className={payroll.summaryStrong}>{counts.product_summary}</span> project summaries
        </span>
      </div>

      {error ? <p className={payroll.notice}>{error}</p> : null}

      <section className={payroll.panel}>
        {loading && documents.length === 0 ? (
          <p className={payroll.empty}>Loading documents…</p>
        ) : visible.length === 0 ? (
          <p className={payroll.empty}>
            {query.trim() || kind !== "all"
              ? "No documents match that search."
              : "Nothing in yet. Sales orders land from Gmail. Frank uploads packaging slips and project summaries with the buttons above."}
          </p>
        ) : (
          <table className={`${payroll.table} ${payroll.docsTable}`}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>SO</th>
                <th>Ship date</th>
                <th>Total</th>
                <th>Lines</th>
                <th>Status</th>
                <th>Job</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((doc) => (
                <tr
                  key={`${doc.kind}-${doc.id}`}
                  className={needsJob(doc) ? payroll.rowHeld : undefined}
                >
                  <td>
                    <Link href={doc.href} target={doc.href.startsWith("http") ? "_blank" : undefined}>
                      {doc.title}
                    </Link>
                    {doc.filename ? (
                      <span className={payroll.jobTitleMark}> · {doc.filename}</span>
                    ) : null}
                    {doc.publicUrl ? (
                      <>
                        {" "}
                        <a href={doc.publicUrl} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {kindLabel(doc.kind)}
                    <span className={payroll.jobTitleMark}>
                      {" "}
                      · {doc.vendor && doc.kind === "packing_slip" ? doc.vendor : sourceLabel(doc.kind)}
                    </span>
                  </td>
                  <td>{doc.soNumber ?? "—"}</td>
                  <td>{formatShipDate(doc.shipDate) ?? "—"}</td>
                  <td>
                    {doc.orderTotal ? formatMoney(doc.orderTotal) : "—"}
                    {doc.weightLbs ? (
                      <span className={payroll.jobTitleMark}> · {doc.weightLbs} lbs</span>
                    ) : null}
                  </td>
                  <td>{doc.itemCount ?? "—"}</td>
                  <td>{statusLabel(doc.kind, doc.status)}</td>
                  <td className={payroll.docJobCell}>
                    {doc.jobId ? (
                      <Link href={doc.href}>{doc.jobName ?? "Open job"}</Link>
                    ) : needsJob(doc) ? (
                      <select
                        className={payroll.input}
                        value={attach[doc.id] ?? ""}
                        disabled={busyId === doc.id}
                        onChange={(event) => {
                          const jobId = event.target.value;
                          setAttach((current) => ({ ...current, [doc.id]: jobId }));
                          if (!jobId) return;
                          void (doc.kind === "product_summary"
                            ? attachSummary(doc.id, jobId)
                            : attachSalesOrder(doc.id, jobId));
                        }}
                      >
                        <option value="">
                          {busyId === doc.id ? "Saving…" : "Choose job…"}
                        </option>
                        {jobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.client?.name ?? "Job"} · {job.stage}
                          </option>
                        ))}
                      </select>
                    ) : (
                      doc.jobName ?? "—"
                    )}
                  </td>
                  <td>{whenLabel(doc.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
