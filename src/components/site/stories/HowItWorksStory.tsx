import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import SiteReveal from "@/components/site/SiteReveal";
import { philosophy, symphonyModel } from "@/data/studio-data";
import styles from "../site.module.css";

export default function HowItWorksStory() {
  return (
    <>
      <SiteSection variant="light" ariaLabelledBy="how-principles-title">
        <p className={styles.siteEyebrowDark}>Our approach</p>
        <h2 id="how-principles-title" className={styles.siteSectionTitleDark}>
          Design principles
        </h2>
        <div className={styles.sitePrincipleGrid}>
          {philosophy.designPrinciples.map((p, i) => (
            <SiteReveal key={p.name} delay={i * 50}>
              <article className={styles.sitePrincipleCard}>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
              </article>
            </SiteReveal>
          ))}
        </div>
      </SiteSection>

      <SiteSection variant="warm" ariaLabelledBy="how-model-title">
        <p className={styles.siteEyebrow}>The symphony model</p>
        <h2 id="how-model-title" className={styles.siteSectionTitle}>
          Five layers of performance
        </h2>
        <ol className={styles.siteTimeline}>
          {symphonyModel.map((layer, index) => (
            <SiteReveal key={layer.layer} delay={index * 70}>
              <li className={styles.siteTimelineStep}>
                <span className={styles.siteTimelineNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <article className={styles.siteTimelineCard}>
                  <p className={styles.siteTimelineLayer}>{layer.layer}</p>
                  <p className={styles.siteTimelineRole}>{layer.role}</p>
                  <p>{layer.description}</p>
                </article>
              </li>
            </SiteReveal>
          ))}
        </ol>
      </SiteSection>

      <SiteSection variant="dark" ariaLabelledBy="how-fit-title">
        <p className={styles.siteEyebrowLight}>Good fit</p>
        <h2 id="how-fit-title" className={styles.siteProblemTitle}>
          Strong candidates for orchestration
        </h2>
        <ul className={styles.siteDarkList}>
          {philosophy.automationCriteria.goodCandidates.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SiteSection>

      <SiteCtaBand
        title="Ready to map your orchestra?"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      />
    </>
  );
}
