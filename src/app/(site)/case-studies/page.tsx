import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { caseStudies } from "@/data/studio-data";

export const metadata = buildMetadata("caseStudies");

export default function CaseStudiesPage() {
  const content = pageContent.caseStudies;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      {caseStudies.map((study) => (
        <section key={study.id} className={`${styles.marketingSection} ${styles.card}`}>
          <h2 className={styles.cardTitle}>{study.title}</h2>
          <p className={styles.cardMeta}>{study.clientType}</p>
          <h3>Problem</h3>
          <p>{study.problem}</p>
          <h3>Solution</h3>
          <ul>
            {study.solution.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Outcome</h3>
          <ul>
            {study.outcome.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </MarketingPage>
  );
}
