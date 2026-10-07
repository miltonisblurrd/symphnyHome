"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./warehouse.module.css";

type GatherStatus = "unset" | "in_pile" | "on_truck" | "problem";

type KitLine = {
  id: string;
  item_code: string | null;
  description: string | null;
  dimensions: string | null;
  finish: string | null;
  qty: number;
  group: "truck" | "shelf";
  bin: string | null;
  gather_status: GatherStatus;
  problem_note: string | null;
};

type KitPhoto = {
  id: string;
  public_url: string | null;
  caption: string | null;
};

type KitJob = {
  id: string;
  client_name: string;
  title: string | null;
  install_date: string | null;
  installer_name: string | null;
  so_number: string | null;
  order_name: string | null;
  pdf_url: string | null;
  warehouse_status: string | null;
  pile_location: string | null;
  scan_received: number;
  scan_total: number;
  has_summary: boolean;
  lines: KitLine[];
  photos: KitPhoto[];
  ready: { ok: boolean; reasons: string[] };
};

const MARKS: Array<{ id: GatherStatus; label: string; short: string }> = [
  { id: "in_pile", label: "In the pile", short: "In pile" },
  { id: "on_truck", label: "Still on the truck", short: "On truck" },
  { id: "problem", label: "Problem", short: "Problem" },
];

const MARK_CLASS: Record<GatherStatus, string> = {
  unset: "",
  in_pile: styles.markPile,
  on_truck: styles.markTruck,
  problem: styles.markProblem,
};

const ROW_CLASS: Record<GatherStatus, string> = {
  unset: "",
  in_pile: styles.rowPile,
  on_truck: styles.rowTruck,
  problem: styles.rowProblem,
};

