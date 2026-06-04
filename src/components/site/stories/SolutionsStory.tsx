import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import SiteReveal from "@/components/site/SiteReveal";
import { capabilities, services } from "@/data/studio-data";
import styles from "../site.module.css";

export default function SolutionsStory() {
  return (
    <>
      {services.map((service, index) => (
        <SiteSection
          key={service.id}
          variant={index % 2 === 0 ? "cream" : "light"}
          delay={index * 40}
        >
          <p className={styles.siteEyebrowDark}>Solution</p>
          <h2 className={styles.siteSectionTitleDark}>{service.name}</h2>
          <p className={styles.siteSectionLead}>{service.description}</p>
          <div className={styles.siteTwoCol}>
            <div>
              <h3 className={styles.siteSubheading}>What we solve</h3>
              <ul className={styles.siteList}>
                {service.solves.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className={styles.siteSubheading}>Examples</h3>
              <ul className={styles.siteTagList}>
                {service.examples.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </SiteSection>
      ))}

      <SiteSection variant="warm" ariaLabelledBy="capabilities-title">
        <p className={styles.siteEyebrow}>Capabilities</p>
        <h2 id="capabilities-title" className={styles.siteSectionTitle}>
          What we orchestrate
        </h2>
        <div className={styles.siteCapabilityGrid}>
          {Object.entries(capabilities).map(([key, items], index) => (
            <SiteReveal key={key} delay={index * 60}>
              <article className={styles.siteCapabilityCard}>
                <h3>
                  {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                </h3>
                <ul>
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </SiteReveal>
          ))}
        </div>
      </SiteSection>

      <SiteCtaBand
        title="See orchestration in practice"
        secondaryHref="/case-studies"
        secondaryLabel="Case studies"
      />
    </>
  );
}
