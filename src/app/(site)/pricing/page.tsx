import MarketingPageShell from "@/components/site/MarketingPageShell";
import PricingStory from "@/components/site/stories/PricingStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("pricing");

export default function PricingPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.pricing}>
      <PricingStory />
    </MarketingPageShell>
  );
}
