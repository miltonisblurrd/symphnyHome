import MarketingPageShell from "@/components/site/MarketingPageShell";
import CaseStudiesStory from "@/components/site/stories/CaseStudiesStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("caseStudies");

export default function CaseStudiesPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.caseStudies}>
      <CaseStudiesStory />
    </MarketingPageShell>
  );
}
