export type VehicleLogKind = "fuel" | "wash" | "clean_check" | "odometer" | "service";

export type VehicleRow = {
  id: string;
  name: string | null;
  year: number | null;
  make: string;
  model: string;
  color: string | null;
  plate_last4: string | null;
  odometer: number;
  assigned_installer_id: string | null;
  registration_expires_on: string | null;
  insurance_expires_on: string | null;
  next_oil_due_miles: number | null;
};

export type VehicleLogRow = {
  id: string;
  kind: string;
  logged_at: string;
  odometer: number | null;
  gallons: number | null;
  amount_cents: number | null;
  clean_ok: boolean | null;
  note: string | null;
};

export type JobMilesRow = {
  id: string;
  job_id: string;
  drive_date: string;
  miles_out: number;
  miles_back: number;
};

export type GradeStatus = "ok" | "warn" | "due";

export type GradeLight = {
  id: string;
  label: string;
  status: GradeStatus;
  detail: string;
};

export type VehicleGrade = {
  overall: GradeStatus;
  lights: GradeLight[];
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - Date.now()) / 86_400_000);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  return Math.round((Date.now() - start.getTime()) / 86_400_000);
}

function worst(statuses: GradeStatus[]): GradeStatus {
  if (statuses.includes("due")) return "due";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

export function vehicleLabel(vehicle: Pick<VehicleRow, "year" | "make" | "model" | "name">): string {
  if (vehicle.name?.trim()) return vehicle.name.trim();
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

export function gradeVehicle(input: {
  vehicle: VehicleRow;
  lastWashAt: string | null;
  lastCleanAt: string | null;
  lastCleanOk: boolean | null;
  lastOdometerAt: string | null;
  weekMiles: number;
}): VehicleGrade {
  const washAge = daysSince(input.lastWashAt);
  const wash: GradeLight = !input.lastWashAt
    ? { id: "wash", label: "Wash", status: "warn", detail: "No wash logged yet" }
    : washAge !== null && washAge > 14
      ? { id: "wash", label: "Wash", status: "due", detail: `Last wash ${washAge} days ago` }
      : washAge !== null && washAge > 10
        ? { id: "wash", label: "Wash", status: "warn", detail: `Due soon · ${14 - washAge} days` }
        : { id: "wash", label: "Wash", status: "ok", detail: "Washed this cycle" };

  const cleanAge = daysSince(input.lastCleanAt);
  const clean: GradeLight = !input.lastCleanAt
    ? { id: "clean", label: "Cab", status: "warn", detail: "No cab check yet" }
    : input.lastCleanOk === false
      ? { id: "clean", label: "Cab", status: "due", detail: "Needs a clean" }
      : cleanAge !== null && cleanAge > 7
        ? { id: "clean", label: "Cab", status: "warn", detail: "Check the cab this week" }
        : { id: "clean", label: "Cab", status: "ok", detail: "Cab looks good" };

  const regDays = daysUntil(input.vehicle.registration_expires_on);
  const reg: GradeLight =
    regDays === null
      ? { id: "reg", label: "Registration", status: "warn", detail: "Date not on file" }
      : regDays < 0
        ? { id: "reg", label: "Registration", status: "due", detail: "Expired — call the office" }
        : regDays <= 30
          ? { id: "reg", label: "Registration", status: "warn", detail: `Due in ${regDays} days` }
          : { id: "reg", label: "Registration", status: "ok", detail: "Current" };

  const insDays = daysUntil(input.vehicle.insurance_expires_on);
  const ins: GradeLight =
    insDays === null
      ? { id: "insurance", label: "Insurance", status: "warn", detail: "Date not on file" }
      : insDays < 0
        ? { id: "insurance", label: "Insurance", status: "due", detail: "Expired — call the office" }
        : insDays <= 30
          ? { id: "insurance", label: "Insurance", status: "warn", detail: `Due in ${insDays} days` }
          : { id: "insurance", label: "Insurance", status: "ok", detail: "Current" };

  const odo = input.vehicle.odometer ?? 0;
  const oilDue = input.vehicle.next_oil_due_miles;
  const oil: GradeLight =
    oilDue == null
      ? { id: "oil", label: "Oil", status: "warn", detail: "Interval not set" }
      : odo >= oilDue
        ? { id: "oil", label: "Oil", status: "due", detail: "Overdue" }
        : oilDue - odo <= 500
          ? { id: "oil", label: "Oil", status: "warn", detail: `Due in ${oilDue - odo} mi` }
          : { id: "oil", label: "Oil", status: "ok", detail: `${oilDue - odo} mi to go` };

  const odoAge = daysSince(input.lastOdometerAt);
  const miles: GradeLight =
    input.weekMiles > 0
      ? { id: "miles", label: "Miles", status: "ok", detail: `${input.weekMiles} this week` }
      : odoAge !== null && odoAge <= 7
        ? { id: "miles", label: "Miles", status: "ok", detail: "Odometer updated" }
        : { id: "miles", label: "Miles", status: "warn", detail: "Log miles this week" };

  const lights = [wash, clean, reg, ins, oil, miles];
  return { overall: worst(lights.map((light) => light.status)), lights };
}

export function publicVehicle(vehicle: VehicleRow) {
  return {
    id: vehicle.id,
    label: vehicleLabel(vehicle),
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color,
    plate_last4: vehicle.plate_last4,
    odometer: vehicle.odometer,
  };
}

export function startOfWeekIso(d = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function todayYmd(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
