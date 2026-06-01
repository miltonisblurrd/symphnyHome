import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";

export const metadata = buildMetadata("terms");

export default function TermsPage() {
  const content = pageContent.terms;

  return (
    <MarketingPage title={content.title}>
      <p className={styles.draftNotice}>Draft — for attorney review.</p>
      <section className={styles.marketingSection}>
        <p>{content.stub}</p>
      </section>
    </MarketingPage>
  );
}
