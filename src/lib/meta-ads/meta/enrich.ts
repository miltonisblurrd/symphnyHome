import { countActions } from "@/lib/meta-ads/meta/actions";
import { graphGetAll } from "@/lib/meta-ads/meta/graph";
import type {
  AccountPeriodMetrics,
  AccountSnapshot,
  BreakdownDaily,
  BreakdownPoint,
  SnapshotCampaign,
} from "@/lib/meta-ads/meta/snapshot";
import type { MetricValue } from "@/lib/meta-ads/types";

const WINDOWS = [7, 30, 60] as const;

type InsightRow = {
  date_start?: string;
  campaign_id?: string;
  adset_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  attribution_setting?: string;
  publisher_platform?: string;
  platform_position?: string;
  impression_device?: string;
  age?: string;
  gender?: string;
  region?: string;
};

type ReadResult = { rows: InsightRow[]; error: string | null };

export type DeliveryContext = {
  attributionSetting: string | null;
  accountWindows: NonNullable<AccountSnapshot["accountWindows"]>;
  breakdownDaily: BreakdownDaily;
  campaignWindows: Map<
    string,
    {
      frequency: NonNullable<SnapshotCampaign["windowFrequency"]>;
      reach: NonNullable<SnapshotCampaign["windowReach"]>;
    }
  >;
};

const EMPTY_BREAKDOWNS: BreakdownDaily = {
  platform: [],
  placement: [],
  device: [],
  ageGender: [],
  location: [],
  audience: [],
};

export async function loadDeliveryContext(accountId: string, dates: string[]): Promise<DeliveryContext> {
  const since = dates[0];
  const until = dates[dates.length - 1];
  if (!since || !until) {
    return { attributionSetting: null, accountWindows: {}, breakdownDaily: EMPTY_BREAKDOWNS, campaignWindows: new Map() };
  }

  const breakdownJobs: Array<{ key: keyof BreakdownDaily; params: Record<string, string> }> = [
    { key: "platform", params: insightParams(since, until, "account", "1", "publisher_platform") },
    { key: "placement", params: insightParams(since, until, "account", "1", "publisher_platform,platform_position") },
    { key: "device", params: insightParams(since, until, "account", "1", "impression_device") },
    { key: "ageGender", params: insightParams(since, until, "account", "1", "age,gender") },
    { key: "location", params: insightParams(since, until, "account", "1", "region") },
    { key: "audience", params: insightParams(since, until, "adset", "1") },
  ];

  const windowJobs = WINDOWS.flatMap((days) => {
    const current = rangeFor(dates, days, "current");
    const previous = rangeFor(dates, days, "previous");
    return [
      { days, period: "current" as const, params: insightParams(current.since, current.until, "account", "all_days") },
      { days, period: "previous" as const, params: insightParams(previous.since, previous.until, "account", "all_days") },
      { days, period: "current" as const, params: insightParams(current.since, current.until, "campaign", "all_days"), campaign: true },
      { days, period: "previous" as const, params: insightParams(previous.since, previous.until, "campaign", "all_days"), campaign: true },
    ];
  });

  const [breakdownResults, windowResults] = await Promise.all([
    mapPool(breakdownJobs, 4, (job) => readInsights(accountId, job.params)),
    mapPool(windowJobs, 4, (job) => readInsights(accountId, job.params)),
  ]);

  const breakdownDaily: BreakdownDaily = { ...EMPTY_BREAKDOWNS };
  breakdownJobs.forEach((job, index) => {
    breakdownDaily[job.key] = (breakdownResults[index]?.rows ?? []).flatMap((row) => {
      const point = toPoint(row, job.key);
      return point ? [point] : [];
    });
  });

  const accountWindows: NonNullable<AccountSnapshot["accountWindows"]> = {};
  const campaignWindows = new Map<string, DeliveryContext["campaignWindows"] extends Map<string, infer V> ? V : never>();
  let attributionSetting: string | null = null;

  windowJobs.forEach((job, index) => {
    const rows = windowResults[index]?.rows ?? [];
    if (!job.campaign) {
      const metrics = periodOf(rows[0]);
      const bucket = accountWindows[job.days] ?? { current: emptyPeriod(), previous: emptyPeriod() };
      bucket[job.period] = metrics;
      accountWindows[job.days] = bucket;
      if (!attributionSetting && rows[0]?.attribution_setting) attributionSetting = rows[0].attribution_setting;
      return;
    }
    for (const row of rows) {
      if (!row.campaign_id) continue;
      const entry = campaignWindows.get(row.campaign_id) ?? { frequency: {}, reach: {} };
      const slot = entry.frequency[job.days] ?? { current: null, previous: null };
      const reachSlot = entry.reach[job.days] ?? { current: null, previous: null };
      slot[job.period] = finiteOrNull(row.frequency);
      reachSlot[job.period] = finiteOrNull(row.reach);
      entry.frequency[job.days] = slot;
      entry.reach[job.days] = reachSlot;
      campaignWindows.set(row.campaign_id, entry);
    }
  });

  return { attributionSetting, accountWindows, breakdownDaily, campaignWindows };
}

