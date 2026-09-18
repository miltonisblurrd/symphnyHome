"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./ops-payroll.module.css";

type JobShipment = {
  id: string;
  notice: string | null;
  source_filename: string | null;
  public_url: string | null;
  vendor: string;
  total_qty?: number;
  total_received_qty?: number;
  parse_quality?: {
    studio_order?: { public_url?: string | null } | null;
    packing_lists?: Array<{
      public_url?: string | null;
      source_filename?: string | null;
      notice?: string | null;
    }>;
  } | null;
};

function listKind(ship: JobShipment): string {
  if (ship.notice?.startsWith("STUDIO-") || ship.notice?.startsWith("DROP-")) {
    const packing = fileLinks(ship).some((link) => link.label.startsWith("Open packaging slip"));
    return packing ? "Studio order + packaging slip" : "Studio order";
  }
  return "Packaging slip";
}

function fileLinks(ship: JobShipment): Array<{ label: string; href: string }> {
  const quality = ship.parse_quality ?? {};
  const packing = quality.packing_lists ?? [];
  const studioHref = quality.studio_order?.public_url || (!packing.length ? ship.public_url : null);
  const links: Array<{ label: string; href: string }> = [];
  if (studioHref) links.push({ label: "Open Studio order", href: studioHref });
  for (const [index, file] of packing.entries()) {
    if (!file.public_url) continue;
    links.push({
      label: packing.length > 1 ? `Open packaging slip ${index + 1}` : "Open packaging slip",
      href: file.public_url,
    });
  }
  if (
    ship.public_url &&
    ship.public_url !== studioHref &&
    !links.some((link) => link.href === ship.public_url)
  ) {
    links.push({
      label: studioHref ? "Open packaging slip" : "Open PDF",
      href: ship.public_url,
    });
  }
  return links;
}

export default function OpsJobReceivingFiles({ jobId }: { jobId: string }) {
  const [ships, setShips] = useState<JobShipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/inspired-closets/ops/receiving/shipments?jobId=${jobId}`);
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      shipments?: JobShipment[];
    };
    if (!payload.ok) throw new Error(payload.error ?? "Could not load receiving files.");
    setShips(payload.shipments ?? []);
  }, [jobId]);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load receiving files.");
    });
  }, [load]);

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p className={styles.fieldLabel}>Receiving files</p>
      <p className={styles.empty} style={{ marginTop: 0 }}>
        Frank uploads both PDFs in Receiving. They land on this job as one scan list — Stow and
        3rd party together — and Bryant&apos;s list stays open until every piece is in.
      </p>
      {error ? <p className={styles.notice}>{error}</p> : null}
      {ships.length === 0 ? (
        <p className={styles.empty}>No Studio order or packing list on this job yet.</p>
      ) : (
        <table className={styles.table} style={{ minWidth: "32rem" }}>
          <thead>
            <tr>
              <th>File</th>
              <th>Scan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ships.map((ship) => (
              <tr key={ship.id}>
                <td>
                  <strong>{listKind(ship)}</strong>
                  <div className={styles.empty} style={{ margin: 0 }}>
                    {ship.notice ?? ship.source_filename ?? "Shipment"}
                    {fileLinks(ship).map((link) => (
                      <span key={link.href}>
                        {" · "}
                        <a href={link.href} target="_blank" rel="noreferrer">
                          {link.label}
                        </a>
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  {ship.total_received_qty ?? 0}/{ship.total_qty ?? 0}
                  {(ship.total_qty ?? 0) > 0 &&
                  (ship.total_received_qty ?? 0) >= (ship.total_qty ?? 0)
                    ? " · in"
                    : " · short"}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <Link
                    href={`/inspired-closets/ops/inventory/receiving/${ship.id}/scan`}
                    className={styles.buttonGhost}
                    style={{ display: "inline-block" }}
                  >
                    Scan
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
