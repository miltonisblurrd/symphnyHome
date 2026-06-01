import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";

export const metadata = buildMetadata("news");

export default function NewsPage() {
  const content = pageContent.news;

  return (
    <MarketingPage title={content.title} lead={content.description}>
      <section className={styles.marketingSection}>
        <p>{content.stub}</p>
      </section>
    </MarketingPage>
  );
}
