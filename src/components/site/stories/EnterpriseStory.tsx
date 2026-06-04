import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import { buyingSignals, contact, pricing, services } from "@/data/studio-data";
import styles from "../site.module.css";

export default function EnterpriseStory() {
  const enterpriseService = services.find((s) => s.id === "enterprise-orchestration");
  const enterpriseTier = pricing.find((p) => p.id === "symphony-enterprise");

  return (
    <>
      {enterpriseService ? (
        <SiteSection variant="light">
          <p className={styles.siteEyebrowDark}>Enterprise orchestration</p>
          <h2 className={styles.siteSectionTitleDark}>{enterpriseService.name}</h2>
          <p className={styles.siteSectionLead}>{enterpriseService.description}</p>
          <ul className={styles.siteList}>
            {enterpriseService.solves.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SiteSection>
      ) : null}

      {enterpriseTier && "structure" in enterpriseTier && enterpriseTier.structure ? (
        <SiteSection variant="dark">
          <p className={styles.siteEyebrowLight}>Typical engagement</p>
          <h2 className={styles.siteProblemTitle}>{enterpriseTier.name}</h2>
          <p className={styles.siteProblemBody}>{enterpriseTier.bestFor}</p>
          <ul className={styles.siteDarkList}>
            <li>Discovery: {enterpriseTier.structure.discovery}</li>
            <li>Build: {enterpriseTier.structure.build}</li>
            <li>Managed: {enterpriseTier.structure.managed}</li>
          </ul>
        </SiteSection>
      ) : null}

      <SiteSection variant="cream">
        <h2 className={styles.siteSectionTitle}>Enterprise signals we hear</h2>
        <ul className={styles.siteList}>
          {buyingSignals.strongFit.slice(0, 4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SiteSection>

      <SiteCtaBand
        title="Schedule enterprise discovery"
        lead={`${contact.cta} — we'll align security, governance, and coordination scope.`}
        primaryLabel={contact.cta}
        primaryHref="/contact"
        secondaryHref="/security"
        secondaryLabel="Security & privacy"
      />
    </>
  );
}
