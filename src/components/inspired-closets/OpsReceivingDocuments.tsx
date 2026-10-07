"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatMoney, formatShipDate } from "@/lib/inspired-closets-ops-shipment-display";
import payroll from "./ops-payroll.module.css";

type DocKind = "stow_sales_order" | "packing_slip" | "product_summary" | "install_report";

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
  if (kind === "install_report") return "Install report";
  return "Product summary";
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
  if (kind === "install_report") {
    if (status === "attached") return "On a job";
    if (status === "unmatched") return "Needs a job";
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
    (doc.kind === "stow_sales_order" ||
      doc.kind === "product_summary" ||
      doc.kind === "install_report") &&
    doc.status !== "ignored"
  );
}

function jobLabel(job: JobOption): string {
  return `${job.client?.name ?? "Job"} · ${job.stage}`;
}

function JobPicker({
  jobs,
  busy,
  onPick,
}: {
  jobs: JobOption[];
  busy: boolean;
  onPick: (jobId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((job) => jobLabel(job).toLowerCase().includes(q));
  }, [jobs, search]);

  useEffect(() => {
    setActive(0);
  }, [search, open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.max(rect.width, 280);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const menuHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < menuHeight && rect.top > spaceBelow
          ? Math.max(8, rect.top - menuHeight - 4)
          : rect.bottom + 4;
      setBox({ top, left, width });
    };
    place();
    inputRef.current?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [active, open, matches]);

  function pick(jobId: string) {
    setOpen(false);
    setSearch("");
    onPick(jobId);
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={payroll.jobPickBtn}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setSearch("");
          setOpen((current) => !current);
        }}
      >
        {busy ? "Saving…" : "Choose job…"}
      </button>
      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              className={payroll.jobPickMenu}
              style={{ top: box.top, left: box.left, width: box.width }}
              role="dialog"
              aria-label="Choose a job"
            >
              <input
                ref={inputRef}
                className={payroll.jobPickSearch}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((index) => Math.min(matches.length - 1, index + 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((index) => Math.max(0, index - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const job = matches[active];
                    if (job) pick(job.id);
                  }
                }}
                placeholder="Type a job name…"
                aria-label="Find a job"
              />
              <div className={payroll.jobPickList} role="listbox" aria-label="Jobs">
                {matches.length === 0 ? (
                  <p className={payroll.jobPickEmpty}>No jobs match that.</p>
                ) : (
                  matches.map((job, index) => (
                    <button
                      key={job.id}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      data-active={index === active ? "true" : undefined}
                      className={`${payroll.jobPickOption} ${index === active ? payroll.jobPickOptionActive : ""}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(job.id)}
                    >
                      {jobLabel(job)}
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
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
      install_report: documents.filter((doc) => doc.kind === "install_report").length,
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

  async function attachSalesOrder(orderId: string, jobId: string) {
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
                href: `/ops/projects?id=${jobId}`,
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

  async function attachSummary(summaryId: string, jobId: string) {
    setBusyId(summaryId);
    try {
      const response = await fetch("/api/inspired-closets/ops/jobs/summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: summaryId, job_id: jobId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not attach product summary.");
      const jobName = jobs.find((job) => job.id === jobId)?.client?.name ?? null;
      setDocuments((rows) =>
        rows.map((row) =>
          row.kind === "product_summary" && row.id === summaryId
            ? {
                ...row,
                status: "review",
                jobId,
                jobName,
                href: `/ops/projects?id=${jobId}`,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach product summary.");
    } finally {
      setBusyId(null);
    }
  }

  async function attachInstallReport(reportId: string, jobId: string) {
    setBusyId(reportId);
    try {
      const response = await fetch("/api/inspired-closets/ops/receiving/install-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reportId, job_id: jobId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not attach install report.");
      const jobName = jobs.find((job) => job.id === jobId)?.client?.name ?? null;
      setDocuments((rows) =>
        rows.map((row) =>
          row.kind === "install_report" && row.id === reportId
            ? {
                ...row,
                status: "attached",
                jobId,
                jobName,
                href: `/ops/projects?id=${jobId}`,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach install report.");
    } finally {
      setBusyId(null);
    }
  }

  const tabs = [
    ["all", "All", counts.all],
    ["stow_sales_order", "Sales orders", counts.stow_sales_order],
    ["packing_slip", "Packaging slips", counts.packing_slip],
    ["product_summary", "Product summaries", counts.product_summary],
    ["install_report", "Install reports", counts.install_report],
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
          <span className={payroll.summaryStrong}>{counts.product_summary}</span> product summaries
        </span>
        <span>
          <span className={payroll.summaryStrong}>{counts.install_report}</span> install reports
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
              : "Nothing in yet. Sales orders land from Gmail. Frank uploads packaging slips, product summaries, and install reports with the buttons above."}
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
                      <JobPicker
                        jobs={jobs}
                        busy={busyId === doc.id}
                        onPick={(jobId) => {
                          void (doc.kind === "product_summary"
                            ? attachSummary(doc.id, jobId)
                            : doc.kind === "install_report"
                              ? attachInstallReport(doc.id, jobId)
                              : attachSalesOrder(doc.id, jobId));
                        }}
                      />
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
