"use client";

import { useState } from "react";
import PromasterPortrait from "@/components/inspired-closets/PromasterPortrait";
import field from "./field.module.css";
import styles from "./field-vehicle.module.css";

export type FieldVehicleSnapshot = {
  vehicle: {
    id: string;
    label: string;
    year: number | null;
    make: string;
    model: string;
    color: string | null;
    plate_last4: string | null;
    odometer: number;
  } | null;
  grade: {
    overall: "ok" | "warn" | "due";
    lights: Array<{ id: string; label: string; status: "ok" | "warn" | "due"; detail: string }>;
  } | null;
  week_miles: number;
  last_wash_at: string | null;
  last_fuel_at: string | null;
  logs: Array<{
    id: string;
    kind: string;
    logged_at: string;
    odometer: number | null;
    gallons: number | string | null;
    amount_cents: number | null;
    clean_ok: boolean | null;
    note: string | null;
  }>;
  miles: Array<{
    id: string;
    job_id: string;
    drive_date: string;
    miles_out: number;
    miles_back: number;
  }>;
  hint?: string;
};

type LogKind = "fuel" | "wash" | "clean_check" | "odometer";

function money(cents: number | null): string {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function logLabel(kind: string): string {
  if (kind === "fuel") return "Gas";
  if (kind === "wash") return "Wash";
  if (kind === "clean_check") return "Cab check";
  if (kind === "odometer") return "Odometer";
  if (kind === "service") return "Service";
  return kind;
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FieldVehicleTab({
  snapshot,
  busy,
  jobNames,
  onLog,
}: {
  snapshot: FieldVehicleSnapshot | null;
  busy: boolean;
  jobNames: Map<string, string>;
  onLog: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<LogKind | null>(null);
  const [odometer, setOdometer] = useState("");
  const [gallons, setGallons] = useState("");
  const [amount, setAmount] = useState("");
  const [cleanOk, setCleanOk] = useState(true);

  const vehicle = snapshot?.vehicle;
  if (!vehicle) {
    return (
      <section className={field.dashCard}>
        <p className={field.colLabel}>Vehicle</p>
        <h2 className={field.profileNameLg}>No truck assigned</h2>
        <p className={field.jobMeta}>
          {snapshot?.hint ?? "Gavin or Des assigns the company van on your installer file."}
        </p>
      </section>
    );
  }

  async function submit(kind: LogKind) {
    const body: Record<string, unknown> = { action: "log", kind };
    if (odometer) body.odometer = Number(odometer);
    if (kind === "fuel") {
      if (gallons) body.gallons = Number(gallons);
      if (amount) body.amount_dollars = Number(amount);
    }
    if (kind === "clean_check") body.clean_ok = cleanOk;
    await onLog(body);
    setForm(null);
    setOdometer("");
    setGallons("");
    setAmount("");
    setCleanOk(true);
  }

  return (
    <div className={field.leftStack}>
      <section className={field.dashCard}>
        <p className={field.colLabel}>Your truck</p>
        <PromasterPortrait color={vehicle.color ?? "#f4f1ea"} />
        <h2 className={field.profileNameLg}>{vehicle.label}</h2>
        <p className={field.jobMeta}>
          {vehicle.plate_last4 ? `Plate ···${vehicle.plate_last4}` : "Plate on file at the office"}
          {vehicle.odometer ? ` · ${vehicle.odometer.toLocaleString()} mi` : ""}
        </p>
        <p className={field.jobMeta}>
          {snapshot?.week_miles ?? 0} miles this week from jobs
        </p>
        <div className={styles.lights}>
          {(snapshot?.grade?.lights ?? []).map((light) => (
            <div key={light.id} className={styles.lightRow}>
              <strong>{light.label}</strong>
              <span>{light.detail}</span>
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={field.btn} disabled={busy} onClick={() => setForm("fuel")}>
            Got gas
          </button>
          <button type="button" className={field.btnGhost} disabled={busy} onClick={() => setForm("wash")}>
            Washed
          </button>
          <button type="button" className={field.btnGhost} disabled={busy} onClick={() => setForm("clean_check")}>
            Cab check
          </button>
          <button type="button" className={field.btnGhost} disabled={busy} onClick={() => setForm("odometer")}>
            Odometer
          </button>
        </div>
        {form ? (
          <div className={styles.form}>
            {form === "fuel" ? (
              <>
                <input
                  className={field.input}
                  inputMode="decimal"
                  placeholder="Gallons"
                  value={gallons}
                  onChange={(e) => setGallons(e.target.value)}
                />
                <input
                  className={field.input}
                  inputMode="decimal"
                  placeholder="Dollars on the gas card"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </>
            ) : null}
            {form === "clean_check" ? (
              <select
                className={field.select}
                value={cleanOk ? "ok" : "needs"}
                onChange={(e) => setCleanOk(e.target.value === "ok")}
              >
                <option value="ok">Cab is clean</option>
                <option value="needs">Needs a clean</option>
              </select>
            ) : null}
            <input
              className={field.input}
              inputMode="numeric"
              placeholder={form === "odometer" ? "Odometer" : "Odometer (optional)"}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={field.btn}
                disabled={busy || (form === "odometer" && !odometer)}
                onClick={() => void submit(form)}
              >
                Save
              </button>
              <button type="button" className={field.btnGhost} onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={field.dashCard}>
        <p className={field.colLabel}>This week’s job miles</p>
        {(snapshot?.miles ?? []).length === 0 ? (
          <p className={styles.emptyHint}>Log miles out and back on a job packet.</p>
        ) : (
          <ul className={styles.logList}>
            {(snapshot?.miles ?? []).map((row) => (
              <li key={row.id}>
                {jobNames.get(row.job_id) ?? "Job"} · {row.drive_date} · {row.miles_out + row.miles_back} mi
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={field.dashCard}>
        <p className={field.colLabel}>Recent logs</p>
        {(snapshot?.logs ?? []).length === 0 ? (
          <p className={styles.emptyHint}>Gas, wash, and cab checks land here.</p>
        ) : (
          <ul className={styles.logList}>
            {(snapshot?.logs ?? []).map((row) => (
              <li key={row.id}>
                {logLabel(row.kind)}
                {row.kind === "fuel" ? ` · ${row.gallons ?? ""} gal ${money(row.amount_cents)}` : ""}
                {row.kind === "clean_check" ? (row.clean_ok ? " · clean" : " · needs clean") : ""}
                {row.odometer ? ` · ${row.odometer.toLocaleString()} mi` : ""}
                {" · "}
                {stamp(row.logged_at)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
