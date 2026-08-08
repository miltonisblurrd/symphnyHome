/**
 * Lead CRM constants — Des desk, aligned to Community.
 */
export const LEAD_SOURCES = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google" },
  { id: "yelp", label: "Yelp" },
  { id: "website", label: "Website" },
  { id: "organic_search", label: "Organic Search" },
  { id: "paid_search", label: "Paid Search" },
  { id: "billboard", label: "Billboard" },
  { id: "vehicle", label: "Vehicle" },
  { id: "referral_company", label: "Referral – Company" },
  { id: "referral_personal", label: "Referral – Personal" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "other", label: "Other" },
] as const;

export type IcLeadSourceId = (typeof LEAD_SOURCES)[number]["id"];

/** Community status ladder — any selectable; reasons required for nurturing/junk. */
export const LEAD_STAGES = [
  { id: "new", label: "New Lead" },
  { id: "attempt_1", label: "1st Attempt – No Response" },
  { id: "attempt_2", label: "2nd Attempt – No Response" },
  { id: "attempt_3", label: "3rd Attempt – No Response" },
  { id: "attempt_4", label: "4th Attempt – No Response" },
  { id: "attempt_5", label: "5th Attempt – No Response" },
  { id: "follow_up", label: "Needs Follow Up" },
  { id: "appointment_set", label: "Scheduled" },
  { id: "rescheduled", label: "Rescheduled" },
  { id: "canceled_appointment", label: "Canceled Appointment" },
  { id: "nurturing", label: "Lead Nurturing" },
  { id: "moved_to_studio", label: "Moved to Studio" },
  { id: "new_construction", label: "New Construction" },
  { id: "prospect", label: "Prospect" },
  { id: "duplicate", label: "Duplicate" },
  { id: "junk", label: "Junk" },
] as const;

export type IcLeadStageId = (typeof LEAD_STAGES)[number]["id"];

export const LEAD_TYPES = [
  { id: "consumer", label: "Consumer" },
  { id: "influencer", label: "Influencer" },
] as const;

export const INFLUENCER_TYPES = [
  { id: "builder", label: "Builder" },
  { id: "interior_design_firm", label: "Interior Design Firm" },
  { id: "professional_organizing_firm", label: "Professional Organizing Firm" },
  { id: "architect", label: "Architect" },
  { id: "realtor", label: "Realtor" },
  { id: "social_media_influencer", label: "Social Media Influencer" },
] as const;

export const FORM_TYPES = [
  { id: "consultation_request", label: "Consultation request" },
  { id: "brochure_download", label: "Brochure download" },
  { id: "contact_us", label: "Contact us" },
  { id: "self_scheduling", label: "Self-Scheduling" },
  { id: "builder_form", label: "Builder Form" },
  { id: "promo_landing_page", label: "Promo Landing Page" },
  { id: "nplp", label: "NPLP" },
] as const;

export const AREAS_OF_HOME = [
  "Closet",
  "Garage",
  "Laundry",
  "Pantry",
  "Home Office",
  "Murphy Bed",
  "Entryway",
  "Entertainment",
] as const;

export const NURTURING_REASONS = [
  { id: "cancelled_appointment", label: "Cancelled Appointment" },
  { id: "no_contact_made", label: "No Contact Made" },
  { id: "stopped_responding", label: "Stopped Responding to Messages" },
  { id: "no_longer_interested", label: "No Longer Interested" },
  { id: "went_with_competitor", label: "Went with competitor" },
  { id: "just_browsing", label: "Just browsing at this time" },
] as const;

export const JUNK_REASONS = [
  { id: "out_of_service_area", label: "Out of Service Area" },
  { id: "not_qualified", label: "Not qualified" },
  { id: "looking_for_something_different", label: "Looking for something different" },
  { id: "spam_or_solicitor", label: "Spam or Solicitor" },
] as const;

/** Craig-only pipeline statuses (Leads vs Sales tab). */
export const PIPELINE_STATUSES = [
  { id: "proposed", label: "Proposed" },
  { id: "on_hold", label: "On Hold" },
  { id: "sold", label: "Sold" },
  { id: "lost", label: "Lost" },
] as const;

/** Craig-only source labels (not on Des intake). */
export const CRAIG_SOURCE_LABELS = [
  "ORGANIC",
  "ORGANIC SEARCH",
  "INSTAGRAM",
  "PD INSTAGRAM",
  "FACEBOOK",
  "GOOGLE",
  "GOOGLE BUSINESS",
  "WEB",
  "ONLINE",
  "REPEAT",
  "ONLINE-REPEAT",
  "WEB-REPEAT",
  "REFERRAL",
  "REFERRAL-CO",
  "R-SELF GEN",
  "SELF GEN",
  "SIGNATURE",
  "CHAT GPT",
  "MAIL FLYER",
] as const;

export const MAX_FOLLOW_UP_ATTEMPTS = 5;

export const ATTEMPT_STAGES = [
  "attempt_1",
  "attempt_2",
  "attempt_3",
  "attempt_4",
  "attempt_5",
] as const;

export function stageLabel(id: string): string {
  return LEAD_STAGES.find((s) => s.id === id)?.label ?? id.replace(/_/g, " ");
}

export function sourceLabel(id: string): string {
  return LEAD_SOURCES.find((s) => s.id === id)?.label ?? id.replace(/_/g, " ");
}

export function nextAttemptStage(current: string): string {
  const idx = ATTEMPT_STAGES.indexOf(current as (typeof ATTEMPT_STAGES)[number]);
  if (current === "new") return "attempt_1";
  if (idx >= 0 && idx < ATTEMPT_STAGES.length - 1) return ATTEMPT_STAGES[idx + 1];
  if (idx === ATTEMPT_STAGES.length - 1) return "nurturing";
  return current;
}

export function isUnscheduledStage(stage: string): boolean {
  return ![
    "appointment_set",
    "rescheduled",
    "moved_to_studio",
    "junk",
    "duplicate",
    "canceled_appointment",
  ].includes(stage);
}
