import type {
  IcAppointmentKind,
  IcAppointmentLocation,
  IcAppointmentStatus,
} from "@/db/ops-schema";

export const APPOINTMENT_KINDS: { id: IcAppointmentKind; label: string }[] = [
  { id: "consultation", label: "Consultation" },
  { id: "job_check", label: "Job check" },
  { id: "install", label: "Install" },
];

export const APPOINTMENT_LOCATIONS: { id: IcAppointmentLocation; label: string }[] = [
  { id: "on_site", label: "On site" },
  { id: "showroom", label: "Showroom" },
  { id: "virtual", label: "Virtual" },
];

export const APPOINTMENT_STATUSES: { id: IcAppointmentStatus; label: string }[] = [
  { id: "scheduled", label: "Scheduled" },
  { id: "confirmed", label: "Confirmed" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rescheduled", label: "Rescheduled" },
];

export type { IcAppointmentKind, IcAppointmentLocation, IcAppointmentStatus };
