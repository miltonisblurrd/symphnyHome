import { LEAD_GEN_GATES } from "@/lib/meta-ads/analytics/signals";
import { formatChange, formatMoney, formatRate } from "@/lib/meta-ads/analytics/metrics";
import type { LeadQualityReport } from "@/lib/meta-ads/analytics/lead-quality";
import type { BreakdownPoint } from "@/lib/meta-ads/meta/snapshot";
import type { MetricValue, SignalCode } from "@/lib/meta-ads/types";

/** What to do with an ad. Separate from the content-plan wording. */
export type AdDecision = "keep" | "watch" | "test" | "replace";

export const DECISION_LABELS: Record<AdDecision, string> = {
  keep: "Keep running",
  watch: "Watch",
  test: "Test a variation",
  replace: "Consider replacing",
};

export type ChangeExplanation = {
  observed: string[];
  possible: string[];
  notProven: string[];
  nextCheck: string[];
};

export type BreakdownTableRow = {
  label: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  leads: number;
  ctr: MetricValue;
  cpl: MetricValue;
};

export function decisionFor(input: {
  spend: number;
  sufficient: boolean;
  signals: SignalCode[];
}): AdDecision {
  if (input.spend <= 0 || !input.sufficient) return "watch";
  if (input.signals.includes("POSSIBLE_CREATIVE_FATIGUE") || input.signals.includes("UNDERPERFORMING")) {
    return "replace";
  }
  if (input.signals.includes("CTR_DECLINING") || input.signals.includes("CPL_ABOVE_TARGET")) return "test";
  return "keep";
}

export function sampleNote(leads: number, days: number, spend: number): string | null {
  if (leads >= LEAD_GEN_GATES.minimumLeads && days >= LEAD_GEN_GATES.minimumDays && spend >= LEAD_GEN_GATES.minimumSpend) {
    return null;
  }
  if (leads < LEAD_GEN_GATES.minimumLeads) {
    const noun = leads === 1 ? "lead" : "leads";
    return `${trimCount(leads)} ${noun}; below the ${LEAD_GEN_GATES.minimumLeads}-lead decision minimum.`;
  }
  return `${trimCount(leads)} leads across ${days} days and ${formatMoney(spend)}. Below the ${LEAD_GEN_GATES.minimumDays}-day and ${formatMoney(LEAD_GEN_GATES.minimumSpend)} decision minimum.`;
}

export function aggregateBreakdown(points: BreakdownPoint[], dates: Set<string>): BreakdownTableRow[] {
  const byLabel = new Map<string, BreakdownTableRow>();
  for (const point of points) {
    if (!dates.has(point.date)) continue;
    const row = byLabel.get(point.label) ?? {
      label: point.label,
      spend: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: null,
      leads: 0,
      ctr: null,
      cpl: null,
    };
    row.spend += point.spend;
    row.impressions += point.impressions;
    row.clicks += point.clicks;
    row.leads += point.leads;
    if (point.linkClicks != null) row.linkClicks = (row.linkClicks ?? 0) + point.linkClicks;
    byLabel.set(point.label, row);
  }
  return [...byLabel.values()]
    .map((row) => ({
      ...row,
      spend: Math.round(row.spend * 100) / 100,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : null,
      cpl: row.leads > 0 ? row.spend / row.leads : null,
    }))
    .filter((row) => row.spend > 0 || row.impressions > 0 || row.leads > 0)
    .sort((a, b) => b.spend - a.spend || b.leads - a.leads);
}

type ExplainInput = {
  currentLabel: string;
  previousLabel: string;
  spend: number;
  previousSpend: number;
  leads: number;
  previousLeads: number;
  cpl: MetricValue;
  previousCpl: MetricValue;
  impressions: number | null;
  previousImpressions: number | null;
  ctr: MetricValue;
  previousCtr: MetricValue;
  hasBreakdowns: boolean;
  hasFormStarts: boolean;
  ads: Array<{
    name: string;
    spend: number;
    leads: number;
    frequency: MetricValue;
    signals: SignalCode[];
    sampleNote: string | null;
  }>;
};

