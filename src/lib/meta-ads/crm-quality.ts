import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  EMPTY_LEAD_PERIOD,
  type LeadQualityPeriod,
  type LeadQualityReport,
} from "@/lib/meta-ads/analytics/lead-quality";

const SOURCE_NOTE =
  "These counts are Inspired Closets CRM leads whose source is Facebook, Instagram, or Paid Instagram Ads, by the date the lead was created. The CRM does not store a Meta ad id, so this is not split by ad. Revenue is the sold amount recorded on the lead.";

const META_SOURCES = new Set(["facebook", "instagram", "paid_instagram_ads"]);

const APPOINTMENT_STAGES = new Set(["appointment_set", "rescheduled", "canceled_appointment"]);
const ATTEMPT_STAGES = new Set(["attempt_1", "attempt_2", "attempt_3", "attempt_4", "attempt_5"]);

type LeadRow = {
  source: string | null;
  source_raw: string | null;
  stage: string | null;
  junk_reason: string | null;
  nurturing_reason: string | null;
  pipeline_status: string | null;
  pipeline_sold_cents: number | null;
  pipeline_signed: boolean | null;
  converted_job_id: string | null;
  created_at: string;
};

export async function loadLeadQuality(bounds: {
  previousStart: string;
  currentStart: string;
  currentEnd: string;
}): Promise<LeadQualityReport> {
  if (!bounds.previousStart || !bounds.currentEnd) {
    return unavailable("The ads snapshot has no dates to match against the CRM.");
  }
  if (!isDbConfigured()) {
    return unavailable("The CRM is not connected in this environment, so qualified leads, appointments, and customers cannot be counted.");
  }

  try {
    const rows = await fetchLeads(bounds.previousStart, bounds.currentEnd);
    const current = tally(rows.filter((row) => inRange(row.created_at, bounds.currentStart, bounds.currentEnd)));
    const previous = tally(
      rows.filter((row) => inRange(row.created_at, bounds.previousStart, dayBefore(bounds.currentStart))),
    );
    return {
      available: true,
      reason: null,
      matchedToAds: false,
      sourceNote: SOURCE_NOTE,
      current,
      previous,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The CRM query failed.";
    return unavailable(`Qualified leads could not be loaded. ${message}`);
  }
}

export function demoLeadQuality(): LeadQualityReport {
  return unavailable(
    "This is the demo account. Qualified leads, appointments, and customers come from the Inspired Closets CRM, which is not tied to the sample ads.",
  );
}

function unavailable(reason: string): LeadQualityReport {
  return {
    available: false,
    reason,
    matchedToAds: false,
    sourceNote: SOURCE_NOTE,
    current: EMPTY_LEAD_PERIOD,
    previous: EMPTY_LEAD_PERIOD,
  };
}

async function fetchLeads(start: string, end: string): Promise<LeadRow[]> {
  const supabase = getSupabaseAdmin();
  const from = shiftDate(start, -1);
  const to = shiftDate(end, 2);
  const rows: LeadRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("ic_leads")
      .select(
        "source, source_raw, stage, junk_reason, nurturing_reason, pipeline_status, pipeline_sold_cents, pipeline_signed, converted_job_id, created_at",
      )
      .is("deleted_at", null)
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lt("created_at", `${to}T00:00:00.000Z`)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as LeadRow[];
    rows.push(...page.filter(isMetaLead));
    if (page.length < pageSize) break;
  }
  return rows;
}

function isMetaLead(row: LeadRow): boolean {
  if (row.source && META_SOURCES.has(row.source)) return true;
  const raw = (row.source_raw ?? "").toLowerCase();
  return /facebook|instagram|\bmeta\b|paid social/.test(raw);
}

function tally(rows: LeadRow[]): LeadQualityPeriod {
  const counts: LeadQualityPeriod = {
    leads: rows.length,
    qualified: 0,
    appointments: 0,
    customers: 0,
    revenueCents: 0,
    duplicates: 0,
    spam: 0,
    unreachable: 0,
    unresolved: 0,
    notQualified: 0,
  };
  for (const row of rows) {
    const stage = row.stage ?? "";
    const customer =
      row.pipeline_status === "sold" ||
      row.pipeline_signed === true ||
      (row.pipeline_sold_cents ?? 0) > 0 ||
      Boolean(row.converted_job_id);
    if (APPOINTMENT_STAGES.has(stage)) counts.appointments = (counts.appointments ?? 0) + 1;
    if (customer) {
      counts.customers = (counts.customers ?? 0) + 1;
      counts.revenueCents = (counts.revenueCents ?? 0) + (row.pipeline_sold_cents ?? 0);
      counts.qualified = (counts.qualified ?? 0) + 1;
      continue;
    }
    if (stage === "duplicate") {
      counts.duplicates = (counts.duplicates ?? 0) + 1;
      continue;
    }
    if (stage === "junk" && row.junk_reason === "spam_or_solicitor") {
      counts.spam = (counts.spam ?? 0) + 1;
      continue;
    }
    if (stage === "junk") {
      counts.notQualified = (counts.notQualified ?? 0) + 1;
      continue;
    }
    if (ATTEMPT_STAGES.has(stage) || row.nurturing_reason === "no_contact_made") {
      counts.unreachable = (counts.unreachable ?? 0) + 1;
      continue;
    }
    if (stage === "new") {
      counts.unresolved = (counts.unresolved ?? 0) + 1;
      continue;
    }
    if (!customer) counts.qualified = (counts.qualified ?? 0) + 1;
  }
  return counts;
}

function inRange(createdAt: string, start: string, end: string): boolean {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(createdAt));
  return day >= start && day <= end;
}

function dayBefore(ymd: string): string {
  return shiftDate(ymd, -1);
}

function shiftDate(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
