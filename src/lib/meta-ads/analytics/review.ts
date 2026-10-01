import { detectLeadSignals, LEAD_GEN_GATES } from "@/lib/meta-ads/analytics/signals";
import {
  calculateCpl,
  formatChange,
  formatChangeSize,
  formatMoney,
  formatRate,
  percentChange,
} from "@/lib/meta-ads/analytics/metrics";
import { DEMO_DATES, DEMO_HOME_SERVICES } from "@/lib/meta-ads/demo/home-services";
import type { AccountSnapshot, SnapshotAd, SnapshotCampaign } from "@/lib/meta-ads/meta/snapshot";
import type { ConfidenceLevel, MetricValue, SignalCode } from "@/lib/meta-ads/types";

export type ReviewBucket = "attention" | "opportunity" | "wait";

/** What the person making content should do with a creative. */
export type CreativeAction = "make_more" | "refresh" | "keep" | "wait";

export type CampaignReview = {
  key: string;
  name: string;
  bucket: ReviewBucket;
  spend: number;
  leads: number;
  days: number;
  cplLabel: string;
  previousCplLabel: string;
  cplChangeLabel: string;
  ctrLabel: string;
  previousCtrLabel: string;
  ctrChangeLabel: string;
  frequencyLabel: string;
  signals: SignalCode[];
  confidence: ConfidenceLevel;
  title: string;
  observation: string;
  recommendation: string;
  reasoning: string;
  suggestedBudgetChangePercent: number | null;
};

export type CreativeReview = {
  key: string;
  campaignName: string;
  name: string;
  format: string;
  angle: string;
  image: string;
  videoUrl: string | null;
  statusLabel: string;
  runningDays: number;
  action: CreativeAction;
  actionLabel: string;
  headline: string;
  contentDirection: string;
  reasoning: string;
  confidence: ConfidenceLevel;
  signals: SignalCode[];
  spend: number;
  leads: number;
  cpl: MetricValue;
  previousCpl: MetricValue;
  cplLabel: string;
  previousCplLabel: string;
  cplChangeLabel: string;
  ctr: MetricValue;
  ctrLabel: string;
  previousCtrLabel: string;
  ctrChangeLabel: string;
  frequency: MetricValue;
  previousFrequency: MetricValue;
  dailyCtr: MetricValue[];
};

export type DailyPoint = {
  date: string;
  label: string;
  period: "previous" | "current";
  spend: number;
  leads: number;
};

export type KpiReview = {
  label: string;
  value: string;
  previous: string;
  changeLabel: string;
  /** "better" and "worse" are relative to the goal, not to the arrow direction. */
  direction: "better" | "worse" | "flat" | "unknown";
};

export type SummaryPoint = {
  tone: "good" | "bad" | "neutral";
  label: string;
  detail: string;
};

export type DemoAccountReview = {
  isDemo: boolean;
  company: string;
  currentLabel: string;
  previousLabel: string;
  currentRange: string;
  previousRange: string;
  spendLabel: string;
  leadsLabel: string;
  cplLabel: string;
  targetCpl: number | null;
  targetCplLabel: string;
  syncedLabel: string | null;
  rangeDays: number;
  summary: string;
  summaryPoints: SummaryPoint[];
  kpis: KpiReview[];
  daily: DailyPoint[];
  campaigns: CampaignReview[];
  creatives: CreativeReview[];
};

const PERIOD_SPLIT = 7;

const ACTION_LABELS: Record<CreativeAction, string> = {
  make_more: "Make more like this",
  refresh: "Refresh this creative",
  keep: "Keep it running",
  wait: "Too early to judge",
};

export function reviewDemoAccount(
  scenario: typeof DEMO_HOME_SERVICES = DEMO_HOME_SERVICES,
): DemoAccountReview {
  return reviewFromSnapshot({
    isDemo: true,
    company: scenario.company,
    targetCpl: scenario.goal.targetCpl,
    currency: scenario.goal.currency,
    dates: [...DEMO_DATES],
    currentLabel: scenario.comparison.currentLabel,
    previousLabel: scenario.comparison.previousLabel,
    syncedAt: null,
    campaigns: scenario.campaigns.map((campaign) => ({
      key: campaign.key,
      name: campaign.name,
      spend: campaign.spend,
      leads: campaign.leads,
      ctr: campaign.ctr,
      frequency: campaign.frequency,
      previousCpl: campaign.previousCpl,
      previousCtr: campaign.previousCtr,
      days: campaign.days,
      dailySpend: campaign.dailySpend,
      dailyLeads: campaign.dailyLeads,
    })),
    ads: scenario.ads.map((ad) => ({
      ...ad,
      statusLabel: "Active",
    })),
  });
}

