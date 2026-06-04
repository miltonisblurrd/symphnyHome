"use client";

import { useState } from "react";
import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import SiteReveal from "@/components/site/SiteReveal";
import { faq } from "@/data/studio-data";
import styles from "../site.module.css";

export default function FaqStory() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <>
      <SiteSection variant="light" ariaLabelledBy="faq-list-title">
        <p className={styles.siteEyebrowDark}>Common questions</p>
        <h2 id="faq-list-title" className={styles.siteSectionTitleDark}>
          Coordination, subscriptions, and fit
        </h2>

        <div className={styles.siteFaqList}>
          {faq.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <SiteReveal key={item.question} delay={index * 40}>
                <div className={styles.siteFaqItem}>
                  <button
                    type="button"
                    className={styles.siteFaqQuestion}
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                  >
                    <span>{item.question}</span>
                    <span className={styles.siteFaqIcon} aria-hidden>
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen ? (
                    <p className={styles.siteFaqAnswer}>{item.answer}</p>
                  ) : null}
                </div>
              </SiteReveal>
            );
          })}
        </div>
      </SiteSection>

      <SiteCtaBand title="Still have questions?" secondaryHref="/contact" secondaryLabel="Contact sales" />
    </>
  );
}