export function explainPerformance(input: ExplainInput, quality: LeadQualityReport | null): ChangeExplanation {
  const observed: string[] = [];
  const possible: string[] = [];
  const notProven: string[] = [];
  const nextCheck: string[] = [];

  observed.push(
    `Leads were ${trimCount(input.leads)} in ${input.currentLabel.toLowerCase()}, compared with ${trimCount(input.previousLeads)} in ${input.previousLabel.toLowerCase()} (${formatChange(percent(input.leads, input.previousLeads))}).`,
  );
  observed.push(
    `Spend was ${formatMoney(input.spend)}, compared with ${formatMoney(input.previousSpend)} (${formatChange(percent(input.spend, input.previousSpend))}). Cost per lead is ${formatMoney(input.cpl)}, compared with ${formatMoney(input.previousCpl)} (${formatChange(percent(input.cpl, input.previousCpl))}).`,
  );
  if (input.impressions != null && input.previousImpressions != null) {
    observed.push(
      `Impressions were ${Math.round(input.impressions).toLocaleString("en-US")}, compared with ${Math.round(input.previousImpressions).toLocaleString("en-US")}. Click-through rate moved from ${formatRate(input.previousCtr)} to ${formatRate(input.ctr)}.`,
    );
  }

  const fatigued = input.ads.filter((ad) => ad.signals.includes("POSSIBLE_CREATIVE_FATIGUE"));
  const deliveryDrop =
    input.impressions != null &&
    input.previousImpressions != null &&
    input.previousImpressions > 0 &&
    input.impressions < input.previousImpressions * 0.85;
  const ctrDrop =
    input.ctr != null && input.previousCtr != null && input.previousCtr > 0 && input.ctr < input.previousCtr * 0.85;
  const leadsDrop = input.previousLeads > 0 && input.leads < input.previousLeads * 0.85;

  if (fatigued.length) {
    possible.push(
      `${listNames(fatigued.map((ad) => ad.name))} combined a lower click-through rate, a higher cost per lead, and a frequency of ${fatigued[0]?.frequency?.toFixed(1) ?? "—"}. Creative fatigue is one possible explanation.`,
    );
  }
  if (deliveryDrop && !ctrDrop) {
    possible.push("Impressions fell while the click-through rate held up. That pattern can mean less delivery, a budget change, or the auction, rather than the creative itself.");
  }
  if (ctrDrop && !deliveryDrop) {
    possible.push("People saw the ads about as often, and a smaller share clicked. That can be the creative, the audience, or the placement mix.");
  }
  if (leadsDrop && input.ctr != null && input.previousCtr != null && Math.abs(input.ctr - input.previousCtr) < input.previousCtr * 0.1) {
    possible.push("Clicks held up better than leads. The form, the landing page, or the lead action could be where the drop is.");
  }
  if (possible.length === 0) {
    possible.push("No single pattern in spend, leads, clicks, and frequency is strong enough to name a cause.");
  }

  notProven.push("These numbers do not prove that a creative, an audience, or the form caused the change.");
  notProven.push("Creative fatigue is a possibility only when click-through rate, cost per lead, and frequency move together. Frequency by itself is not proof.");
  if (quality?.available) {
    notProven.push("CRM outcomes are for Facebook and Instagram leads created in the period. They are not matched to an ad, so they cannot prove which creative produced the customers.");
  } else {
    notProven.push("Meta does not say whether a lead was qualified, booked, spam, or a duplicate. A higher cost per lead can still be acceptable if the leads are better.");
  }
  if (!input.hasBreakdowns) {
    notProven.push("This sync does not yet split results by placement, device, age, or location, so a shift in where ads ran is not visible.");
  }

  const small = input.ads.filter((ad) => ad.sampleNote && ad.spend > 0);
  if (small.length) {
    nextCheck.push(`${listNames(small.map((ad) => ad.name))} ${small.length === 1 ? "is" : "are"} under the 5-lead decision minimum. Wait before changing ${small.length === 1 ? "it" : "them"}.`);
  }
  if (!input.hasFormStarts) {
    nextCheck.push("Meta did not report form starts. Landing-page views and lead completions are the funnel steps available until a form-start action is on the pixel or instant form.");
  }
  if (!input.hasBreakdowns) {
    nextCheck.push("The next Meta sync should add Facebook versus Instagram, Feed, Stories, Reels, device, age, and location.");
  } else {
    nextCheck.push("Compare the placement and platform tables. A spend shift toward Stories or Reels, with a worse cost per lead there, points at delivery rather than the creative.");
  }
  if (!quality?.available) {
    nextCheck.push(quality?.reason ?? "Connect the office CRM to see qualified leads, appointments, customers, duplicates, spam, and unreachable leads.");
  } else {
    nextCheck.push("Compare qualified leads and appointments with Meta's lead count. A gap means some Meta leads never reached the CRM, or they were logged under another source.");
  }

  return { observed, possible, notProven, nextCheck };
}

function percent(current: MetricValue, previous: MetricValue): MetricValue {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function trimCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "An ad";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