export function reviewFromSnapshot(snapshot: AccountSnapshot, windowDays?: 7 | 30 | 60): DemoAccountReview {
  const view = windowDays ? applyWindow(snapshot, windowDays) : snapshot;
  const split = Math.floor(view.dates.length / 2) || PERIOD_SPLIT;
  const targetCpl = view.targetCpl;
  const currentRange = formatRange(view.dates.slice(split));
  const previousRange = formatRange(view.dates.slice(0, split));
  const period = `${currentRange} compared with ${previousRange}`;
  const campaigns = view.campaigns.map((campaign) => reviewCampaign(campaign, targetCpl, period));
  const daily = dailySeries(view, split);

  const current = daily.filter((point) => point.period === "current");
  const previous = daily.filter((point) => point.period === "previous");
  const spend = sum(current.map((point) => point.spend));
  const leads = sum(current.map((point) => point.leads));
  const previousSpend = sum(previous.map((point) => point.spend));
  const previousLeads = sum(previous.map((point) => point.leads));
  const blendedCpl = calculateCpl(spend, leads);
  const previousCpl = calculateCpl(previousSpend, previousLeads);

  const campaignNames = new Map(view.campaigns.map((campaign) => [campaign.key, campaign.name]));
  const creatives = view.ads.map((ad) =>
    reviewCreative(ad, campaignNames.get(ad.campaignKey) ?? ad.campaignName ?? ad.campaignKey, targetCpl, period),
  );

  return {
    isDemo: view.isDemo,
    company: view.company,
    currentLabel: windowDays ? `Last ${windowDays} days` : view.currentLabel,
    previousLabel: windowDays ? `Previous ${windowDays} days` : view.previousLabel,
    currentRange,
    previousRange,
    spendLabel: formatMoney(spend),
    leadsLabel: formatCount(leads),
    cplLabel: formatMoney(blendedCpl),
    targetCpl,
    targetCplLabel: targetCpl == null ? "Not set" : formatMoney(targetCpl),
    syncedLabel: view.syncedAt
      ? new Date(view.syncedAt).toLocaleString("en-US", {
          timeZone: "America/Los_Angeles",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null,
    rangeDays: windowDays ?? split,
    summary: accountSummary(creatives, blendedCpl, targetCpl),
    summaryPoints: summaryPoints(creatives, blendedCpl, previousCpl, targetCpl),
    kpis: [
      kpi("Spend", formatMoney(spend), formatMoney(previousSpend), spend, previousSpend, "neutral"),
      kpi("Leads", formatCount(leads), formatCount(previousLeads), leads, previousLeads, "higher"),
      kpi("Cost per lead", formatMoney(blendedCpl), formatMoney(previousCpl), blendedCpl, previousCpl, "lower"),
    ],
    daily,
    campaigns,
    creatives,
  };
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatRange(dates: string[]): string {
  if (dates.length === 0) return "";
  const start = new Date(`${dates[0]}T12:00:00`);
  const end = new Date(`${dates[dates.length - 1]}T12:00:00`);
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  if (startMonth === endMonth) return `${startMonth} ${start.getDate()}–${end.getDate()}`;
  return `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function applyWindow(snapshot: AccountSnapshot, windowDays: number): AccountSnapshot {
  const need = windowDays * 2;
  const start = Math.max(0, snapshot.dates.length - need);
  const dates = snapshot.dates.slice(start);
  const split = Math.floor(dates.length / 2);
  const ads = snapshot.ads.map((ad) => {
    if (!ad.dailySpend || ad.dailySpend.length !== snapshot.dates.length) return ad;
    const dailySpend = ad.dailySpend.slice(start);
    const dailyLeads = (ad.dailyLeads ?? []).slice(start);
    const dailyImpressions = (ad.dailyImpressions ?? []).slice(start);
    const dailyClicks = (ad.dailyClicks ?? []).slice(start);
    const current = totals(dailySpend.slice(split), dailyLeads.slice(split), dailyImpressions.slice(split), dailyClicks.slice(split));
    const previous = totals(dailySpend.slice(0, split), dailyLeads.slice(0, split), dailyImpressions.slice(0, split), dailyClicks.slice(0, split));
    const freq = ad.windowFrequency?.[String(windowDays) as "7" | "30" | "60"];
    return {
      ...ad,
      dailySpend,
      dailyLeads,
      dailyImpressions,
      dailyClicks,
      dailyCtr: ad.dailyCtr.slice(start),
      spend: current.spend,
      leads: current.leads,
      ctr: current.ctr,
      previousCtr: previous.ctr,
      previousCpl: calculateCpl(previous.spend, previous.leads),
      days: dailyImpressions.slice(split).filter((value) => value > 0).length,
      frequency: freq?.current ?? null,
      previousFrequency: freq?.previous ?? null,
    };
  });
  const visibleAds = new Set(ads.map((ad) => ad.campaignKey));
  const campaigns = snapshot.campaigns
    .map((campaign) => {
      if (campaign.dailySpend.length !== snapshot.dates.length) return campaign;
      const dailySpend = campaign.dailySpend.slice(start);
      const dailyLeads = campaign.dailyLeads.slice(start);
      const dailyImpressions = (campaign.dailyImpressions ?? []).slice(start);
      const dailyClicks = (campaign.dailyClicks ?? []).slice(start);
      const current = totals(dailySpend.slice(split), dailyLeads.slice(split), dailyImpressions.slice(split), dailyClicks.slice(split));
      const previous = totals(dailySpend.slice(0, split), dailyLeads.slice(0, split), dailyImpressions.slice(0, split), dailyClicks.slice(0, split));
      return {
        ...campaign,
        dailySpend,
        dailyLeads,
        dailyImpressions,
        dailyClicks,
        spend: current.spend,
        leads: current.leads,
        ctr: current.ctr,
        previousCtr: previous.ctr,
        previousCpl: calculateCpl(previous.spend, previous.leads),
        days: dailyImpressions.slice(split).filter((value) => value > 0).length,
      };
    })
    .filter((campaign) => campaign.spend > 0 || (campaign.previousCpl != null && campaign.dailySpend.slice(0, split).some((value) => (value ?? 0) > 0)) || visibleAds.has(campaign.key));

  return {
    ...snapshot,
    dates,
    currentLabel: `Last ${windowDays} days`,
    previousLabel: `Previous ${windowDays} days`,
    accountDaily: snapshot.accountDaily?.slice(start),
    campaigns,
    ads,
  };
}

function totals(spend: MetricValue[], leads: MetricValue[], impressions: number[], clicks: number[]) {
  const spent = sum(spend.map((value) => value ?? 0));
  const leadCount = sum(leads.map((value) => value ?? 0));
  const shown = sum(impressions);
  const clicked = sum(clicks);
  return { spend: spent, leads: leadCount, ctr: shown > 0 ? clicked / shown : null };
}

function dailySeries(snapshot: AccountSnapshot, split = PERIOD_SPLIT): DailyPoint[] {
  return snapshot.dates.map((date, index) => {
    const fromAccount = snapshot.accountDaily?.[index];
    const spend = fromAccount
      ? fromAccount.spend
      : sum(snapshot.campaigns.map((campaign) => campaign.dailySpend[index] ?? 0));
    const leads = fromAccount
      ? fromAccount.leads
      : sum(snapshot.campaigns.map((campaign) => campaign.dailyLeads[index] ?? 0));
    const day = new Date(`${date}T12:00:00`);
    return {
      date,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      period: index < split ? "previous" : "current",
      spend: Math.round(spend * 100) / 100,
      leads,
    };
  });
}

function kpi(
  label: string,
  value: string,
  previous: string,
  current: MetricValue,
  prior: MetricValue,
  goal: "higher" | "lower" | "neutral",
): KpiReview {
  const change = percentChange(current, prior);
  let direction: KpiReview["direction"] = "unknown";
  if (change != null) {
    if (Math.abs(change) < 0.02 || goal === "neutral") direction = "flat";
    else if (goal === "higher") direction = change > 0 ? "better" : "worse";
    else direction = change < 0 ? "better" : "worse";
  }
  return { label, value, previous, changeLabel: formatChange(change), direction };
}

function reviewCreative(
  ad: SnapshotAd,
  campaignName: string,
  targetCpl: number | null,
  period: string,
): CreativeReview {
  const detected = detectLeadSignals({
    spend: ad.spend,
    leads: ad.leads,
    ctr: ad.ctr,
    frequency: ad.frequency,
    previousCpl: ad.previousCpl,
    previousCtr: ad.previousCtr,
    days: ad.days,
    targetCpl,
  });

  const guidance = creativeGuidance(ad, detected, targetCpl, period);

  return {
    key: ad.key,
    campaignName,
    name: ad.name,
    format: ad.format,
    angle: ad.angle,
    image: ad.image,
    videoUrl: ad.videoUrl ?? null,
    statusLabel: ad.statusLabel,
    runningDays: ad.runningDays,
    action: guidance.action,
    actionLabel: ACTION_LABELS[guidance.action],
    headline: guidance.headline,
    contentDirection: guidance.contentDirection,
    reasoning: guidance.reasoning,
    confidence: detected.confidence,
    signals: detected.signals,
    spend: ad.spend,
    leads: ad.leads,
    cpl: detected.cpl,
    previousCpl: ad.previousCpl,
    cplLabel: formatMoney(detected.cpl),
    previousCplLabel: formatMoney(ad.previousCpl),
    cplChangeLabel: formatChange(detected.cplChange),
    ctr: ad.ctr,
    ctrLabel: formatRate(ad.ctr),
    previousCtrLabel: formatRate(ad.previousCtr),
    ctrChangeLabel: formatChange(detected.ctrChange),
    frequency: ad.frequency,
    previousFrequency: ad.previousFrequency,
    dailyCtr: ad.dailyCtr,
  };
}

function creativeGuidance(
  ad: SnapshotAd,
  detected: ReturnType<typeof detectLeadSignals>,
  targetCpl: number | null,
  period: string,
): { action: CreativeAction; headline: string; contentDirection: string; reasoning: string } {
  if (ad.spend <= 0) {
    return {
      action: "wait",
      headline: "No spend in this period.",
      contentDirection: "It is not in front of people in this period, so there is nothing new to make from it yet.",
      reasoning: `Over ${period}, this ad had no delivery in the latest window.`,
    };
  }

  if (!detected.sufficient) {
    return {
      action: "wait",
      headline: `${formatCount(ad.leads)} ${ad.leads === 1 ? "lead" : "leads"} from ${formatMoney(ad.spend)} in ${ad.days} days.`,
      contentDirection: `Leave ${ad.name} running. ${formatCount(ad.leads)} ${ad.leads === 1 ? "lead" : "leads"} over ${ad.days} days is short of the ${LEAD_GEN_GATES.minimumLeads}-lead minimum, so changing the creative now would be a guess.`,
      reasoning: `The account minimum is ${LEAD_GEN_GATES.minimumDays} days, ${LEAD_GEN_GATES.minimumLeads} leads, and ${formatMoney(LEAD_GEN_GATES.minimumSpend)} of spend. This ad is short of that, so any call would be a guess.`,
    };
  }

  if (detected.signals.includes("POSSIBLE_CREATIVE_FATIGUE")) {
    return {
      action: "refresh",
      headline: `Clicks fell ${formatChangeSize(detected.ctrChange)} while lead cost rose to ${formatMoney(detected.cpl)}.`,
      contentDirection: `Make a new version instead of re-running this cut. Keep the ${ad.angle.toLowerCase()} idea, but change the opening shot, the room, or the person on camera so repeat viewers see something new.`,
      reasoning: `Over ${period}, CTR dropped from ${formatRate(ad.previousCtr)} to ${formatRate(ad.ctr)} and CPL went from ${formatMoney(ad.previousCpl)} to ${formatMoney(detected.cpl)}. The average person has now seen it ${ad.frequency?.toFixed(1)} times. Together that can point to creative fatigue. It does not prove the creative is the cause.`,
    };
  }

  if (detected.signals.includes("POTENTIAL_SCALE_OPPORTUNITY") && targetCpl != null) {
    return {
      action: "make_more",
      headline: `${formatMoney(detected.cpl)} per lead, ${formatMoney(targetCpl - (detected.cpl ?? 0))} under target, with clicks rising.`,
      contentDirection: `This is the strongest creative in the account. Make two or three new ${ad.format.split(" · ")[0]?.toLowerCase()} ads in the same ${ad.angle.toLowerCase()} style using different rooms or finishes.`,
      reasoning: `Over ${period}, CPL improved from ${formatMoney(ad.previousCpl)} to ${formatMoney(detected.cpl)} on ${ad.leads} leads, and CTR rose from ${formatRate(ad.previousCtr)} to ${formatRate(ad.ctr)}. People have seen it ${ad.frequency?.toFixed(1)} times on average, so there is still room before it wears out.`,
    };
  }

  if (detected.signals.includes("CPL_ABOVE_TARGET") && targetCpl != null) {
    return {
      action: "refresh",
      headline: `${formatMoney(detected.cpl)} per lead, above the ${formatMoney(targetCpl)} target.`,
      contentDirection: `Test a different opening or angle before making more of this style.`,
      reasoning: `Over ${period}, lead cost stayed meaningfully above target on a sample large enough to notice.`,
    };
  }

  return {
    action: "keep",
    headline:
      targetCpl == null
        ? `${formatMoney(detected.cpl)} per lead.`
        : `${formatMoney(detected.cpl)} per lead, close to the ${formatMoney(targetCpl)} target.`,
    contentDirection: `No new content needed for this one. Let it keep running while you put new effort into the stronger creative.`,
    reasoning:
      targetCpl == null
        ? `No cost-per-lead target is saved. Over ${period}, CPL moved ${formatChange(detected.cplChange)} and CTR moved ${formatChange(detected.ctrChange)}. Neither change is large enough to act on.`
        : `Over ${period}, CPL moved ${formatChange(detected.cplChange)} and CTR moved ${formatChange(detected.ctrChange)}. Neither change is large enough to act on.`,
  };
}

function reviewCampaign(
  campaign: SnapshotCampaign,
  targetCpl: number | null,
  period: string,
): CampaignReview {
  const detected = detectLeadSignals({
    spend: campaign.spend,
    leads: campaign.leads,
    ctr: campaign.ctr,
    frequency: campaign.frequency,
    previousCpl: campaign.previousCpl,
    previousCtr: campaign.previousCtr,
    days: campaign.days,
    targetCpl,
  });

  const copy = campaignCopy(campaign.name, campaign, detected, targetCpl, period);

  return {
    key: campaign.key,
    name: campaign.name,
    bucket: copy.bucket,
    spend: campaign.spend,
    leads: campaign.leads,
    days: campaign.days,
    cplLabel: formatMoney(detected.cpl),
    previousCplLabel: formatMoney(campaign.previousCpl),
    cplChangeLabel: formatChange(detected.cplChange),
    ctrLabel: formatRate(campaign.ctr),
    previousCtrLabel: formatRate(campaign.previousCtr),
    ctrChangeLabel: formatChange(detected.ctrChange),
    frequencyLabel: campaign.frequency == null ? "—" : campaign.frequency.toFixed(1),
    signals: detected.signals,
    confidence: detected.confidence,
    title: copy.title,
    observation: copy.observation,
    recommendation: copy.recommendation,
    reasoning: copy.reasoning,
    suggestedBudgetChangePercent: copy.suggestedBudgetChangePercent,
  };
}

function campaignCopy(
  name: string,
  campaign: SnapshotCampaign,
  detected: ReturnType<typeof detectLeadSignals>,
  targetCpl: number | null,
  period: string,
): Pick<
  CampaignReview,
  "bucket" | "title" | "observation" | "recommendation" | "reasoning" | "suggestedBudgetChangePercent"
> {
  if (!detected.sufficient) {
    return {
      bucket: "wait",
      title: "Not enough data",
      observation: `${name} has ${formatMoney(campaign.spend)} of spend and ${formatCount(campaign.leads)} ${campaign.leads === 1 ? "lead" : "leads"} across ${campaign.days} days.`,
      recommendation: "Wait for additional data before making optimization decisions.",
      reasoning: `The account minimum is 7 days, 5 leads, and $100 of spend. ${name} is short of that sample, so a change would be a guess.`,
      suggestedBudgetChangePercent: null,
    };
  }

  if (detected.signals.includes("POSSIBLE_CREATIVE_FATIGUE")) {
    return {
      bucket: "attention",
      title: "Possible creative fatigue",
      observation: `${name} CPL moved from ${formatMoney(campaign.previousCpl)} to ${formatMoney(detected.cpl)} (${formatChange(detected.cplChange)}).`,
      recommendation: "Consider refreshing creative before allocating additional budget.",
      reasoning: `Over ${period}, CTR declined and CPL deteriorated while frequency sat at ${campaign.frequency?.toFixed(1)}. That combination can indicate fatigue. It does not prove the creative caused the change.`,
      suggestedBudgetChangePercent: null,
    };
  }

  if (detected.signals.includes("POTENTIAL_SCALE_OPPORTUNITY") && targetCpl != null) {
    return {
      bucket: "opportunity",
      title: "Possible room to scale",
      observation: `${name} CPL is ${formatMoney(detected.cpl)} against a ${formatMoney(targetCpl)} target.`,
      recommendation: "Consider increasing budget about 10%.",
      reasoning: `Over ${period}, CPL stayed below target and CTR improved, with ${campaign.leads} leads. A small budget step is the change to review, not a large jump.`,
      suggestedBudgetChangePercent: 10,
    };
  }

  if (
    targetCpl != null &&
    (detected.signals.includes("UNDERPERFORMING") || detected.signals.includes("CPL_ABOVE_TARGET"))
  ) {
    return {
      bucket: "attention",
      title: "Above the CPL target",
      observation: `${name} CPL is ${formatMoney(detected.cpl)} against a ${formatMoney(targetCpl)} target.`,
      recommendation: "Review this campaign before adding budget.",
      reasoning: `Over ${period}, lead cost is meaningfully above the target on a large enough sample to notice.`,
      suggestedBudgetChangePercent: null,
    };
  }

  return {
    bucket: "wait",
    title: "No change recommended",
    observation: `${name} does not show a strong enough pattern to act on.`,
    recommendation: "Leave this campaign as it is and keep watching.",
    reasoning: `Over ${period}, the measured movement does not clear the account's action gates.`,
    suggestedBudgetChangePercent: null,
  };
}

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function summaryPoints(
  creatives: CreativeReview[],
  blendedCpl: number | null,
  previousCpl: number | null,
  targetCpl: number | null,
): SummaryPoint[] {
  const delivered = creatives.filter((creative) => creative.spend > 0);
  const idle = creatives.length - delivered.length;
  const pick = (action: CreativeAction) => delivered.filter((creative) => creative.action === action);
  const change = percentChange(blendedCpl, previousCpl);
  const points: SummaryPoint[] = [
    {
      tone: change == null || Math.abs(change) < 0.02 ? "neutral" : change < 0 ? "good" : "bad",
      label: `Cost per lead ${formatMoney(blendedCpl)}`,
      detail:
        change == null
          ? targetCpl == null
            ? "No target saved yet."
            : `Target ${formatMoney(targetCpl)}.`
          : `${formatChange(change)} vs ${formatMoney(previousCpl)} in the previous period${targetCpl == null ? ". No target saved yet." : `. Target ${formatMoney(targetCpl)}.`}`,
    },
  ];
  const makeMore = pick("make_more");
  const refresh = pick("refresh");
  const hold = [...pick("keep"), ...pick("wait")];
  if (makeMore.length) {
    points.push({ tone: "good", label: "Make more like", detail: nameList(makeMore.map((creative) => creative.name)) });
  }
  if (refresh.length) {
    points.push({ tone: "bad", label: "Refresh", detail: nameList(refresh.map((creative) => creative.name)) });
  }
  if (hold.length) {
    points.push({
      tone: "neutral",
      label: `${hold.length} ${hold.length === 1 ? "ad" : "ads"} to leave alone`,
      detail: "Not enough leads yet to justify changing the creative.",
    });
  }
  if (idle > 0) {
    points.push({
      tone: "neutral",
      label: `${idle} switched on, no spend`,
      detail: "Turned on in Meta but not delivering in this period.",
    });
  }
  return points;
}

function accountSummary(
  creatives: CreativeReview[],
  blendedCpl: number | null,
  targetCpl: number | null,
): string {
  const names = (action: CreativeAction) =>
    creatives.filter((creative) => creative.action === action).map((creative) => creative.name);
  const makeMore = names("make_more");
  const refresh = names("refresh");
  const wait = names("wait");
  const parts = [
    targetCpl == null
      ? `Cost per lead is ${formatMoney(blendedCpl)} in this period. No target is saved yet, so the calls below use sample size and the change versus the previous period.`
      : `Cost per lead is ${formatMoney(blendedCpl)} in this period against a ${formatMoney(targetCpl)} target.`,
  ];
  if (makeMore.length) parts.push(`${makeMore.join(" and ")} is working. Make more in that style.`);
  if (refresh.length) parts.push(`${refresh.join(" and ")} is wearing out and needs a new version.`);
  if (wait.length === 1) parts.push(`${wait[0]} does not have enough leads to justify a change.`);
  else if (wait.length) parts.push(`${nameList(wait)} do not have enough leads to justify a change.`);
  return parts.join(" ");
}
