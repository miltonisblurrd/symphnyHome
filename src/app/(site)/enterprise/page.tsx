import MarketingPageShell from "@/components/site/MarketingPageShell";
import EnterpriseStory from "@/components/site/stories/EnterpriseStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("enterprise");

export default function EnterprisePage() {
  return (
    <MarketingPageShell hero={marketingHeroes.enterprise}>
      <EnterpriseStory />
    </MarketingPageShell>
  );
}
