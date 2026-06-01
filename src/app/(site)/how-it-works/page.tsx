import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { philosophy, symphonyModel } from "@/data/studio-data";

export const metadata = buildMetadata("howItWorks");

export default function HowItWorksPage() {
  const content = pageContent.howItWorks;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      <section className={styles.marketingSection}>
        <h2>Design principles</h2>
        {philosophy.designPrinciples.map((principle) => (
          <div key={principle.name}>
            <h3>{principle.name}</h3>
            <p>{principle.description}</p>
          </div>
        ))}
      </section>
      <section className={styles.marketingSection}>
        <h2>Layers of the symphony</h2>
        {symphonyModel.map((layer) => (
          <div key={layer.layer}>
            <h3>{layer.layer}</h3>
            <p>{layer.description}</p>
          </div>
        ))}
      </section>
      <section className={styles.marketingSection}>
        <h2>Good candidates for orchestration</h2>
        <ul>
          {philosophy.automationCriteria.goodCandidates.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>Poor candidates (still improvising)</h2>
        <ul>
          {philosophy.automationCriteria.badCandidates.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </MarketingPage>
  );
}
