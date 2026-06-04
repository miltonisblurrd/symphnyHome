import AboutStory from "@/components/site/AboutStory";
import MarketingPageShell from "@/components/site/MarketingPageShell";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("about");

export default function AboutPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.about}>
      <AboutStory />
    </MarketingPageShell>
  );
}
