import OpsMetaAdsWorkspace from "@/components/inspired-closets/OpsMetaAdsWorkspace";
import { reviewDemoAccount, reviewFromSnapshot } from "@/lib/meta-ads/analytics/review";
import { demoLeadQuality, loadLeadQuality } from "@/lib/meta-ads/crm-quality";
import { META_ADS_SYNC_MAX_AGE_MS, readLiveSnapshot } from "@/lib/meta-ads/meta/load";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const metadata = {
  title: "Inspired Closets OS · Meta Ads",
};

export default async function InspiredClosetsOpsAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const query = await searchParams;
  const range = query.range === "30" || query.range === "60" ? Number(query.range) : 7;
  const snapshot = await readLiveSnapshot({ maxAgeMs: META_ADS_SYNC_MAX_AGE_MS });
  const review = snapshot ? reviewFromSnapshot(snapshot, range as 7 | 30 | 60) : reviewDemoAccount();
  const leadQuality = review.isDemo
    ? demoLeadQuality()
    : await loadLeadQuality({
        previousStart: review.previousStart,
        currentStart: review.currentStart,
        currentEnd: review.currentEnd,
      });
  return <OpsMetaAdsWorkspace review={review} leadQuality={leadQuality} />;
}
