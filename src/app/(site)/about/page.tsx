import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { brand, philosophy, successMetrics, symphonyModel } from "@/data/studio-data";

export const metadata = buildMetadata("about");

export default function AboutPage() {
  const content = pageContent.about;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      <section className={styles.marketingSection}>
        <p>{brand.tagline}</p>
        <p>
          <strong>{brand.pillars.join(" · ")}</strong>
        </p>
      </section>
      <section className={styles.marketingSection}>
        <h2>What we believe</h2>
        <ul>
          {philosophy.coreBeliefs.map((belief) => (
            <li key={belief}>{belief}</li>
          ))}
        </ul>
      </section>
      <section className={styles.marketingSection}>
        <h2>The problem we exist to solve</h2>
        <p>
          Most businesses don&apos;t have a software problem. They have a coordination
          problem. Leads come in, sales follows up, operations schedules, project
          managers coordinate, accounting tracks invoices, leadership tries to see
          what&apos;s happening—everyone is talented, everyone has tools, yet things
          still feel chaotic. The instruments aren&apos;t playing together.
        </p>
      </section>
      <section className={styles.marketingSection}>
        <h2>The symphony model</h2>
        {symphonyModel.map((layer) => (
          <div key={layer.layer}>
            <h3>
              {layer.layer} — {layer.role}
            </h3>
            <p>{layer.description}</p>
            <ul>
              {layer.examples.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className={styles.marketingSection}>
        <h2>How we measure success</h2>
        <p>{successMetrics.definition}</p>
        <h3>Operational</h3>
        <ul>
          {successMetrics.operational.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3>Client experience</h3>
        <ul>
          {successMetrics.clientExperience.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </MarketingPage>
  );
}
