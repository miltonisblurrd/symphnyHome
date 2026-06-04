import MarketingPageShell from "@/components/site/MarketingPageShell";
import SolutionsStory from "@/components/site/stories/SolutionsStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("solutions");

export default function SolutionsPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.solutions}>
      <SolutionsStory />
    </MarketingPageShell>
  );
}
