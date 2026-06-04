import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import styles from "../site.module.css";

type SiteStubContentProps = {
  message: string;
};

export default function SiteStubContent({ message }: SiteStubContentProps) {
  return (
    <>
      <SiteSection variant="light">
        <div className={styles.siteStubNotice}>
          <p>{message}</p>
        </div>
      </SiteSection>
      <SiteCtaBand
        title="Questions in the meantime?"
        lead="We're happy to talk through fit, timing, and what orchestration could look like for your team."
        secondaryHref="/faq"
        secondaryLabel="Browse FAQs"
      />
    </>
  );
}