function formatInstall(value: string | null): string {
  if (!value) return "No install date";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Summary PDFs bleed qty, prices, and page headers into the description text. */
function tidyLine(line: KitLine): { name: string; qty: number; detail: string } {
  const strip = (value: string | null) =>
    (value ?? "")
      .split(/\s(?:Purchased|Price Total|Page \d+ of|GrainDirection)/)[0]
      .replace(/\$[\d,.]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  let name = strip(line.description);
  let qty = line.qty;
  const lead = name.match(/^(\d+)\s+(.*)$/);
  if (lead && qty <= 1) {
    qty = Number(lead[1]);
    name = lead[2];
  } else if (/^\d+$/.test(name) && qty <= 1) {
    qty = Number(name);
    name = "";
  }
  const extra = [strip(line.dimensions), strip(line.finish)].filter(Boolean).join(" · ");
  if (!name) name = extra || line.item_code || "Line";
  return { name, qty, detail: name === extra ? "" : extra };
}

export default function OpsWarehouseKit({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<KitJob | null>(null);
  const [spot, setSpot] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyJob = useCallback((next: KitJob) => {
    setJob(next);
    setSpot(next.pile_location ?? "");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/inspired-closets/ops/warehouse/jobs/${jobId}`);
        const payload = (await response.json()) as { ok?: boolean; job?: KitJob; error?: string; hint?: string };
        if (!payload.ok || !payload.job) {
          setError([payload.error, payload.hint].filter(Boolean).join(" "));
          return;
        }
        applyJob(payload.job);
      } catch {
        setError("Could not load this kit.");
      } finally {
        setLoading(false);
      }
    })();
  }, [applyJob, jobId]);

  async function send(body: Record<string, unknown>): Promise<KitJob | null> {
    const response = await fetch(`/api/inspired-closets/ops/warehouse/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { ok?: boolean; job?: KitJob; error?: string; hint?: string };
    if (!payload.ok || !payload.job) {
      setError([payload.error, payload.hint].filter(Boolean).join(" "));
      return null;
    }
    return payload.job;
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const next = await send(body);
      if (next) applyJob(next);
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function markRest(lines: KitLine[]) {
    const open = lines.filter((line) => line.gather_status === "unset");
    if (open.length === 0) return;
    setBusy(true);
    setError("");
    try {
      let latest: KitJob | null = null;
      for (const line of open) {
        const next = await send({ action: "mark", line_id: line.id, gather_status: "in_pile", problem_note: null });
        if (!next) break;
        latest = next;
      }
      if (latest) applyJob(latest);
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null, caption: string) {
    const list = files ? [...files] : [];
    if (list.length === 0) return;
    setBusy(true);
    setError("");
    try {
      let latest: KitJob | null = null;
      for (const file of list) {
        const form = new FormData();
        form.set("file", file);
        form.set("caption", caption);
        const response = await fetch(`/api/inspired-closets/ops/warehouse/jobs/${jobId}/photos`, {
          method: "POST",
          body: form,
        });
        const payload = (await response.json()) as { ok?: boolean; job?: KitJob; error?: string };
        if (!payload.ok || !payload.job) {
          setError(payload.error ?? "Could not upload that photo.");
          break;
        }
        latest = payload.job;
      }
      if (latest) applyJob(latest);
    } catch {
      setError("Could not upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  const lines = job?.lines ?? [];
  const truck = lines.filter((line) => line.group === "truck");
  const shelf = lines.filter((line) => line.group === "shelf");
  const count = (status: GatherStatus) => lines.filter((line) => line.gather_status === status).length;
  const marked = lines.length - count("unset");
  const percent = lines.length > 0 ? Math.round((marked / lines.length) * 100) : 0;
  const hasWholePile = job?.photos.some((photo) => photo.caption === "Whole pile") ?? false;

  const status = job?.warehouse_status === "ready"
    ? { label: "Ready", className: styles.badgeReady }
    : job?.warehouse_status === "hold"
      ? { label: "Hold", className: styles.badgeHold }
      : !job?.has_summary
        ? { label: "No product summary", className: styles.badgeMissing }
        : marked > 0
          ? { label: "Gathering", className: styles.badgeGather }
          : { label: "Not started", className: "" };

  function renderGroup(title: string, hint: string, group: KitLine[]) {
    if (!job?.has_summary || group.length === 0) return null;
    const open = group.filter((line) => line.gather_status === "unset").length;
    return (
      <section className={styles.group}>
        <div className={styles.groupHead}>
          <div>
            <h2>
              {title} <span className={styles.groupCount}>{group.length - open}/{group.length}</span>
            </h2>
            <p className={styles.meta}>{hint}</p>
          </div>
          {open > 0 ? (
            <button type="button" className={styles.bulk} disabled={busy} onClick={() => void markRest(group)}>
              Mark {open} left in pile
            </button>
          ) : null}
        </div>
        <div className={styles.rows}>
          {group.map((line) => {
            const tidy = tidyLine(line);
            return (
              <article key={line.id} className={`${styles.row} ${ROW_CLASS[line.gather_status]}`}>
                <div className={styles.qty}>×{tidy.qty}</div>
                <div className={styles.rowBody}>
                  <p className={styles.lineName}>{tidy.name}</p>
                  <p className={styles.rowMeta}>
                    {line.item_code ? <span className={styles.sku}>{line.item_code}</span> : null}
                    {tidy.detail ? <span>{tidy.detail}</span> : null}
                    {line.bin ? <span className={styles.bin}>Bin {line.bin}</span> : null}
                  </p>
                  {line.gather_status === "problem" ? (
                    <input
                      className={styles.note}
                      defaultValue={line.problem_note ?? ""}
                      placeholder="What's wrong with this line?"
                      aria-label="Problem note"
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next === (line.problem_note ?? "")) return;
                        void patch({ action: "mark", line_id: line.id, gather_status: "problem", problem_note: next });
                      }}
                    />
                  ) : null}
                </div>
                <div className={styles.marks} role="group" aria-label="Pile mark">
                  {MARKS.map((mark) => {
                    const on = line.gather_status === mark.id;
                    return (
                      <button
                        key={mark.id}
                        type="button"
                        title={mark.label}
                        className={`${styles.mark} ${on ? MARK_CLASS[mark.id] : ""}`}
                        disabled={busy}
                        aria-pressed={on}
                        onClick={() =>
                          void patch({
                            action: "mark",
                            line_id: line.id,
                            gather_status: on ? "unset" : mark.id,
                            problem_note: line.problem_note,
                          })
                        }
                      >
                        {mark.short}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <OpsShell title={job?.client_name ?? "Kit"} subtitle={job ? undefined : loading ? "Loading the pile" : "This kit could not be opened"}>
      <div className={styles.stack}>
        <Link href="/ops/warehouse" className={styles.back}>
          ← All kitting jobs
        </Link>
        {error ? <p className={styles.notice}>{error}</p> : null}
        {loading ? <p className={styles.meta}>Loading this kit…</p> : null}
        {job ? (
          <>
            <header className={styles.hero}>
              <div className={styles.heroTop}>
                <div>
                  <p className={styles.eyebrow}>
                    {[job.so_number ? `SO ${job.so_number}` : null, job.order_name].filter(Boolean).join(" · ") ||
                      "No sales order on the summary"}
                  </p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Install</dt>
                      <dd>{formatInstall(job.install_date)}</dd>
                    </div>
                    <div>
                      <dt>Installer</dt>
                      <dd>{job.installer_name ?? "Not assigned"}</dd>
                    </div>
                    <div>
                      <dt>Truck scan</dt>
                      <dd>
                        {job.scan_total > 0 ? `${job.scan_received}/${job.scan_total}` : "Nothing scanned"}
                        {job.scan_total > 0 && job.scan_received < job.scan_total ? (
                          <span className={styles.short}> short</span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className={styles.heroSide}>
                  <span className={`${styles.badge} ${status.className}`}>{status.label}</span>
                  {job.pdf_url ? (
                    <a className={styles.pdf} href={job.pdf_url} target="_blank" rel="noreferrer">
                      Product summary PDF
                    </a>
                  ) : null}
                </div>
              </div>
              {job.has_summary ? (
                <div className={styles.progress}>
                  <div className={styles.progressHead}>
                    <strong>
                      {marked} of {lines.length} lines marked
                    </strong>
                    <span>{percent}%</span>
                  </div>
                  <div className={styles.bar} aria-hidden>
                    <span className={styles.barPile} style={{ width: `${(count("in_pile") / lines.length) * 100}%` }} />
                    <span className={styles.barTruck} style={{ width: `${(count("on_truck") / lines.length) * 100}%` }} />
                    <span className={styles.barProblem} style={{ width: `${(count("problem") / lines.length) * 100}%` }} />
                  </div>
                  <div className={styles.legend}>
                    <span className={styles.legendPile}>{count("in_pile")} in pile</span>
                    <span className={styles.legendTruck}>{count("on_truck")} on truck</span>
                    <span className={styles.legendProblem}>{count("problem")} problem</span>
                    <span>{count("unset")} left</span>
                  </div>
                </div>
              ) : (
                <p className={styles.notice}>Product summary is not on this job yet. Ready stays off.</p>
              )}
            </header>

            <div className={styles.kitLayout}>
              <div className={styles.kitMain}>
                {renderGroup("From the truck", "Cut pieces that came in on the pallet.", truck)}
                {renderGroup(
                  "From the shelf",
                  "Hardware, toe boards, and everything else that does not arrive on the pallet.",
                  shelf,
                )}
              </div>

              <aside className={styles.kitSide}>
                <section className={styles.panel}>
                  <h2>Where the pile is</h2>
                  <input
                    className={styles.note}
                    value={spot}
                    onChange={(event) => setSpot(event.target.value)}
                    onBlur={() => {
                      if ((job.pile_location ?? "") === spot.trim()) return;
                      void patch({ action: "spot", pile_location: spot });
                    }}
                    placeholder="North wall, Friday Smith"
                    aria-label="Pile location"
                  />
                </section>

                <section className={styles.panel}>
                  <h2>Pile photos</h2>
                  <p className={styles.meta}>One shot of the whole pile is required.</p>
                  <div className={styles.photoRow}>
                    <label className={`${styles.photoBtn} ${hasWholePile ? styles.photoBtnSecondary : ""}`}>
                      {busy ? "Saving…" : hasWholePile ? "Retake whole pile" : "Photo of the whole pile"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        disabled={busy}
                        onChange={(event) => {
                          void upload(event.target.files, "Whole pile");
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <label className={`${styles.photoBtn} ${styles.photoBtnSecondary}`}>
                      Add another
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        hidden
                        disabled={busy}
                        onChange={(event) => {
                          void upload(event.target.files, "Extra");
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {job.photos.length > 0 ? (
                    <div className={styles.photos}>
                      {job.photos.map((photo) =>
                        photo.public_url ? (
                          <a key={photo.id} href={photo.public_url} target="_blank" rel="noreferrer">
                            <img src={photo.public_url} alt={photo.caption || "Pile"} />
                          </a>
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <div className={styles.photoEmpty}>No pile photo yet</div>
                  )}
                </section>

                <section className={`${styles.panel} ${styles.readyPanel}`}>
                  {job.warehouse_status === "ready" ? (
                    <p className={styles.readyNote}>This pile is ready for the installer.</p>
                  ) : null}
                  {job.warehouse_status === "hold" ? (
                    <p className={styles.meta}>On hold. The crew sees Hold until you mark it ready again.</p>
                  ) : null}
                  {!job.ready.ok ? (
                    <ul className={styles.reasons}>
                      {job.ready.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  {job.warehouse_status === "ready" ? (
                    <button type="button" className={styles.hold} disabled={busy} onClick={() => void patch({ action: "hold" })}>
                      Reopen — put on hold
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.ready}
                      disabled={busy || !job.ready.ok}
                      onClick={() => void patch({ action: "ready" })}
                    >
                      Mark this job ready
                    </button>
                  )}
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </OpsShell>
  );
}
