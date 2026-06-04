import MarketingPageShell from "@/components/site/MarketingPageShell";
import SiteStubContent from "@/components/site/sections/SiteStubContent";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata, pageContent } from "@/data/site-content";

export const metadata = buildMetadata("howToVideos");

export default function HowToVideosPage() {
  const content = pageContent.howToVideos;

  return (
    <MarketingPageShell hero={marketingHeroes.howToVideos}>
      <SiteStubContent message={content.stub ?? content.description} />
    </MarketingPageShell>
  );
}
