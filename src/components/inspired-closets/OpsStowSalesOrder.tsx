"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ops-payroll.module.css";

type CheckLine = {
  item_code: string;
  description: string | null;
  so_qty: number;
  summary_qty: number;
  slip_qty: number;
  result: "match" | "missing" | "extra" | "qty";
};

type Check = {
  waiting: boolean;
  lines: CheckLine[];
  missing: number;
  extra: number;
  qty: number;
  matched: number;
};

type SalesOrder = {
  id: string;
  so_number: string | null;
  order_name: string | null;
  source_filename: string | null;
  public_url: string | null;
  item_count: number;
  status: string;
  check: Check;
};

function resultLabel(result: CheckLine["result"]): string {
  if (result === "missing") return "Missing from Frank";
  if (result === "extra") return "Extra — not on Stow SO";
  if (result === "qty") return "Qty differs";
  return "Match";
}

export default function OpsStowSalesOrder({ jobId }: { jobId: string }) {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/inspired-closets/ops/stow-orders?jobId=${jobId}`);
    const payload = (await response.json()) as {
      ok?: boolean;
      orders?: SalesOrder[];
      hint?: string;
      error?: string;
    };
    if (!payload.ok) throw new Error(payload.error ?? "Could not load sales orders.");
    setOrders(payload.orders ?? []);
    setHint(payload.hint ?? null);
  }, [jobId]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "Could not load sales orders.");
    });
  }, [load]);

  const open = orders[0] ?? null;

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p className={styles.fieldLabel}>Stow sales order</p>
      <p className={styles.empty} style={{ marginTop: 0 }}>
        Stow confirmation from Gmail. Frank uploads the Studio PDF and the packing list in Receiving.
        This is the check — missing pieces or extras Stow is charging.
      </p>
      {hint ? <p className={styles.empty}>{hint}</p> : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}

      {!open ? (
        <p className={styles.empty}>No Stow sales order on this job yet.</p>
      ) : (
        <>
          <p className={styles.leadContact} style={{ marginBottom: "0.75rem" }}>
            {[
              open.so_number ? `SO ${open.so_number}` : null,
              open.order_name,
              `${open.item_count} lines`,
            ]
              .filter(Boolean)
              .join(" · ")}
            {open.public_url ? (
              <>
                {" · "}
                <a href={open.public_url} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              </>
            ) : null}
          </p>

          {open.check.waiting ? (
            <p className={styles.empty}>
              Sales order is on the job. Waiting on Frank&apos;s Studio PDF or packing list in
              Receiving to compare.
            </p>
          ) : (
            <>
              <p className={styles.empty} style={{ marginTop: 0 }}>
                {open.check.missing} missing · {open.check.extra} extra · {open.check.qty} qty ·{" "}
                {open.check.matched} match
              </p>
              <table className={styles.table} style={{ minWidth: "40rem" }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Stow SO</th>
                    <th>Summary</th>
                    <th>Slip</th>
                    <th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {open.check.lines
                    .filter((line) => line.result !== "match")
                    .concat(open.check.lines.filter((line) => line.result === "match"))
                    .map((line) => (
                      <tr key={line.item_code + line.result}>
                        <td>
                          <strong>{line.item_code}</strong>
                          {line.description ? ` · ${line.description}` : ""}
                        </td>
                        <td>{line.so_qty || "—"}</td>
                        <td>{line.summary_qty || "—"}</td>
                        <td>{line.slip_qty || "—"}</td>
                        <td>{resultLabel(line.result)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
