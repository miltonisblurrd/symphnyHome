import MarketingPageShell from "@/components/site/MarketingPageShell";
import TrustSafetyStory from "@/components/site/stories/TrustSafetyStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("security");

export default function SecurityPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.security}>
      <TrustSafetyStory focus="security" />
    </MarketingPageShell>
  );
}
