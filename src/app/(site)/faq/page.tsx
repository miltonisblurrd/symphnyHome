import MarketingPageShell from "@/components/site/MarketingPageShell";
import FaqStory from "@/components/site/stories/FaqStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("faq");

export default function FaqPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.faq}>
      <FaqStory />
    </MarketingPageShell>
  );
}
