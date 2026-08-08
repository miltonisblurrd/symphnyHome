/**
 * Lead CRM constants for Des / front office.
 */
import type { IcLeadSource, IcLeadStage } from "@/db/ops-schema";

export const LEAD_SOURCES: { id: IcLeadSource; label: string }[] = [
  { id: "call", label: "Office call" },
  { id: "website", label: "Website" },
  { id: "google", label: "Google" },
  { id: "meta", label: "Meta / Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "yelp", label: "Yelp" },
  { id: "billboard", label: "Billboard / vehicle" },
  { id: "referral", label: "Referral" },
  { id: "email", label: "Email" },
  { id: "other", label: "Other" },
];

export const LEAD_STAGES: { id: IcLeadStage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "schedule", label: "Ready to schedule" },
  { id: "follow_up", label: "Needs follow-up" },
  { id: "nurturing", label: "Nurturing" },
  { id: "not_interested", label: "Not interested" },
  { id: "junk", label: "Junk" },
  { id: "appointment_set", label: "Appointment set" },
];

export const MAX_FOLLOW_UP_ATTEMPTS = 5;

export type { IcLeadSource, IcLeadStage };
