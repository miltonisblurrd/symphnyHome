import ContactForm from "@/components/site/ContactForm";
import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import { contact } from "@/data/studio-data";
import { buyingSignals } from "@/data/studio-data";
import { siteConfig } from "@/lib/site-config";
import styles from "../site.module.css";

export default function ContactStory() {
  return (
    <>
      <SiteSection variant="light" ariaLabelledBy="contact-panel-title">
        <div className={styles.siteContactGrid}>
          <div className={styles.siteContactPanel}>
            <p className={styles.siteEyebrowDark}>Reach us</p>
            <h2 id="contact-panel-title" className={styles.siteSectionTitleDark}>
              Book a discovery call
            </h2>
            <p className={styles.siteSectionLead}>
              Share where coordination breaks down today—handoffs, visibility, disconnected
              tools—and what performance should look like in 90 days.
            </p>
            <div className={styles.siteContactActions}>
              <a href={siteConfig.bookingUrl} className={styles.siteCtaPrimary}>
                {contact.cta}
              </a>
              <a href={`mailto:${contact.email}`} className={styles.siteContactEmail}>
                {contact.email}
              </a>
            </div>
            <p className={styles.siteContactMeta}>{contact.location}</p>
            <ContactForm />
          </div>

          <div className={styles.siteContactFit}>
            <h3 className={styles.siteSubheading}>Often a strong fit when</h3>
            <ul className={styles.siteList}>
              {buyingSignals.strongFit.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </SiteSection>

      <SiteCtaBand
        title="Prefer to explore first?"
        secondaryHref="/how-it-works"
        secondaryLabel="How it works"
      />
    </>
  );
}
