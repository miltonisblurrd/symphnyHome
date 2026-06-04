import MarketingPageShell from "@/components/site/MarketingPageShell";
import HowItWorksStory from "@/components/site/stories/HowItWorksStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("howItWorks");

export default function HowItWorksPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.howItWorks}>
      <HowItWorksStory />
    </MarketingPageShell>
  );
}
