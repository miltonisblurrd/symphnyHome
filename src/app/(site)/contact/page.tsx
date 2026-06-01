import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { contact } from "@/data/studio-data";

export const metadata = buildMetadata("contact");

export default function ContactPage() {
  const content = pageContent.contact;

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      <section className={styles.marketingSection}>
        <h2>Get in touch</h2>
        <p>
          Email:{" "}
          <a href={`mailto:${contact.email}`} className={styles.contactLink}>
            {contact.email}
          </a>
        </p>
        <p>Location: {contact.location}</p>
        <p>
          <a href={contact.booking} className={styles.contactLink}>
            {contact.cta}
          </a>
        </p>
      </section>
    </MarketingPage>
  );
}
