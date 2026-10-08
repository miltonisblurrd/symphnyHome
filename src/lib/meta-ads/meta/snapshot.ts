import type { MetricValue } from "@/lib/meta-ads/types";

/** Normalized account window. Meta response shapes do not leave lib/meta/pull.ts. */

export type PostSource = "new_creative" | "existing_post" | "unknown";

/** One day inside a breakdown. Reach is omitted because daily reach cannot be added. */
export type BreakdownPoint = {
  date: string;
  label: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  leads: number;
};

export type BreakdownDaily = {
  platform: BreakdownPoint[];
  placement: BreakdownPoint[];
  device: BreakdownPoint[];
  ageGender: BreakdownPoint[];
  location: BreakdownPoint[];
  audience: BreakdownPoint[];
};

/** Period totals from a level=account insights call. Null means Meta did not return the metric. */
export type AccountPeriodMetrics = {
  spend: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number;
  linkClicks: number | null;
  leads: number;
  landingPageViews: number | null;
  formStarts: number | null;
  instantFormLeads: number | null;
  websiteLeads: number | null;
  callLeads: number | null;
};

export type SnapshotCampaign = {
  key: string;
  name: string;
  spend: number;
  leads: number;
  ctr: MetricValue;
  frequency: MetricValue;
  previousCpl: MetricValue;
  previousCtr: MetricValue;
  days: number;
  dailySpend: MetricValue[];
  dailyLeads: MetricValue[];
  dailyImpressions?: number[];
  dailyClicks?: number[];
  dailyLinkClicks?: Array<number | null>;
  dailyLandingPageViews?: Array<number | null>;
  dailyFormStarts?: Array<number | null>;
  statusLabel?: string;
  windowFrequency?: Partial<Record<"7" | "30" | "60", { current: MetricValue; previous: MetricValue }>>;
  windowReach?: Partial<Record<"7" | "30" | "60", { current: MetricValue; previous: MetricValue }>>;
};

export type SnapshotAd = {
  key: string;
  campaignKey: string;
  campaignName?: string;
  name: string;
  format: string;
  /** Creative title from Meta, or the ad name when Meta has no title. */
  angle: string;
  image: string;
  /** Playable file when Meta returns one. Thumbnail stays in image as the poster. */
  videoUrl?: string | null;
  statusLabel: string;
  runningDays: number;
  days: number;
  spend: number;
  leads: number;
  ctr: MetricValue;
  previousCtr: MetricValue;
  previousCpl: MetricValue;
  frequency: MetricValue;
  previousFrequency: MetricValue;
  dailyCtr: MetricValue[];
  dailySpend?: MetricValue[];
  dailyLeads?: MetricValue[];
  dailyImpressions?: number[];
  dailyClicks?: number[];
  dailyLinkClicks?: Array<number | null>;
  dailyLandingPageViews?: Array<number | null>;
  dailyFormStarts?: Array<number | null>;
  dailyInstantFormLeads?: Array<number | null>;
  dailyWebsiteLeads?: Array<number | null>;
  dailyCallLeads?: Array<number | null>;
  windowFrequency?: Partial<Record<"7" | "30" | "60", { current: MetricValue; previous: MetricValue }>>;
  windowReach?: Partial<Record<"7" | "30" | "60", { current: MetricValue; previous: MetricValue }>>;
  effectiveStatus?: string;
  launchedOn?: string | null;
  primaryText?: string | null;
  creativeHeadline?: string | null;
  callToAction?: string | null;
  postSource?: PostSource;
  deliveryReason?: string | null;
};

export type AccountSnapshot = {
  isDemo: boolean;
  company: string;
  targetCpl: number | null;
  /** Saved office target. Null means nobody has entered one. */
  targetQualifiedCpl?: number | null;
  currency: string;
  dates: string[];
  currentLabel: string;
  previousLabel: string;
  syncedAt: string | null;
  /** Account-wide daily totals, including ads that are no longer active. */
  accountDaily?: Array<{ spend: number; leads: number }>;
  /** True when at least one insights row included a form-start action. */
  formStartsReported?: boolean;
  /** Account default, such as "7d_click_1d_view". Null when Meta did not return it. */
  attributionSetting?: string | null;
  accountWindows?: Partial<Record<"7" | "30" | "60", { current: AccountPeriodMetrics; previous: AccountPeriodMetrics }>>;
  breakdownDaily?: BreakdownDaily;
  campaigns: SnapshotCampaign[];
  ads: SnapshotAd[];
};
