export type CalendarLane = "appointment" | "install" | "showroom" | "goback";

export const CALENDAR_LANES: { id: CalendarLane; label: string }[] = [
  { id: "appointment", label: "Appointments" },
  { id: "install", label: "Installs" },
  { id: "showroom", label: "Showroom" },
  { id: "goback", label: "Go-backs" },
];

export function classifyAppointment(input: {
  kind: string;
  location_type?: string | null;
}): CalendarLane {
  if (input.kind === "install") return "install";
  if (input.kind === "job_check") return "goback";
  if (input.location_type === "showroom") return "showroom";
  return "appointment";
}

export function classifyJob(input: {
  job_kind?: string | null;
  serviceTag?: "SVC" | "G/B" | null;
}): CalendarLane {
  if (input.job_kind === "go_back" || input.serviceTag === "G/B") return "goback";
  return "install";
}

export function ymdFromIso(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
