import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";

export const metadata = buildMetadata("careers");

export default function CareersPage() {
  const content = pageContent.careers;

  return (
    <MarketingPage title={content.title} lead={content.description}>
      <section className={styles.marketingSection}>
        <p>{content.stub}</p>
      </section>
    </MarketingPage>
  );
}
