import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { philosophy } from "@/data/studio-data";

export const metadata = buildMetadata("safety");

export default function SafetyPage() {
  const content = pageContent.safety;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      <section className={styles.marketingSection}>
        <h2>Our approach to risk</h2>
        <ul>
          {philosophy.riskPhilosophy.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          We stabilize manual processes before automating them, and we design for
          recoverable failure—not silent breakage.
        </p>
      </section>
    </MarketingPage>
  );
}
