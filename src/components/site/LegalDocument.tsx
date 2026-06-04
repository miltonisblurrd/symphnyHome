import type { LegalSection } from "@/data/legal-content";
import SiteSection from "@/components/site/sections/SiteSection";
import styles from "./site.module.css";

type LegalDocumentProps = {
  sections: LegalSection[];
  intro?: string;
};

export default function LegalDocument({ sections, intro }: LegalDocumentProps) {
  return (
    <SiteSection variant="light" reveal={false}>
      {intro ? <p className={styles.siteLegalIntro}>{intro}</p> : null}
      <div className={styles.siteLegalBody}>
        {sections.map((section) => (
          <article key={section.id} id={section.id} className={styles.siteLegalSection}>
            <h2 className={styles.siteLegalHeading}>{section.title}</h2>
            {section.paragraphs.map((p) => (
              <p key={p.slice(0, 48)} className={styles.siteLegalParagraph}>
                {p}
              </p>
            ))}
            {section.list ? (
              <ul className={styles.siteLegalList}>
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      <p className={styles.siteLegalDisclaimer}>
        This document is provided for operational clarity and is not legal advice. Have a
        Nevada-licensed attorney review before relying on it for your specific business structure,
        insurance, and contracts.
      </p>
    </SiteSection>
  );
}
