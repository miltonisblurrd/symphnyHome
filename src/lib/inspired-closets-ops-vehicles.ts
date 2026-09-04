export type VehicleLogKind = "fuel" | "wash" | "clean_check" | "odometer" | "service" | "oil";

export type VehicleRow = {
  id: string;
  name: string | null;
  year: number | null;
  make: string;
  model: string;
  color: string | null;
  plate?: string | null;
  plate_last4: string | null;
  vin?: string | null;
  vin_last6?: string | null;
  odometer: number;
  assigned_installer_id: string | null;
  registered_owner?: string | null;
  garage_address?: string | null;
  registration_expires_on: string | null;
  insurance_carrier?: string | null;
  insurance_policy?: string | null;
  insurance_agency?: string | null;
  insurance_agency_phone?: string | null;
  insurance_effective_on?: string | null;
  insurance_expires_on: string | null;
  declared_weight_lbs?: number | null;
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

export const WASH_EVERY_DAYS = 14;
export const OIL_EVERY_MILES = 5000;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - Date.now()) / 86_400_000);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const start = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date();
  const noon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.round((noon.getTime() - start.getTime()) / 86_400_000);
}

function washDayLabel(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function gradeWash(lastWashAt: string | null): GradeLight {
  const age = daysSince(lastWashAt);
  if (!lastWashAt || age == null) {
    return { id: "wash", label: "Wash", status: "warn", detail: "No wash logged yet" };
  }
  const last = washDayLabel(lastWashAt);
  if (age > WASH_EVERY_DAYS) {
    return {
      id: "wash",
      label: "Wash",
      status: "due",
      detail: `Needs a wash · last ${last}`,
    };
  }
  if (age >= WASH_EVERY_DAYS - 4) {
    return {
      id: "wash",
      label: "Wash",
      status: "warn",
      detail: `Due in ${WASH_EVERY_DAYS - age} days · last ${last}`,
    };
  }
  return {
    id: "wash",
    label: "Wash",
    status: "ok",
    detail: `Washed ${last} · next in ${WASH_EVERY_DAYS - age} days`,
  };
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

export function gradeOil(input: {
  odometer: number;
  lastOilAt: string | null;
  lastOilMiles: number | null;
  nextOilDueMiles: number | null;
}): GradeLight {
  const dueAt =
    input.lastOilMiles != null
      ? input.lastOilMiles + OIL_EVERY_MILES
      : input.nextOilDueMiles;
  const last = input.lastOilAt ? washDayLabel(input.lastOilAt) : null;
  if (dueAt == null) {
    return { id: "oil", label: "Oil", status: "warn", detail: "No oil change logged yet" };
  }
  const left = dueAt - (input.odometer ?? 0);
  if (left <= 0) {
    return {
      id: "oil",
      label: "Oil",
      status: "due",
      detail: last ? `Oil due · last ${last} at ${input.lastOilMiles?.toLocaleString()} mi` : "Oil due",
    };
  }
  if (left <= 500) {
    return {
      id: "oil",
      label: "Oil",
      status: "warn",
      detail: last ? `Due in ${left} mi · last ${last}` : `Due in ${left} mi`,
    };
  }
  return {
    id: "oil",
    label: "Oil",
    status: "ok",
    detail: last
      ? `${left.toLocaleString()} mi to go · last ${last}`
      : `${left.toLocaleString()} mi to go`,
  };
}

export function gradeVehicle(input: {
  vehicle: VehicleRow;
  lastWashAt: string | null;
  lastCleanAt: string | null;
  lastCleanOk: boolean | null;
  lastOdometerAt: string | null;
  lastOilAt?: string | null;
  lastOilMiles?: number | null;
  weekMiles: number;
}): VehicleGrade {
  const wash = gradeWash(input.lastWashAt);

  const cleanAge = daysSince(input.lastCleanAt);
  const cleanLast = input.lastCleanAt ? washDayLabel(input.lastCleanAt) : null;
  const clean: GradeLight = !input.lastCleanAt
    ? { id: "clean", label: "Cab", status: "warn", detail: "No cab check yet" }
    : cleanAge !== null && cleanAge > 7
      ? { id: "clean", label: "Cab", status: "due", detail: `Needs a cab check · last ${cleanLast}` }
      : cleanAge !== null && cleanAge > 5
        ? { id: "clean", label: "Cab", status: "warn", detail: `Due this week · last ${cleanLast}` }
        : { id: "clean", label: "Cab", status: "ok", detail: `Checked ${cleanLast}` };

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

  const oil = gradeOil({
    odometer: input.vehicle.odometer ?? 0,
    lastOilAt: input.lastOilAt ?? null,
    lastOilMiles: input.lastOilMiles ?? null,
    nextOilDueMiles: input.vehicle.next_oil_due_miles,
  });

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
    plate: vehicle.plate ?? (vehicle.plate_last4 ? `···${vehicle.plate_last4}` : null),
    plate_last4: vehicle.plate_last4,
    vin: vehicle.vin ?? null,
    odometer: vehicle.odometer,
    registered_owner: vehicle.registered_owner ?? null,
    garage_address: vehicle.garage_address ?? null,
    registration_expires_on: vehicle.registration_expires_on,
    insurance_carrier: vehicle.insurance_carrier ?? null,
    insurance_policy: vehicle.insurance_policy ?? null,
    insurance_agency: vehicle.insurance_agency ?? null,
    insurance_agency_phone: vehicle.insurance_agency_phone ?? null,
    insurance_effective_on: vehicle.insurance_effective_on ?? null,
    insurance_expires_on: vehicle.insurance_expires_on,
    declared_weight_lbs: vehicle.declared_weight_lbs ?? null,
    next_oil_due_miles: vehicle.next_oil_due_miles,
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
