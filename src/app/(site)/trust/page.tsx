import MarketingPageShell from "@/components/site/MarketingPageShell";
import TrustSafetyStory from "@/components/site/stories/TrustSafetyStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("trust");

export default function TrustPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.trust}>
      <TrustSafetyStory focus="trust" />
    </MarketingPageShell>
  );
}
