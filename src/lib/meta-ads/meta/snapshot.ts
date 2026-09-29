import type { MetricValue } from "@/lib/meta-ads/types";

/** Normalized account window. Meta response shapes do not leave lib/meta/pull.ts. */

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
  windowFrequency?: Partial<Record<"7" | "30" | "60", { current: MetricValue; previous: MetricValue }>>;
};

export type AccountSnapshot = {
  isDemo: boolean;
  company: string;
  targetCpl: number | null;
  currency: string;
  dates: string[];
  currentLabel: string;
  previousLabel: string;
  syncedAt: string | null;
  /** Account-wide daily totals, including ads that are no longer active. */
  accountDaily?: Array<{ spend: number; leads: number }>;
  campaigns: SnapshotCampaign[];
  ads: SnapshotAd[];
};
