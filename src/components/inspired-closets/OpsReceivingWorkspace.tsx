"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  by_job?: Array<{ job_name: string; total_qty: number; total_received_qty: number }>;
};

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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [missing, setMissing] = useState<
    Array<{ shipment: { id: string; notice: string | null }; items: Array<{ job_name: string | null; item_number: string; qty: number; received_qty: number }> }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
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
      const miss = await fetch("/api/inspired-closets/ops/receiving/missing");
      const missPayload = (await miss.json()) as {
        ok?: boolean;
        shipments?: typeof missing;
      };
      if (missPayload.ok) setMissing(missPayload.shipments ?? []);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load shipments.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFile(file: File) {
    setUploading(true);
    setNotice(null);
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text) as Record<string, unknown> | Array<Record<string, unknown>>;
        const items = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as { items?: unknown }).items)
            ? ((parsed as { items: Array<Record<string, unknown>> }).items)
            : [];
        const body = {
          notice:
            !Array.isArray(parsed) && typeof parsed.shipment_notice === "string"
              ? parsed.shipment_notice
              : !Array.isArray(parsed) && typeof parsed.notice === "string"
                ? parsed.notice
                : file.name.replace(/\.[^.]+$/, ""),
          ship_date:
            !Array.isArray(parsed) && typeof parsed.ship_date === "string"
              ? parsed.ship_date
              : null,
          vendor:
            !Array.isArray(parsed) && typeof parsed.vendor === "string" ? parsed.vendor : "stow",
          items,
        };
        const response = await fetch("/api/inspired-closets/ops/receiving/shipments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as { ok: boolean; error?: string; imported?: number };
        if (!payload.ok) throw new Error(payload.error ?? "Import failed.");
        setNotice({ kind: "info", text: `Imported ${payload.imported ?? 0} lines from JSON.` });
      } else {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/inspired-closets/ops/receiving/shipments", {
          method: "POST",
          body: form,
        });
        const payload = (await response.json()) as { ok: boolean; error?: string; imported?: number };
        if (!payload.ok) throw new Error(payload.error ?? "Parse failed.");
        setNotice({
          kind: "info",
          text: `Read ${payload.imported ?? 0} lines from the packing slip.`,
        });
      }
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <OpsShell
      title="Receiving"
      subtitle="Upload the packing slip, scan labels, write stock and job % into the OS"
      actions={
        <button type="button" className={payroll.buttonGhost} onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
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
          <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>New truck</h2>
          <p className={payroll.empty} style={{ marginTop: 0 }}>
            Use the original Stow PDF (the one on the shipment email), not a photo. Harbor / no-barcode
            lines can be added by hand on the shipment after upload.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf,image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file);
            }}
          />
          <input
            ref={jsonRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file);
            }}
          />
          <div className={payroll.formActions}>
            <button
              type="button"
              className={payroll.buttonPrimary}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Reading slip…" : "Upload packing slip PDF"}
            </button>
            <button
              type="button"
              className={payroll.buttonGhost}
              disabled={uploading}
              onClick={() => jsonRef.current?.click()}
            >
              Import parsed JSON
            </button>
          </div>
        </section>

        {missing.length > 0 ? (
          <section className={payroll.panel} style={{ marginBottom: "1rem" }}>
            <p className={payroll.fieldLabel}>Still short on old trucks</p>
            {missing.slice(0, 6).map((group) => (
              <p key={group.shipment.id} style={{ margin: "0.35rem 0", fontSize: "0.85rem" }}>
                <Link href={`/inspired-closets/ops/inventory/receiving/${group.shipment.id}`}>
                  {group.shipment.notice ?? "Shipment"}
                </Link>
                {" · "}
                {group.items.length} lines
                {group.items[0]?.job_name ? ` · ${group.items[0].job_name}` : ""}
              </p>
            ))}
          </section>
        ) : null}

        <section className={payroll.panel}>
          {loading ? (
            <p className={payroll.empty}>Loading shipments…</p>
          ) : shipments.length === 0 ? (
            <p className={payroll.empty}>No trucks in the OS yet. Upload a packing slip to start.</p>
          ) : (
            <table className={payroll.table}>
              <thead>
                <tr>
                  <th>Notice</th>
                  <th>Ship date</th>
                  <th>Progress</th>
                  <th>Jobs</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shipments.map((ship) => {
                  const pct = ship.pct ?? 0;
                  return (
                    <tr key={ship.id}>
                      <td>
                        <strong>{ship.notice ?? "—"}</strong>
                        <div className={styles.vendor}>{ship.vendor}</div>
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
                      <td style={{ fontSize: "0.8rem" }}>
                        {(ship.by_job ?? [])
                          .slice(0, 4)
                          .map((job) => job.job_name)
                          .join(", ") || "—"}
                      </td>
                      <td>
                        <span className={`${styles.pill} ${statusClass(ship.status)}`}>
                          {statusLabel(ship.status)}
                        </span>
                        {ship.parse_error ? (
                          <div className={styles.vendor} style={{ color: "#821f2d" }}>
                            parse issue
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
      </div>
    </OpsShell>
  );
}
