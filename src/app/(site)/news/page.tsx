import MarketingPageShell from "@/components/site/MarketingPageShell";
import SiteStubContent from "@/components/site/sections/SiteStubContent";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata, pageContent } from "@/data/site-content";

export const metadata = buildMetadata("news");

export default function NewsPage() {
  const content = pageContent.news;

  return (
    <MarketingPageShell hero={marketingHeroes.news}>
      <SiteStubContent message={content.stub ?? content.description} />
    </MarketingPageShell>
  );
}
