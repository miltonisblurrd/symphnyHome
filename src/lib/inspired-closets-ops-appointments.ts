import type {
  IcAppointmentKind,
  IcAppointmentLocation,
  IcAppointmentStatus,
} from "@/db/ops-schema";

export const APPOINTMENT_KINDS: { id: IcAppointmentKind; label: string }[] = [
  { id: "consultation", label: "Design Event" },
  { id: "job_check", label: "Job check" },
  { id: "install", label: "Install Event" },
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

export const CONSULT_OUTCOMES = [
  { id: "quote_sent", label: "Quote sent" },
  { id: "follow_up", label: "Follow up" },
  { id: "no_sale", label: "No sale" },
] as const;

export type IcConsultOutcome = (typeof CONSULT_OUTCOMES)[number]["id"];

export type { IcAppointmentKind, IcAppointmentLocation, IcAppointmentStatus };
