import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import { caseStudies } from "@/data/studio-data";
import styles from "../site.module.css";

export default function CaseStudiesStory() {
  return (
    <>
      {caseStudies.map((study, index) => (
        <SiteSection
          key={study.id}
          variant={index % 2 === 0 ? "cream" : "light"}
          delay={index * 50}
        >
          <p className={styles.siteEyebrowDark}>{study.clientType}</p>
          <h2 className={styles.siteSectionTitleDark}>{study.title}</h2>
          <p className={styles.siteSectionLead}>{study.problem}</p>
          <div className={styles.siteTwoCol}>
            <div>
              <h3 className={styles.siteSubheading}>Solution</h3>
              <ul className={styles.siteList}>
                {study.solution.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className={styles.siteSubheading}>Outcome</h3>
              <ul className={styles.siteList}>
                {study.outcome.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </SiteSection>
      ))}

      <SiteCtaBand
        title="Want results like these?"
        lead="Start with a discovery call—we'll identify where coordination is costing you today."
        secondaryHref="/solutions"
        secondaryLabel="Our solutions"
      />
    </>
  );
}