function insightParams(
  since: string,
  until: string,
  level: string,
  increment: string,
  breakdowns?: string,
): Record<string, string> {
  const params: Record<string, string> = {
    level,
    time_increment: increment,
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_id,adset_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,attribution_setting",
    limit: "500",
  };
  if (breakdowns) params.breakdowns = breakdowns;
  return params;
}

async function readInsights(accountId: string, params: Record<string, string>): Promise<ReadResult> {
  try {
    const rows = await graphGetAll<InsightRow>(`${accountId}/insights`, params);
    return { rows, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta insights failed";
    const fallback = {
      ...params,
      fields: "campaign_id,adset_name,spend,impressions,reach,clicks,actions",
    };
    try {
      const rows = await graphGetAll<InsightRow>(`${accountId}/insights`, fallback);
      return { rows, error: null };
    } catch (retryError) {
      console.error("Meta ads context skipped", retryError instanceof Error ? retryError.message : retryError);
      return { rows: [], error: message };
    }
  }
}

function rangeFor(dates: string[], days: number, period: "current" | "previous"): { since: string; until: string } {
  if (period === "current") {
    return { since: dates[dates.length - days] ?? dates[0], until: dates[dates.length - 1] };
  }
  return {
    since: dates[dates.length - days * 2] ?? dates[0],
    until: dates[dates.length - days - 1] ?? dates[0],
  };
}

function toPoint(row: InsightRow, key: keyof BreakdownDaily): BreakdownPoint | null {
  if (!row.date_start) return null;
  const label = labelFor(row, key);
  if (!label) return null;
  const actions = countActions(row.actions);
  return {
    date: row.date_start,
    label,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: row.inline_link_clicks == null ? null : Number(row.inline_link_clicks),
    leads: actions.leads,
  };
}

function labelFor(row: InsightRow, key: keyof BreakdownDaily): string | null {
  if (key === "platform") return row.publisher_platform ? platformName(row.publisher_platform) : null;
  if (key === "placement") {
    if (!row.publisher_platform || !row.platform_position) return null;
    return `${platformName(row.publisher_platform)} · ${placementName(row.platform_position)}`;
  }
  if (key === "device") return row.impression_device ? deviceName(row.impression_device) : null;
  if (key === "ageGender") {
    if (!row.age && !row.gender) return null;
    return `${row.age ?? "Unknown age"} · ${genderName(row.gender)}`;
  }
  if (key === "location") return row.region || null;
  if (key === "audience") return row.adset_name || null;
  return null;
}

function periodOf(row: InsightRow | undefined): AccountPeriodMetrics {
  if (!row) return emptyPeriod();
  const actions = countActions(row.actions);
  return {
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: finiteOrNull(row.reach),
    frequency: finiteOrNull(row.frequency),
    clicks: Number(row.clicks ?? 0),
    linkClicks: row.inline_link_clicks == null ? null : Number(row.inline_link_clicks),
    leads: actions.leads,
    landingPageViews: actions.landingPageViews,
    formStarts: actions.formStarts,
    instantFormLeads: actions.instantFormLeads,
    websiteLeads: actions.websiteLeads,
    callLeads: actions.callLeads,
  };
}

function emptyPeriod(): AccountPeriodMetrics {
  return {
    spend: 0,
    impressions: 0,
    reach: null,
    frequency: null,
    clicks: 0,
    linkClicks: null,
    leads: 0,
    landingPageViews: null,
    formStarts: null,
    instantFormLeads: null,
    websiteLeads: null,
    callLeads: null,
  };
}

function finiteOrNull(value: string | undefined): MetricValue {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function platformName(value: string): string {
  const names: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    audience_network: "Audience Network",
    messenger: "Messenger",
    threads: "Threads",
  };
  return names[value] ?? value.replace(/_/g, " ");
}

function placementName(value: string): string {
  const names: Record<string, string> = {
    feed: "Feed",
    story: "Stories",
    facebook_reels: "Reels",
    instagram_reels: "Reels",
    reels: "Reels",
    instream_video: "In-stream",
    marketplace: "Marketplace",
    search: "Search",
    right_hand_column: "Right column",
    facebook_profile_feed: "Profile feed",
    instagram_explore: "Explore",
    instagram_explore_grid_home: "Explore",
    instagram_stories: "Stories",
  };
  return names[value] ?? value.replace(/_/g, " ");
}

function deviceName(value: string): string {
  const names: Record<string, string> = {
    iphone: "iPhone",
    android_smartphone: "Android phone",
    desktop: "Desktop",
    ipad: "iPad",
    android_tablet: "Android tablet",
    other: "Other",
  };
  return names[value] ?? value.replace(/_/g, " ");
}

function genderName(value: string | undefined): string {
  if (value === "female") return "Women";
  if (value === "male") return "Men";
  if (value === "unknown") return "Unknown gender";
  return value ? value : "Unknown gender";
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
