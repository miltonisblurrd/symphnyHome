import MarketingPageShell from "@/components/site/MarketingPageShell";
import SiteStubContent from "@/components/site/sections/SiteStubContent";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata, pageContent } from "@/data/site-content";

export const metadata = buildMetadata("careers");

export default function CareersPage() {
  const content = pageContent.careers;

  return (
    <MarketingPageShell hero={marketingHeroes.careers}>
      <SiteStubContent message={content.stub ?? content.description} />
    </MarketingPageShell>
  );
}
