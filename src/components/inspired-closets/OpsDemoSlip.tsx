"use client";

import {
  DEMO_NOTICE,
  DEMO_SHIP_DATE,
  DEMO_SLIP_ITEMS,
  DEMO_SO,
} from "@/lib/inspired-closets-ops-receiving-demo";
import styles from "./demo-slip.module.css";

const totalQty = DEMO_SLIP_ITEMS.reduce((sum, row) => sum + row.qty, 0);

export default function OpsDemoSlip() {
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <p>
          Desktop: keep this page open. Phone: open Receiving → Scan, then point the camera at the
          big numbers. Print / Save as PDF if you want a paper copy.
        </p>
        <button type="button" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <section className={styles.slip}>
        <header className={styles.slipHead}>
          <div>
            <p className={styles.kicker}>Inspired Closets · demo packing slip</p>
            <h1>Your Custom Storage Solution</h1>
          </div>
          <div className={styles.meta}>
            <div>
              <span>Notice</span>
              <strong>{DEMO_NOTICE}</strong>
            </div>
            <div>
              <span>Ship date</span>
              <strong>{DEMO_SHIP_DATE}</strong>
            </div>
            <div>
              <span>SO</span>
              <strong>{DEMO_SO}</strong>
            </div>
            <div>
              <span>Pieces</span>
              <strong>{totalQty}</strong>
            </div>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Item #</th>
              <th>Job</th>
              <th>Description</th>
              <th>Pallet</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_SLIP_ITEMS.map((row) => (
              <tr key={`${row.item_number}-${row.container_id}`}>
                <td className={styles.mono}>{row.item_number}</td>
                <td>{row.cust_ref}</td>
                <td>{row.description}</td>
                <td className={styles.mono}>{row.container_id.slice(-4)}</td>
                <td>{row.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.labels}>
        <h2>Scan these numbers with the phone</h2>
        <p className={styles.hint}>
          Hold-to-scan reads digits in the middle band of the camera. Qty 2 means scan that number
          twice.
        </p>
        <div className={styles.grid}>
          {DEMO_SLIP_ITEMS.flatMap((row) =>
            Array.from({ length: row.qty }, (_, copy) => (
              <article key={`${row.item_number}-${copy}`} className={styles.label}>
                <p className={styles.labelJob}>{row.job_name}</p>
                <p className={styles.labelDigits}>{row.item_number}</p>
                <p className={styles.labelDesc}>{row.description}</p>
                <p className={styles.labelMeta}>
                  Pallet {row.container_id.slice(-4)} · piece {copy + 1} of {row.qty}
                </p>
              </article>
            )),
          )}
        </div>
      </section>
    </div>
  );
}
