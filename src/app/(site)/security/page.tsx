import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { capabilities, faq } from "@/data/studio-data";

export const metadata = buildMetadata("security");

export default function SecurityPage() {
  const content = pageContent.security;
  const dataFaq = faq.find((item) =>
    item.question.toLowerCase().includes("sensitive data")
  );

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      {dataFaq ? (
        <section className={styles.marketingSection}>
          <h2>Data handling</h2>
          <p>{dataFaq.answer}</p>
        </section>
      ) : null}
      <section className={styles.marketingSection}>
        <h2>Enterprise capabilities</h2>
        <ul>
          {capabilities.enterprise.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Access is permissioned, workflows are auditable, and human checkpoints
          are designed intentionally—not bolted on after the fact.
        </p>
      </section>
    </MarketingPage>
  );
}
