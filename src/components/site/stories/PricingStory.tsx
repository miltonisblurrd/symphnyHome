import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import SiteReveal from "@/components/site/SiteReveal";
import { brand } from "@/data/studio-data";
import { pricing } from "@/data/studio-data";
import { siteConfig } from "@/lib/site-config";
import styles from "../site.module.css";

export default function PricingStory() {
  return (
    <>
      <SiteSection id="tiers" variant="light" ariaLabelledBy="pricing-tiers-title">
        <p className={styles.siteEyebrowDark}>Subscription tiers</p>
        <h2 id="pricing-tiers-title" className={styles.siteSectionTitleDark}>
          Continuous orchestration as you scale
        </h2>
        <p className={styles.siteSectionLead}>{brand.tagline}</p>

        <div className={styles.siteTierGrid}>
          {pricing.map((tier, index) => (
            <SiteReveal key={tier.id} delay={index * 80}>
              <article
                className={`${styles.siteTierCard} ${tier.id === "concerto" ? styles.siteTierCardFeatured : ""}`}
              >
                <p className={styles.siteTierName}>{tier.name}</p>
                <p className={styles.siteTierPrice}>{tier.price}</p>
                {"bestFor" in tier && tier.bestFor ? (
                  <p className={styles.siteTierMeta}>{tier.bestFor}</p>
                ) : null}
                {"includes" in tier && tier.includes ? (
                  <ul className={styles.siteTierList}>
                    {tier.includes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {"structure" in tier && tier.structure ? (
                  <ul className={styles.siteTierList}>
                    <li>Discovery: {tier.structure.discovery}</li>
                    <li>Build: {tier.structure.build}</li>
                    <li>Managed: {tier.structure.managed}</li>
                  </ul>
                ) : null}
                <p className={styles.siteTierOutcomesLabel}>Outcomes</p>
                <ul className={styles.siteTierList}>
                  {tier.outcomes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <a
                  href={siteConfig.bookingUrl}
                  className={styles.siteCtaPrimary}
                  target="_blank"
                  rel="noreferrer"
                >
                  Book discovery call
                </a>
              </article>
            </SiteReveal>
          ))}
        </div>
      </SiteSection>

      <SiteCtaBand
        title="Not sure which tier fits?"
        lead="We'll map coordination complexity to the right level of orchestration—no overselling, no shortcuts."
        secondaryHref="/how-it-works"
        secondaryLabel="How it works"
      />
    </>
  );
}
