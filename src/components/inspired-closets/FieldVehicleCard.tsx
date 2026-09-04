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
    plate: string | null;
    plate_last4: string | null;
    vin: string | null;
    odometer: number;
    registered_owner: string | null;
    garage_address: string | null;
    registration_expires_on: string | null;
    insurance_carrier: string | null;
    insurance_policy: string | null;
    insurance_agency: string | null;
    insurance_agency_phone: string | null;
    insurance_effective_on: string | null;
    insurance_expires_on: string | null;
    declared_weight_lbs: number | null;
    next_oil_due_miles: number | null;
  } | null;
  license: {
    legal_name: string | null;
    license_number: string | null;
    state: string | null;
    class: string | null;
    issued_on: string | null;
    expires_on: string | null;
    endorsements: string | null;
    restrictions: string | null;
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

type LogKind = "fuel" | "wash" | "clean_check" | "oil";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function todayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function washedOnYmd(month: number, day: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const todayKey = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const ymd = `${year}-${mm}-${dd}`;
  return ymd > todayKey ? `${year - 1}-${mm}-${dd}` : ymd;
}

export default function FieldVehicleCard({
  snapshot,
  busy,
  onLog,
  showPortrait = false,
}: {
  snapshot: FieldVehicleSnapshot | null;
  busy: boolean;
  onLog: (body: Record<string, unknown>) => Promise<void>;
  showPortrait?: boolean;
}) {
  const [form, setForm] = useState<LogKind | null>(null);
  const [odometer, setOdometer] = useState("");
  const [gallons, setGallons] = useState("");
  const [amount, setAmount] = useState("");
  const today = todayParts();
  const [logMonth, setLogMonth] = useState(today.month);
  const [logDay, setLogDay] = useState(today.day);
  const vehicle = snapshot?.vehicle;

  function openForm(kind: LogKind) {
    const parts = todayParts();
    setLogMonth(parts.month);
    setLogDay(parts.day);
    setOdometer(kind === "oil" && vehicle?.odometer ? String(vehicle.odometer) : "");
    setForm(kind);
  }

  async function submit(kind: LogKind) {
    const body: Record<string, unknown> = { action: "log", kind };
    if (kind === "wash" || kind === "clean_check" || kind === "oil") {
      body.logged_on = washedOnYmd(logMonth, logDay);
    }
    if (kind === "oil" || (kind !== "wash" && kind !== "clean_check" && odometer)) {
      body.odometer = Number(odometer);
    }
    if (kind === "fuel") {
      if (gallons) body.gallons = Number(gallons);
      if (amount) body.amount_dollars = Number(amount);
    }
    await onLog(body);
    setForm(null);
    setOdometer("");
    setGallons("");
    setAmount("");
  }

  if (!vehicle) {
    return (
      <section className={field.dashCard}>
        <p className={field.colLabel}>Your truck</p>
        <h2 className={field.profileNameLg}>No truck assigned</h2>
        <p className={field.jobMeta}>
          {snapshot?.hint ?? "Gavin or Des assigns the company van on your installer file."}
        </p>
      </section>
    );
  }

  return (
    <section className={field.dashCard}>
      <p className={field.colLabel}>Your truck</p>
      {showPortrait ? <PromasterPortrait color={vehicle.color ?? "#f4f1ea"} /> : null}
      <h2 className={field.profileNameLg}>{vehicle.label}</h2>
      <p className={field.jobMeta}>
        {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
      </p>
      <p className={field.jobMeta}>
        {vehicle.odometer ? `${vehicle.odometer.toLocaleString()} miles on the dash` : "Odometer not logged"}
        {` · ${snapshot?.week_miles ?? 0} this week`}
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
        <button type="button" className={field.btn} disabled={busy} onClick={() => openForm("fuel")}>
          Got gas
        </button>
        <button type="button" className={field.btnGhost} disabled={busy} onClick={() => openForm("wash")}>
          Washed
        </button>
        <button type="button" className={field.btnGhost} disabled={busy} onClick={() => openForm("clean_check")}>
          Cab check
        </button>
        <button type="button" className={field.btnGhost} disabled={busy} onClick={() => openForm("oil")}>
          Oil change
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
          {form === "wash" || form === "clean_check" || form === "oil" ? (
            <div className={styles.dateRow}>
              <label className={styles.dateField}>
                <span>Month</span>
                <select
                  className={field.select}
                  value={logMonth}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setLogMonth(next);
                    const max = daysInMonth(today.year, next);
                    if (logDay > max) setLogDay(max);
                  }}
                >
                  {MONTHS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.dateField}>
                <span>Day</span>
                <select
                  className={field.select}
                  value={logDay}
                  onChange={(e) => setLogDay(Number(e.target.value))}
                >
                  {Array.from({ length: daysInMonth(today.year, logMonth) }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : form === "fuel" ? (
            <input
              className={field.input}
              inputMode="numeric"
              placeholder="Odometer (optional)"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
          ) : null}
          {form === "oil" ? (
            <input
              className={field.input}
              inputMode="numeric"
              placeholder="Odometer miles"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={field.btn}
              disabled={busy || (form === "oil" && !odometer)}
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
  );
}
