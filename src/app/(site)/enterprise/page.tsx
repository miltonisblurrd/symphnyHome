import Link from "next/link";
import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { contact, pricing, services } from "@/data/studio-data";

export const metadata = buildMetadata("enterprise");

export default function EnterprisePage() {
  const content = pageContent.enterprise;
  const enterpriseService = services.find((s) => s.id === "enterprise-orchestration");
  const enterpriseTier = pricing.find((p) => p.id === "symphony-enterprise");

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      {enterpriseService ? (
        <section className={styles.marketingSection}>
          <h2>{enterpriseService.name}</h2>
          <p>{enterpriseService.description}</p>
          <h3>What we solve</h3>
          <ul>
            {enterpriseService.solves.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Examples</h3>
          <ul>
            {enterpriseService.examples.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {enterpriseTier && "structure" in enterpriseTier && enterpriseTier.structure ? (
        <section className={`${styles.marketingSection} ${styles.card}`}>
          <h2>{enterpriseTier.name}</h2>
          <p className={styles.cardMeta}>{enterpriseTier.bestFor}</p>
          <h3>Typical structure</h3>
          <ul>
            <li>Discovery: {enterpriseTier.structure.discovery}</li>
            <li>Build: {enterpriseTier.structure.build}</li>
            <li>Managed: {enterpriseTier.structure.managed}</li>
          </ul>
          <h3>Outcomes</h3>
          <ul>
            {enterpriseTier.outcomes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={styles.marketingSection}>
        <h2>Next step</h2>
        <p>
          {contact.cta}:{" "}
          <Link href="/contact" className={styles.contactLink}>
            Contact sales
          </Link>{" "}
          or email{" "}
          <a href={`mailto:${contact.email}`} className={styles.contactLink}>
            {contact.email}
          </a>
          .
        </p>
      </section>
    </MarketingPage>
  );
}
