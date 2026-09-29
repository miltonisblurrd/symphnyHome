import OpsMetaAdsWorkspace from "@/components/inspired-closets/OpsMetaAdsWorkspace";
import { reviewDemoAccount, reviewFromSnapshot } from "@/lib/meta-ads/analytics/review";
import { readLiveSnapshot } from "@/lib/meta-ads/meta/load";

export const dynamic = "force-dynamic";

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
  const snapshot = readLiveSnapshot();
  return (
    <OpsMetaAdsWorkspace
      review={snapshot ? reviewFromSnapshot(snapshot, range as 7 | 30 | 60) : reviewDemoAccount()}
    />
  );
}
