import { calculateCpl } from "@/lib/meta-ads/analytics/metrics";
import { readMetaAdsCredentials } from "@/lib/meta-ads/env";
import { countActions } from "@/lib/meta-ads/meta/actions";
import { loadDeliveryContext } from "@/lib/meta-ads/meta/enrich";
import { graphGet, graphGetAll } from "@/lib/meta-ads/meta/graph";
import type { AccountSnapshot, PostSource, SnapshotAd, SnapshotCampaign } from "@/lib/meta-ads/meta/snapshot";
import type { MetricValue } from "@/lib/meta-ads/types";

/**
 * Meta's `lead` action is the combined lead result. On this account it already
 * equals instant-form leads plus website pixel leads, so those are not added again.
 *
 * Creative thumbnails from the ad object are often the page logo. Images come
 * from the ad image library. Videos come from the story video, which is the
 * file that actually ran.
 */
const HISTORY_DAYS = 120;
const WINDOWS = [7, 30, 60] as const;
const BASIC_INSIGHT_FIELDS = "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions";
const EXTENDED_INSIGHT_FIELDS = `${BASIC_INSIGHT_FIELDS},inline_link_clicks`;

type InsightRow = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

type CreativeNode = {
  object_type?: string;
  title?: string;
  body?: string;
  call_to_action_type?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  object_story_id?: string;
  effective_object_story_id?: string;
  object_story_spec?: {
    video_data?: {
      video_id?: string;
      image_url?: string;
      image_hash?: string;
      title?: string;
      message?: string;
      call_to_action?: { type?: string };
    };
    link_data?: {
      image_hash?: string;
      picture?: string;
      message?: string;
      name?: string;
      call_to_action?: { type?: string };
    };
  };
  asset_feed_spec?: {
    bodies?: Array<{ text?: string }>;
    titles?: Array<{ text?: string }>;
    call_to_action_types?: string[];
    images?: Array<{ hash?: string }>;
    videos?: Array<{ video_id?: string; thumbnail_url?: string }>;
  };
};

type AdNode = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  created_time?: string;
  campaign_id?: string;
  creative?: CreativeNode;
  issues_info?: Array<{ error_summary?: string; error_message?: string }>;
  ad_review_feedback?: { global?: Record<string, string> };
};

type DayMetrics = {
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  landingPageViews: number | null;
  formStarts: number | null;
  instantFormLeads: number | null;
  websiteLeads: number | null;
  callLeads: number | null;
  sawFormStart: boolean;
};

const EMPTY: DayMetrics = {
  spend: 0,
  leads: 0,
  impressions: 0,
  clicks: 0,
  linkClicks: null,
  landingPageViews: null,
  formStarts: null,
  instantFormLeads: null,
  websiteLeads: null,
  callLeads: null,
  sawFormStart: false,
};

