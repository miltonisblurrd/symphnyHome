import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { pricing } from "@/data/studio-data";

export const metadata = buildMetadata("pricing");

export default function PricingPage() {
  const content = pageContent.pricing;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      {pricing.map((tier) => (
        <section key={tier.id} className={`${styles.marketingSection} ${styles.card}`}>
          <h2 className={styles.cardTitle}>{tier.name}</h2>
          <p className={styles.cardMeta}>
            {tier.price}
            {"bestFor" in tier && tier.bestFor ? ` · ${tier.bestFor}` : ""}
          </p>
          {"includes" in tier && tier.includes ? (
            <>
              <h3>Includes</h3>
              <ul>
                {tier.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          {"structure" in tier && tier.structure ? (
            <>
              <h3>Structure</h3>
              <ul>
                <li>Discovery: {tier.structure.discovery}</li>
                <li>Build: {tier.structure.build}</li>
                <li>Managed: {tier.structure.managed}</li>
              </ul>
            </>
          ) : null}
          <h3>Outcomes</h3>
          <ul>
            {tier.outcomes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </MarketingPage>
  );
}
