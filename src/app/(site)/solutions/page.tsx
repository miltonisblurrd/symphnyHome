import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { capabilities, services } from "@/data/studio-data";

export const metadata = buildMetadata("solutions");

export default function SolutionsPage() {
  const content = pageContent.solutions;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      {services.map((service) => (
        <section key={service.id} className={styles.marketingSection}>
          <h2>{service.name}</h2>
          <p>{service.description}</p>
          <h3>What we solve</h3>
          <ul>
            {service.solves.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Examples</h3>
          <ul>
            {service.examples.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <section className={styles.marketingSection}>
        <h2>Capabilities</h2>
        {Object.entries(capabilities).map(([key, items]) => (
          <div key={key}>
            <h3>{key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</h3>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </MarketingPage>
  );
}