export async function pullLiveSnapshot(): Promise<AccountSnapshot> {
  const creds = readMetaAdsCredentials();
  if (!creds.ok) throw new Error(creds.reason);

  const account = await graphGet<{ name?: string; timezone_name?: string; currency?: string }>(creds.accountId, {
    fields: "name,timezone_name,currency",
  });
  const timeZone = account.timezone_name || "America/Los_Angeles";
  const dates = lastCompleteDates(timeZone, HISTORY_DAYS);
  const since = dates[0];
  const until = dates[dates.length - 1];

  const [dailyRows, activeAds, campaignRows, ...windowRows] = await Promise.all([
    insights(creds.accountId, since, until, "1"),
    activeAdNodes(creds.accountId),
    graphGetAll<{ id: string; name?: string; effective_status?: string }>(`${creds.accountId}/campaigns`, {
      fields: "id,name,effective_status",
      limit: "200",
    }),
    ...WINDOWS.flatMap((days) => {
      const currentEnd = dates[dates.length - 1];
      const currentStart = dates[dates.length - days];
      const previousEnd = dates[dates.length - days - 1];
      const previousStart = dates[dates.length - days * 2];
      return [
        insights(creds.accountId, currentStart, currentEnd, "all_days"),
        insights(creds.accountId, previousStart, previousEnd, "all_days"),
      ];
    }),
  ]);

  const campaignNames = new Map(campaignRows.map((campaign) => [campaign.id, campaign.name || campaign.id]));
  const missingCampaignIds = [...new Set(activeAds.map((ad) => ad.campaign_id).filter((id): id is string => Boolean(id && !campaignNames.has(id))))];
  for (const id of missingCampaignIds) {
    try {
      const campaign = await graphGet<{ name?: string }>(id, { fields: "name" });
      if (campaign.name) campaignNames.set(id, campaign.name);
    } catch {
      // Keep the id when the campaign name is not readable.
    }
  }
  const context = await loadDeliveryContext(creds.accountId, dates).catch((error) => {
    console.error("Meta ads delivery context skipped", error instanceof Error ? error.message : error);
    return null;
  });
  const dailyByAd = groupDaily(dailyRows);
  const media = await resolveMedia(activeAds);
  const windows = windowMaps(windowRows);
  const formStartsReported = [...dailyByAd.values()].some((days) => [...days.values()].some((day) => day.sawFormStart));

  const ads: SnapshotAd[] = activeAds
    .map((node) =>
      toAd(node, dates, until, dailyByAd.get(node.id) ?? new Map(), media.get(node.id), windows.get(node.id), campaignNames),
    )
    .sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));

  const accountDaily = dates.map((date) => {
    let spend = 0;
    let leads = 0;
    for (const days of dailyByAd.values()) {
      const row = days.get(date);
      if (!row) continue;
      spend += row.spend;
      leads += row.leads;
    }
    return { spend: roundMoney(spend), leads };
  });

  const campaignStatus = new Map(campaignRows.map((campaign) => [campaign.id, campaign.effective_status]));
  const campaigns = toCampaigns(dates, dailyRows, campaignNames, campaignStatus, context?.campaignWindows);

  return {
    isDemo: false,
    company: account.name || "Meta ad account",
    targetCpl: null,
    targetQualifiedCpl: null,
    currency: account.currency || "USD",
    dates,
    currentLabel: "Last 7 days",
    previousLabel: "Previous 7 days",
    syncedAt: new Date().toISOString(),
    accountDaily,
    formStartsReported,
    attributionSetting: context?.attributionSetting ?? null,
    accountWindows: context?.accountWindows,
    breakdownDaily: context?.breakdownDaily,
    campaigns,
    ads,
  };
}

async function insights(accountId: string, since: string, until: string, increment: string): Promise<InsightRow[]> {
  const params = {
    level: "ad",
    time_increment: increment,
    time_range: JSON.stringify({ since, until }),
    filtering: JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]),
    limit: "500",
  };
  try {
    return await graphGetAll<InsightRow>(`${accountId}/insights`, { ...params, fields: EXTENDED_INSIGHT_FIELDS });
  } catch (error) {
    console.error("Meta insights fell back to the base fields", error instanceof Error ? error.message : error);
    return graphGetAll<InsightRow>(`${accountId}/insights`, { ...params, fields: BASIC_INSIGHT_FIELDS });
  }
}

const AD_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "WITH_ISSUES",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "IN_PROCESS",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
];

const AD_FIELDS_BASIC =
  "id,name,status,effective_status,created_time,campaign_id,creative{object_type,title,thumbnail_url,image_url,video_id,object_story_spec{video_data{video_id,image_url,image_hash},link_data{image_hash,picture}},asset_feed_spec{images{hash},videos{video_id,thumbnail_url}}}";

const AD_FIELDS_EXTENDED =
  "id,name,status,effective_status,created_time,campaign_id,issues_info,ad_review_feedback,creative{object_type,title,body,call_to_action_type,thumbnail_url,image_url,video_id,object_story_id,effective_object_story_id,object_story_spec{video_data{video_id,image_url,image_hash,title,message,call_to_action},link_data{image_hash,picture,message,name,call_to_action}},asset_feed_spec{bodies{text},titles{text},call_to_action_types,images{hash},videos{video_id,thumbnail_url}}}";

