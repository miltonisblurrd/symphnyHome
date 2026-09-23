"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import OpsReceivingDocuments from "@/components/inspired-closets/OpsReceivingDocuments";
import OpsShell from "@/components/inspired-closets/OpsShell";
import { existingRowFlags, overlapSummary } from "@/lib/inspired-closets-ops-shipment-display";
import payroll from "./ops-payroll.module.css";
import styles from "./receiving.module.css";

type Shipment = {
  id: string;
  notice: string | null;
  ship_date: string | null;
  vendor: string;
  status: string;
  source_filename: string | null;
  parse_error: string | null;
  total_qty?: number;
  total_received_qty?: number;
  pct?: number;
  so_numbers?: string[];
  by_job?: Array<{ job_name: string; total_qty: number; total_received_qty: number }>;
  parse_quality?: Record<string, unknown> | null;
};

function isStudioList(notice: string | null): boolean {
  return Boolean(notice?.startsWith("STUDIO-") || notice?.startsWith("DROP-"));
}

/** Slip labels that look like a person/job — not a PDF disclaimer paragraph. */
function isPlausibleJobLabel(name: string | null | undefined): boolean {
  const value = (name ?? "").replace(/\s+/g, " ").trim();
  if (!value || value === "Unassigned") return false;
  if (value.length > 40) return false;
  if (value.split(/\s+/).length > 6) return false;
  if (
    /\b(due to|tariff|prices may|purchase order|trade polic|supply chain|quote or)\b/i.test(
      value,
    )
  ) {
    return false;
  }
  return true;
}

function shipmentKind(ship: Shipment): string {
  if (isStudioList(ship.notice)) {
    return ship.vendor === "other" ? "Studio order · Stow + 3rd party" : "Studio order";
  }
  const vendor = (ship.vendor ?? "").toLowerCase();
  if (vendor === "hafele") return "Häfele";
  if (vendor === "richelieu") return "Richelieu";
  if (vendor === "other") return "Stow + 3rd party";
  return "Packaging slip";
}

