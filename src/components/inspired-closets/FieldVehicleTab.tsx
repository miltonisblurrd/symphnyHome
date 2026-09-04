"use client";

import FieldVehicleCard, {
  type FieldVehicleSnapshot,
} from "@/components/inspired-closets/FieldVehicleCard";
import field from "./field.module.css";
import styles from "./field-vehicle.module.css";

export type { FieldVehicleSnapshot };

function money(cents: number | null): string {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function logLabel(kind: string): string {
  if (kind === "fuel") return "Gas";
  if (kind === "wash") return "Wash";
  if (kind === "clean_check") return "Cab check";
  if (kind === "oil") return "Oil change";
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

function dayLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{typeof value === "number" ? value.toLocaleString() : value}</dd>
    </div>
  );
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
  const vehicle = snapshot?.vehicle;
  if (!vehicle) {
    return (
      <FieldVehicleCard snapshot={snapshot} busy={busy} onLog={onLog} showPortrait />
    );
  }

  return (
    <div className={styles.vehicleGrid}>
      <div className={styles.col}>
        <FieldVehicleCard snapshot={snapshot} busy={busy} onLog={onLog} showPortrait />
      </div>

      <div className={styles.col}>
      <section className={field.dashCard}>
        <p className={field.colLabel}>Truck file</p>
        <dl className={styles.facts}>
          <Fact label="Year" value={vehicle.year} />
          <Fact label="Make" value={vehicle.make} />
          <Fact label="Model" value={vehicle.model} />
          <Fact label="Odometer" value={vehicle.odometer ? `${vehicle.odometer.toLocaleString()} mi` : null} />
          <Fact label="VIN" value={vehicle.vin} />
          <Fact
            label="Oil due"
            value={vehicle.next_oil_due_miles ? `${vehicle.next_oil_due_miles.toLocaleString()} mi` : null}
          />
        </dl>
      </section>

      <section className={field.dashCard}>
        <p className={field.colLabel}>Registration</p>
        <dl className={styles.facts}>
          <Fact label="Registered owner" value={vehicle.registered_owner} />
          <Fact label="Garage" value={vehicle.garage_address} />
          <Fact label="Plate" value={vehicle.plate} />
          <Fact label="Expires" value={vehicle.registration_expires_on ? dayLabel(vehicle.registration_expires_on) : null} />
          <Fact
            label="Declared weight"
            value={vehicle.declared_weight_lbs ? `${vehicle.declared_weight_lbs.toLocaleString()} lbs` : null}
          />
        </dl>
        {!vehicle.registered_owner && !vehicle.plate && !vehicle.registration_expires_on ? (
          <p className={styles.emptyHint}>No registration card on this van yet.</p>
        ) : null}
      </section>

      <section className={field.dashCard}>
        <p className={field.colLabel}>Insurance</p>
        <dl className={styles.facts}>
          <Fact label="Carrier" value={vehicle.insurance_carrier} />
          <Fact label="Policy" value={vehicle.insurance_policy} />
          <Fact label="Agency" value={vehicle.insurance_agency} />
          <Fact label="Agency phone" value={vehicle.insurance_agency_phone} />
          <Fact label="Effective" value={vehicle.insurance_effective_on ? dayLabel(vehicle.insurance_effective_on) : null} />
          <Fact label="Expires" value={vehicle.insurance_expires_on ? dayLabel(vehicle.insurance_expires_on) : null} />
        </dl>
      </section>
      </div>

      <div className={styles.col}>
      {snapshot?.license ? (
        <section className={field.dashCard}>
          <p className={field.colLabel}>Driver license</p>
          <dl className={styles.facts}>
            <Fact label="Name" value={snapshot.license.legal_name} />
            <Fact label="License" value={snapshot.license.license_number} />
            <Fact label="State" value={snapshot.license.state} />
            <Fact label="Class" value={snapshot.license.class} />
            <Fact label="Issued" value={snapshot.license.issued_on ? dayLabel(snapshot.license.issued_on) : null} />
            <Fact label="Expires" value={snapshot.license.expires_on ? dayLabel(snapshot.license.expires_on) : null} />
            <Fact label="Endorsements" value={snapshot.license.endorsements} />
            <Fact label="Restrictions" value={snapshot.license.restrictions} />
          </dl>
        </section>
      ) : null}

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
                {row.kind === "wash" || row.kind === "clean_check" || row.kind === "oil"
                  ? ` · ${dayLabel(row.logged_at)}`
                  : ""}
                {row.kind === "oil" && row.odometer ? ` · ${row.odometer.toLocaleString()} mi` : ""}
                {row.kind !== "wash" && row.kind !== "clean_check" && row.kind !== "oil" && row.odometer
                  ? ` · ${row.odometer.toLocaleString()} mi`
                  : ""}
                {row.kind !== "wash" && row.kind !== "clean_check" && row.kind !== "oil"
                  ? ` · ${stamp(row.logged_at)}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
