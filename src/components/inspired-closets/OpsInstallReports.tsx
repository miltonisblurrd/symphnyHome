"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ops-payroll.module.css";

type Report = {
  id: string;
  order_name: string | null;
  so_number: string | null;
  ship_date: string | null;
  source_filename: string | null;
  public_url: string | null;
  status: string;
  created_at: string;
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

export default function OpsInstallReports({ jobId }: { jobId: string }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/inspired-closets/ops/receiving/install-reports?jobId=${jobId}`,
    );
    const payload = (await response.json()) as {
      ok?: boolean;
      reports?: Report[];
      hint?: string;
      error?: string;
    };
    if (!payload.ok) throw new Error(payload.error ?? "Could not load install reports.");
    setReports(payload.reports ?? []);
    setHint(payload.hint ?? null);
  }, [jobId]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "Could not load install reports.");
    });
  }, [load]);

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p className={styles.fieldLabel}>Install reports</p>
      <p className={styles.empty} style={{ marginTop: 0 }}>
        Frank uploads the Studio install report in Receiving. The PDF lands here so the office can
        see what this install will use.
      </p>
      {hint ? <p className={styles.empty}>{hint}</p> : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {reports.length === 0 ? (
        <p className={styles.empty}>No install report on this job yet.</p>
      ) : (
        <table className={styles.table} style={{ minWidth: "32rem" }}>
          <thead>
            <tr>
              <th>Report</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>
                  <strong>{report.order_name ?? report.source_filename ?? "Install report"}</strong>
                  <div className={styles.empty} style={{ margin: 0 }}>
                    {[
                      report.so_number ? `SO ${report.so_number}` : null,
                      report.ship_date ? `Ship ${report.ship_date}` : null,
                      report.source_filename,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {report.public_url ? (
                      <>
                        {" · "}
                        <a href={report.public_url} target="_blank" rel="noreferrer">
                          Open PDF
                        </a>
                      </>
                    ) : null}
                  </div>
                </td>
                <td>{whenLabel(report.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