async function activeAdNodes(accountId: string): Promise<AdNode[]> {
  const filtering = JSON.stringify([{ field: "effective_status", operator: "IN", value: AD_STATUSES }]);
  try {
    return await graphGetAll<AdNode>(`${accountId}/ads`, { fields: AD_FIELDS_EXTENDED, filtering, limit: "200" });
  } catch (error) {
    console.error("Meta ad details fell back to the base fields", error instanceof Error ? error.message : error);
    return graphGetAll<AdNode>(`${accountId}/ads`, { fields: AD_FIELDS_BASIC, filtering, limit: "200" });
  }
}

type ResolvedMedia = {
  image: string;
  videoUrl: string | null;
  format: string;
  title: string;
  primaryText: string | null;
  creativeHeadline: string | null;
  callToAction: string | null;
  postSource: PostSource;
};

async function resolveMedia(ads: AdNode[]): Promise<Map<string, ResolvedMedia>> {
  const hashes = new Set<string>();
  const videoIds = new Set<string>();
  for (const ad of ads) {
    for (const hash of imageHashes(ad.creative)) hashes.add(hash);
    for (const videoId of videoIdsFor(ad.creative)) videoIds.add(videoId);
  }

  const imageUrls = await adImageUrls([...hashes]);
  const videos = await videoFiles([...videoIds]);
  const media = new Map<string, ResolvedMedia>();

  for (const ad of ads) {
    const creative = ad.creative;
    const video = videoIdsFor(creative)
      .map((id) => videos.get(id))
      .find((file) => file?.source || file?.picture);
    const feedThumb = creative?.asset_feed_spec?.videos?.find((item) => item.thumbnail_url)?.thumbnail_url;
    const image =
      imageHashes(creative).map((hash) => imageUrls.get(hash)).find(Boolean) ||
      creative?.object_story_spec?.video_data?.image_url ||
      creative?.object_story_spec?.link_data?.picture ||
      video?.picture ||
      feedThumb ||
      creative?.image_url ||
      creative?.thumbnail_url ||
      "";
    const copy = creativeCopy(creative);
    media.set(ad.id, {
      image,
      videoUrl: video?.source ?? null,
      format: formatLabel(creative?.object_type, Boolean(video?.source)),
      title: copy.creativeHeadline || creative?.title?.trim() || ad.name || "Live ad",
      ...copy,
    });
  }
  return media;
}

function imageHashes(creative: CreativeNode | undefined): string[] {
  const hashes = [
    creative?.object_story_spec?.link_data?.image_hash,
    creative?.object_story_spec?.video_data?.image_hash,
    ...(creative?.asset_feed_spec?.images ?? []).map((image) => image.hash),
  ];
  return hashes.filter((hash): hash is string => Boolean(hash));
}

function videoIdsFor(creative: CreativeNode | undefined): string[] {
  const ids = [
    creative?.object_story_spec?.video_data?.video_id,
    ...(creative?.asset_feed_spec?.videos ?? []).map((video) => video.video_id),
    creative?.video_id,
  ];
  return ids.filter((id): id is string => Boolean(id));
}

async function adImageUrls(hashes: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const creds = readMetaAdsCredentials();
  if (!creds.ok || hashes.length === 0) return urls;
  for (let index = 0; index < hashes.length; index += 20) {
    const batch = hashes.slice(index, index + 20);
    const body = await graphGet<{ data?: Array<{ hash?: string; url?: string }> }>(`${creds.accountId}/adimages`, {
      hashes: JSON.stringify(batch),
      fields: "hash,url",
    });
    for (const image of body.data ?? []) {
      if (image.hash && image.url) urls.set(image.hash, image.url);
    }
  }
  return urls;
}

async function videoFiles(ids: string[]): Promise<Map<string, { picture?: string; source?: string }>> {
  const videos = new Map<string, { picture?: string; source?: string }>();
  for (const id of ids) {
    try {
      const video = await graphGet<{ picture?: string; source?: string }>(id, { fields: "picture,source" });
      videos.set(id, video);
    } catch {
      // Some video ids are not readable with ads_read. The image poster still shows.
    }
  }
  return videos;
}

