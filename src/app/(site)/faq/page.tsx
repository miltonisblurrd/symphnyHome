import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { faq } from "@/data/studio-data";

export const metadata = buildMetadata("faq");

export default function FaqPage() {
  const content = pageContent.faq;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      <section className={styles.marketingSection}>
        {faq.map((item) => (
          <div key={item.question} className={styles.faqItem}>
            <h2 className={styles.faqQuestion}>{item.question}</h2>
            <p className={styles.faqAnswer}>{item.answer}</p>
          </div>
        ))}
      </section>
    </MarketingPage>
  );
}
