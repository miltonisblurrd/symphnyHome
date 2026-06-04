import LegalDocument from "@/components/site/LegalDocument";
import MarketingPageShell from "@/components/site/MarketingPageShell";
import { termsSections } from "@/data/legal-content";
import { marketingHeroes } from "@/data/marketing-heroes";
import { buildMetadata } from "@/data/site-content";

export const metadata = buildMetadata("terms");

export default function TermsPage() {
  return (
    <MarketingPageShell hero={marketingHeroes.terms}>
      <LegalDocument
        intro="Please read these Terms carefully. By using our website, chat, APIs, or subscribing to services, you agree to be bound by them."
        sections={termsSections}
      />
    </MarketingPageShell>
  );
}
