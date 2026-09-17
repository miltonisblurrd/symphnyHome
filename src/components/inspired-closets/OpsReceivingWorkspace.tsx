"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import OpsReceivingDocuments from "@/components/inspired-closets/OpsReceivingDocuments";
import OpsShell from "@/components/inspired-closets/OpsShell";
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
};

function isStudioList(notice: string | null): boolean {
  return Boolean(notice?.startsWith("STUDIO-") || notice?.startsWith("DROP-"));
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

function shipmentTitle(ship: Shipment): string {
  const jobs = (ship.by_job ?? [])
    .map((job) => job.job_name)
    .filter((name) => name && name !== "Unassigned");
  if (jobs.length > 0) return jobs.join(", ");
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
  if (ship.notice && !isStudioList(ship.notice) && ship.notice !== title && !/slatwall/i.test(ship.notice)) {
    bits.push(ship.notice);
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
  const [showDocs, setShowDocs] = useState(true);
  const [docCount, setDocCount] = useState(0);
  const [docsTick, setDocsTick] = useState(0);
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
            ? `Studio summary: ${payload.imported ?? 0} lines saved.`
            : `Packing slip: ${payload.imported ?? 0} lines saved.`),
      });
      await load();
      setDocsTick((n) => n + 1);
      setShowDocs(true);
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
      subtitle="Two different PDFs. Packaging slip is the truck list. Studio product summary is the order table."
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
            {uploading === "summary" ? "Reading summary…" : "Upload Studio product summary"}
          </button>
          <button
            type="button"
            className={showDocs ? payroll.buttonPrimary : payroll.buttonGhost}
            onClick={() => setShowDocs((open) => !open)}
          >
            {docCount > 0 ? `Documents (${docCount})` : "Documents"}
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

        <section className={payroll.panel} style={{ marginBottom: "1rem" }}>
          {loading ? (
            <p className={payroll.empty}>Loading shipments…</p>
          ) : shipments.length === 0 ? (
            <p className={payroll.empty}>
              No trucks or Studio lists yet. Upload a packaging slip or a Studio product summary.
            </p>
          ) : (
            <table className={payroll.table}>
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
                  return (
                    <tr key={ship.id}>
                      <td>
                        <strong>{shipmentTitle(ship)}</strong>
                        <div className={styles.vendor}>{shipmentMeta(ship)}</div>
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

        {showDocs ? (
          <section className={payroll.panel}>
            <OpsReceivingDocuments refreshToken={docsTick} onCount={setDocCount} />
          </section>
        ) : null}
      </div>
    </OpsShell>
  );
}
