import PromasterPortrait from "@/components/inspired-closets/PromasterPortrait";
import field from "./field.module.css";
import styles from "./field-vehicle.module.css";
import type { FieldVehicleSnapshot } from "@/components/inspired-closets/FieldVehicleTab";

function gradeClass(status: string | undefined) {
  if (status === "due") return styles.gradeDue;
  if (status === "warn") return styles.gradeWarn;
  return styles.gradeOk;
}

function gradeWord(status: string | undefined) {
  if (status === "due") return "Needs attention";
  if (status === "warn") return "Keep an eye";
  if (status === "ok") return "In good shape";
  return "No truck yet";
}

export default function FieldVehicleCard({
  snapshot,
  onOpen,
}: {
  snapshot: FieldVehicleSnapshot | null;
  onOpen: () => void;
}) {
  const vehicle = snapshot?.vehicle;
  return (
    <button type="button" className={`${field.dashCard} ${styles.homeCard}`} onClick={onOpen}>
      <p className={field.colLabel}>Vehicle</p>
      {vehicle ? (
        <>
          <PromasterPortrait color={vehicle.color ?? "#f4f1ea"} compact />
          <dl className={field.statList}>
            <div>
              <dt>Truck</dt>
              <dd>{vehicle.label}</dd>
              <p className={field.statHint}>
                <span className={`${styles.gradeDot} ${gradeClass(snapshot?.grade?.overall)}`} />
                {gradeWord(snapshot?.grade?.overall)}
              </p>
            </div>
            <div>
              <dt>Miles this week</dt>
              <dd>{snapshot?.week_miles ?? 0}</dd>
              <p className={field.statHint}>
                {vehicle.odometer ? `${vehicle.odometer.toLocaleString()} on the dash` : "Log odometer on Vehicle"}
              </p>
            </div>
          </dl>
        </>
      ) : (
        <p className={field.empty}>Office hasn’t assigned you a truck yet.</p>
      )}
    </button>
  );
}
