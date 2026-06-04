import LegalDocument from "@/components/site/LegalDocument";
import MarketingPageShell from "@/components/site/MarketingPageShell";
import { privacySections } from "@/data/legal-content";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("privacy");

export default function PrivacyPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.privacy}>
      <LegalDocument sections={privacySections} />
    </MarketingPageShell>
  );
}
