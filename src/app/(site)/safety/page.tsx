import MarketingPageShell from "@/components/site/MarketingPageShell";
import TrustSafetyStory from "@/components/site/stories/TrustSafetyStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("safety");

export default function SafetyPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.safety}>
      <TrustSafetyStory focus="safety" />
    </MarketingPageShell>
  );
}