function creativeCopy(creative: CreativeNode | undefined): Pick<ResolvedMedia, "primaryText" | "creativeHeadline" | "callToAction" | "postSource"> {
  const video = creative?.object_story_spec?.video_data;
  const link = creative?.object_story_spec?.link_data;
  const feed = creative?.asset_feed_spec;
  const primaryText = firstText(video?.message, link?.message, feed?.bodies?.[0]?.text, creative?.body);
  const creativeHeadline = firstText(video?.title, link?.name, feed?.titles?.[0]?.text, creative?.title);
  const callToAction = humanizeToken(
    video?.call_to_action?.type || link?.call_to_action?.type || feed?.call_to_action_types?.[0] || creative?.call_to_action_type,
  );
  const postSource: PostSource = creative?.object_story_spec
    ? "new_creative"
    : creative?.object_story_id || creative?.effective_object_story_id
      ? "existing_post"
      : "unknown";
  return { primaryText, creativeHeadline, callToAction, postSource };
}

function firstText(...values: Array<string | undefined>): string | null {
  const value = values.find((item) => item?.trim());
  return value?.trim() ?? null;
}

function humanizeToken(value: string | undefined): string | null {
  if (!value) return null;
  const words = value.toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

type AdWindows = { frequency: SnapshotAd["windowFrequency"]; reach: SnapshotAd["windowReach"] };

function windowMaps(windowRows: InsightRow[][]): Map<string, AdWindows> {
  const maps = new Map<string, AdWindows>();
  WINDOWS.forEach((days, index) => {
    const current = indexPeriod(windowRows[index * 2] ?? []);
    const previous = indexPeriod(windowRows[index * 2 + 1] ?? []);
    const ids = new Set([...current.keys(), ...previous.keys()]);
    for (const id of ids) {
      const entry = maps.get(id) ?? { frequency: {}, reach: {} };
      const key = String(days) as "7" | "30" | "60";
      entry.frequency = entry.frequency ?? {};
      entry.reach = entry.reach ?? {};
      entry.frequency[key] = {
        current: frequencyOf(current.get(id)),
        previous: frequencyOf(previous.get(id)),
      };
      entry.reach[key] = {
        current: reachOf(current.get(id)),
        previous: reachOf(previous.get(id)),
      };
      maps.set(id, entry);
    }
  });
  return maps;
}

function toAd(
  node: AdNode,
  dates: string[],
  until: string,
  daily: Map<string, DayMetrics>,
  media: ResolvedMedia | undefined,
  windows: AdWindows | undefined,
  campaignNames: Map<string, string>,
): SnapshotAd {
  const series = dates.map((date) => daily.get(date) ?? EMPTY);
  const recent = series.slice(-7);
  const prior = series.slice(-14, -7);
  const recentTotals = recent.reduce(add, EMPTY);
  const priorTotals = prior.reduce(add, EMPTY);
  const created = node.created_time?.slice(0, 10);
  const weekFrequency = windows?.frequency?.["7"];

  return {
    key: node.id,
    campaignKey: node.campaign_id || "",
    campaignName: node.campaign_id ? campaignNames.get(node.campaign_id) : undefined,
    name: node.name || "Ad",
    format: media?.format || "Ad",
    angle: media?.title || node.name || "Live ad",
    image: media?.image || "",
    videoUrl: media?.videoUrl ?? null,
    statusLabel: statusText(node.effective_status),
    effectiveStatus: node.effective_status,
    launchedOn: created ?? null,
    primaryText: media?.primaryText ?? null,
    creativeHeadline: media?.creativeHeadline ?? null,
    callToAction: media?.callToAction ?? null,
    postSource: media?.postSource ?? "unknown",
    deliveryReason: deliveryReason(node, recentTotals.impressions),
    runningDays: created ? daysBetween(created, until) : recent.filter((day) => day.impressions > 0).length,
    days: recent.filter((day) => day.impressions > 0).length,
    spend: recentTotals.spend,
    leads: recentTotals.leads,
    ctr: ctr(recentTotals),
    previousCtr: ctr(priorTotals),
    previousCpl: calculateCpl(priorTotals.spend, priorTotals.leads),
    frequency: weekFrequency?.current ?? null,
    previousFrequency: weekFrequency?.previous ?? null,
    dailyCtr: series.map((day) => ctr(day)),
    dailySpend: series.map((day) => day.spend),
    dailyLeads: series.map((day) => day.leads),
    dailyImpressions: series.map((day) => day.impressions),
    dailyClicks: series.map((day) => day.clicks),
    dailyLinkClicks: series.map((day) => day.linkClicks),
    dailyLandingPageViews: series.map((day) => day.landingPageViews),
    dailyFormStarts: series.map((day) => day.formStarts),
    dailyInstantFormLeads: series.map((day) => day.instantFormLeads),
    dailyWebsiteLeads: series.map((day) => day.websiteLeads),
    dailyCallLeads: series.map((day) => day.callLeads),
    windowFrequency: windows?.frequency,
    windowReach: windows?.reach,
  };
}

function toCampaigns(
  dates: string[],
  dailyRows: InsightRow[],
  campaignNames: Map<string, string>,
  campaignStatus: Map<string, string | undefined>,
  campaignWindows: Awaited<ReturnType<typeof loadDeliveryContext>>["campaignWindows"] | undefined,
): SnapshotCampaign[] {
  const names = new Map(campaignNames);
  const byCampaign = new Map<string, Map<string, DayMetrics>>();
  for (const row of dailyRows) {
    if (!row.campaign_id || !row.date_start || !row.ad_id) continue;
    if (row.campaign_name) names.set(row.campaign_id, row.campaign_name);
    const days = byCampaign.get(row.campaign_id) ?? new Map<string, DayMetrics>();
    days.set(row.date_start, add(days.get(row.date_start) ?? EMPTY, metricsOf(row)));
    byCampaign.set(row.campaign_id, days);
  }

  return [...byCampaign.entries()]
    .map(([id, days]) => {
      const series = dates.map((date) => days.get(date) ?? EMPTY);
      const recent = series.slice(-7).reduce(add, EMPTY);
      const prior = series.slice(-14, -7).reduce(add, EMPTY);
      const stats = campaignWindows?.get(id);
      return {
        key: id,
        name: names.get(id) || id,
        spend: recent.spend,
        leads: recent.leads,
        ctr: ctr(recent),
        frequency: stats?.frequency?.["7"]?.current ?? null,
        previousCpl: calculateCpl(prior.spend, prior.leads),
        previousCtr: ctr(prior),
        days: series.slice(-7).filter((day) => day.impressions > 0).length,
        dailySpend: series.map((day) => day.spend),
        dailyLeads: series.map((day) => day.leads),
        dailyImpressions: series.map((day) => day.impressions),
        dailyClicks: series.map((day) => day.clicks),
        dailyLinkClicks: series.map((day) => day.linkClicks),
        dailyLandingPageViews: series.map((day) => day.landingPageViews),
        dailyFormStarts: series.map((day) => day.formStarts),
        statusLabel: statusText(campaignStatus.get(id)),
        windowFrequency: stats?.frequency,
        windowReach: stats?.reach,
      } satisfies SnapshotCampaign;
    })
    .filter((campaign) => campaign.dailySpend.some((spend) => (spend ?? 0) > 0));
}

function groupDaily(rows: InsightRow[]): Map<string, Map<string, DayMetrics>> {
  const byAd = new Map<string, Map<string, DayMetrics>>();
  for (const row of rows) {
    if (!row.ad_id || !row.date_start) continue;
    const days = byAd.get(row.ad_id) ?? new Map<string, DayMetrics>();
    days.set(row.date_start, metricsOf(row));
    byAd.set(row.ad_id, days);
  }
  return byAd;
}

function indexPeriod(rows: InsightRow[]): Map<string, InsightRow> {
  return new Map(rows.filter((row) => row.ad_id).map((row) => [row.ad_id as string, row]));
}

function metricsOf(row: InsightRow): DayMetrics {
  const actions = countActions(row.actions);
  return {
    spend: Number(row.spend ?? 0),
    leads: actions.leads,
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: row.inline_link_clicks == null ? null : Number(row.inline_link_clicks),
    landingPageViews: actions.landingPageViews,
    formStarts: actions.formStarts,
    instantFormLeads: actions.instantFormLeads,
    websiteLeads: actions.websiteLeads,
    callLeads: actions.callLeads,
    sawFormStart: actions.sawFormStart,
  };
}

function addNullable(left: number | null, right: number | null): number | null {
  if (left == null && right == null) return null;
  return (left ?? 0) + (right ?? 0);
}

function add(left: DayMetrics, right: DayMetrics): DayMetrics {
  return {
    spend: left.spend + right.spend,
    leads: left.leads + right.leads,
    impressions: left.impressions + right.impressions,
    clicks: left.clicks + right.clicks,
    linkClicks: addNullable(left.linkClicks, right.linkClicks),
    landingPageViews: addNullable(left.landingPageViews, right.landingPageViews),
    formStarts: addNullable(left.formStarts, right.formStarts),
    instantFormLeads: addNullable(left.instantFormLeads, right.instantFormLeads),
    websiteLeads: addNullable(left.websiteLeads, right.websiteLeads),
    callLeads: addNullable(left.callLeads, right.callLeads),
    sawFormStart: left.sawFormStart || right.sawFormStart,
  };
}

function ctr(metrics: DayMetrics): MetricValue {
  if (metrics.impressions <= 0) return null;
  return metrics.clicks / metrics.impressions;
}

function frequencyOf(row: InsightRow | undefined): MetricValue {
  const impressions = Number(row?.impressions ?? 0);
  const reach = Number(row?.reach ?? 0);
  if (impressions <= 0 || reach <= 0) return null;
  return impressions / reach;
}

function reachOf(row: InsightRow | undefined): MetricValue {
  const reach = Number(row?.reach ?? 0);
  return reach > 0 ? reach : null;
}

function statusText(status: string | undefined): string {
  const labels: Record<string, string> = {
    ACTIVE: "Active",
    PAUSED: "Paused",
    CAMPAIGN_PAUSED: "Campaign paused",
    ADSET_PAUSED: "Ad set paused",
    PENDING_REVIEW: "In review",
    DISAPPROVED: "Rejected",
    WITH_ISSUES: "Has issues",
    IN_PROCESS: "Processing",
    PREAPPROVED: "Preapproved",
    PENDING_BILLING_INFO: "Billing issue",
    ARCHIVED: "Archived",
  };
  if (!status) return "Status unknown";
  return labels[status] ?? status.replace(/_/g, " ").toLowerCase();
}

function deliveryReason(node: AdNode, impressions: number): string | null {
  const status = node.effective_status;
  const issue = node.issues_info?.find((item) => item.error_summary || item.error_message);
  const issueText = issue?.error_summary || issue?.error_message || null;
  const review = node.ad_review_feedback?.global;
  const reviewText = review ? Object.values(review).filter(Boolean).join(", ") || Object.keys(review).join(", ") : null;
  if (status === "DISAPPROVED") return reviewText || issueText || "Rejected in review. Meta did not include a reason.";
  if (status === "PENDING_REVIEW" || status === "IN_PROCESS") return "Still in review, so it is not delivering yet.";
  if (status === "WITH_ISSUES") return issueText || "Meta marked this ad as having issues.";
  if (status === "PAUSED") return "The ad is paused.";
  if (status === "CAMPAIGN_PAUSED") return "The campaign is paused.";
  if (status === "ADSET_PAUSED") return "The ad set is paused.";
  if (status === "PENDING_BILLING_INFO") return "The account has a billing issue, so delivery is stopped.";
  if (status === "PREAPPROVED") return "Preapproved and waiting to deliver.";
  if ((status === "ACTIVE" || !status) && impressions <= 0) {
    return "Active, with no impressions in this period. Meta did not return a delivery error. The usual causes are losing the auction, a narrow audience, or the budget going to other ads.";
  }
  return issueText;
}

function formatLabel(objectType: string | undefined, hasVideo: boolean): string {
  if (objectType === "VIDEO" || hasVideo) return "Video";
  if (objectType === "SHARE" || objectType === "PHOTO") return "Image";
  return objectType ? objectType.toLowerCase() : "Ad";
}

function daysBetween(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function lastCompleteDates(timeZone: string, count: number): string[] {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const end = shiftDate(today, -1);
  const dates: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) dates.push(shiftDate(end, -offset));
  return dates;
}

function shiftDate(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
