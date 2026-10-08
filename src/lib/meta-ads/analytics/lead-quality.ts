/** CRM outcome counts for a period. Null means the CRM could not be read. */

export type LeadQualityPeriod = {
  leads: number | null;
  qualified: number | null;
  appointments: number | null;
  customers: number | null;
  revenueCents: number | null;
  duplicates: number | null;
  spam: number | null;
  unreachable: number | null;
  unresolved: number | null;
  notQualified: number | null;
};

export type LeadQualityReport = {
  available: boolean;
  /** Why the counts are missing, when available is false. */
  reason: string | null;
  /** CRM leads do not store a Meta ad id, so counts are account-level. */
  matchedToAds: false;
  sourceNote: string;
  current: LeadQualityPeriod;
  previous: LeadQualityPeriod;
};

export const EMPTY_LEAD_PERIOD: LeadQualityPeriod = {
  leads: null,
  qualified: null,
  appointments: null,
  customers: null,
  revenueCents: null,
  duplicates: null,
  spam: null,
  unreachable: null,
  unresolved: null,
  notQualified: null,
};