function shipmentJobs(ship: Shipment): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const job of ship.by_job ?? []) {
    const name = (job.job_name ?? "").replace(/\s+/g, " ").trim();
    if (!isPlausibleJobLabel(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function shipmentTitle(ship: Shipment): string {
  const jobs = shipmentJobs(ship);
  if (jobs.length === 1) return jobs[0]!;
  if (jobs.length === 2) return jobs.join(", ");
  if (jobs.length > 2) return `${jobs.slice(0, 2).join(", ")} +${jobs.length - 2}`;
  if (isStudioList(ship.notice)) {
    return (ship.notice ?? "").replace(/^(STUDIO|DROP)-/, "");
  }
  if (ship.notice && /^\d{6,}$/.test(ship.notice)) return ship.notice;
  if (ship.source_filename) return ship.source_filename.replace(/\.[^.]+$/, "");
  return "No job yet";
}

function shipmentMeta(ship: Shipment): string {
  const bits = [shipmentKind(ship)];
  const title = shipmentTitle(ship);
  const notice = (ship.notice ?? "").trim();
  if (
    notice &&
    !isStudioList(notice) &&
    notice !== title &&
    isPlausibleJobLabel(notice) &&
    !/slatwall/i.test(notice)
  ) {
    bits.push(notice);
  }
  const so = (ship.so_numbers ?? []).filter((value) => value && !bits.includes(`SO ${value}`));
  if (so[0]) bits.push(`SO ${so[0]}`);
  if (so.length > 1) bits.push(`+${so.length - 1} SO`);
  return bits.join(" · ");
}

function statusClass(status: string) {
  if (status === "complete") return styles.pillDone;
  if (status === "in_progress") return styles.pillProgress;
  if (status === "parsing") return styles.pillWarn;
  return styles.pillReady;
}

function statusLabel(status: string) {
  if (status === "complete") return "All received";
  if (status === "in_progress") return "Receiving";
  if (status === "parsing") return "Reading slip";
  return "Ready";
}

export default function OpsReceivingWorkspace() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState<"slip" | "summary" | false>(false);
  const [docsTick, setDocsTick] = useState(0);
  const [lastTruck, setLastTruck] = useState("");
  const slipRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/receiving/shipments");
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        hint?: string;
        shipments?: Shipment[];
      };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load shipments.");
      setShipments(payload.shipments ?? []);
      setHint(payload.hint ?? null);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load shipments.",
      });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLastTruck(localStorage.getItem("ic-receiving-last") ?? "");
    void load();
    const timer = window.setInterval(() => {
      void load({ silent: true });
      setDocsTick((n) => n + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function uploadFile(file: File, kind: "packing_list" | "studio_order") {
    setUploading(kind === "studio_order" ? "summary" : "slip");
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const response = await fetch("/api/inspired-closets/ops/receiving/shipments", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        imported?: number;
        kind?: "studio_order" | "packing_list";
        message?: string;
      };
      if (!payload.ok) throw new Error(payload.error ?? "Parse failed.");
      setNotice({
        kind: "info",
        text:
          payload.message ??
          (kind === "studio_order"
            ? `Project summary: ${payload.imported ?? 0} lines saved.`
            : `Packing slip: ${payload.imported ?? 0} lines saved.`),
      });
      await load();
      setDocsTick((n) => n + 1);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
    }
  }

  const orderedShipments = useMemo(() => {
    return [...shipments].sort((a, b) => {
      const aDone = a.status === "complete" || (a.pct ?? 0) >= 100;
      const bDone = b.status === "complete" || (b.pct ?? 0) >= 100;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (a.pct ?? 0) - (b.pct ?? 0);
    });
  }, [shipments]);

  return (
    <OpsShell
      title="Receiving"
      subtitle="Packaging slips for Bryant to scan. Project summaries go to their own tab. Sales orders come from Gmail."
      actions={
        <>
          <input
            ref={slipRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file, "packing_list");
            }}
          />
          <input
            ref={summaryRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file, "studio_order");
            }}
          />
          <button
            type="button"
            className={payroll.buttonPrimary}
            disabled={Boolean(uploading)}
            onClick={() => slipRef.current?.click()}
          >
            {uploading === "slip" ? "Reading slip…" : "Upload packaging slip"}
          </button>
          <button
            type="button"
            className={payroll.buttonPrimary}
            disabled={Boolean(uploading)}
            onClick={() => summaryRef.current?.click()}
          >
            {uploading === "summary" ? "Reading summary…" : "Upload project summary"}
          </button>
        </>
      }
    >
      <div className={styles.wrap}>
        {notice ? (
          <p className={`${payroll.notice} ${notice.kind === "error" ? payroll.noticeError : ""}`}>
            {notice.text}
          </p>
        ) : null}
        {hint ? <p className={payroll.notice}>{hint}</p> : null}

        {lastTruck ? (
          <p style={{ marginBottom: "0.75rem" }}>
            <Link href={`/inspired-closets/ops/inventory/receiving/${lastTruck}/scan`} className={payroll.buttonPrimary}>
              Resume last truck
            </Link>
          </p>
        ) : null}
        <section className={`${payroll.panel} ${styles.shipPanel}`} style={{ marginBottom: "1rem" }}>
          {loading ? (
            <p className={payroll.empty}>Loading shipments…</p>
          ) : shipments.length === 0 ? (
            <p className={payroll.empty}>
              No trucks yet. Upload a packaging slip for Bryant to scan.
            </p>
          ) : (
            <table className={`${payroll.table} ${styles.shipTable}`}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Ship date</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orderedShipments.map((ship) => {
                  const pct = ship.pct ?? 0;
                  const overlap = overlapSummary(existingRowFlags(ship.parse_quality));
                  return (
                    <tr key={ship.id}>
                      <td className={styles.orderCell}>
                        <strong className={styles.orderTitle} title={shipmentJobs(ship).join(", ") || undefined}>
                          {shipmentTitle(ship)}
                        </strong>
                        <div className={styles.vendor}>{shipmentMeta(ship)}</div>
                        {overlap ? <div className={styles.overlap}>{overlap}</div> : null}
                      </td>
                      <td>{ship.ship_date ?? "—"}</td>
                      <td style={{ minWidth: "10rem" }}>
                        <div className={`${styles.bar} ${pct >= 100 ? styles.barOk : ""}`}>
                          <div className={styles.barFill} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <div style={{ fontSize: "0.78rem", marginTop: "0.2rem" }}>
                          {ship.total_received_qty ?? 0} / {ship.total_qty ?? 0} · {pct}%
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.pill} ${statusClass(ship.status)}`}>
                          {statusLabel(ship.status)}
                        </span>
                        {ship.parse_error ? (
                          <div className={styles.vendor} style={{ color: "#821f2d" }}>
                            Could not read this PDF
                          </div>
                        ) : null}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <Link
                          href={`/inspired-closets/ops/inventory/receiving/${ship.id}/scan`}
                          className={payroll.buttonPrimary}
                          style={{ marginRight: "0.35rem", display: "inline-block" }}
                        >
                          Scan
                        </Link>
                        <Link
                          href={`/inspired-closets/ops/inventory/receiving/${ship.id}`}
                          className={payroll.buttonGhost}
                          style={{ display: "inline-block" }}
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <OpsReceivingDocuments refreshToken={docsTick} />
      </div>
    </OpsShell>
  );
}
