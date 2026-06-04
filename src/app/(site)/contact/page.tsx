import MarketingPageShell from "@/components/site/MarketingPageShell";
import ContactStory from "@/components/site/stories/ContactStory";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("contact");

export default function ContactPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.contact}>
      <ContactStory />
    </MarketingPageShell>
  );
}
