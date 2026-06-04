import Link from "next/link";
import SiteSection from "@/components/site/sections/SiteSection";
import { headerCta } from "@/data/site-nav";
import styles from "../site.module.css";

type SiteCtaBandProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export default function SiteCtaBand({
  eyebrow = "Next step",
  title,
  lead,
  primaryHref = headerCta.href,
  primaryLabel = headerCta.label,
  secondaryHref,
  secondaryLabel,
}: SiteCtaBandProps) {
  return (
    <SiteSection variant="dark">
      <p className={styles.siteEyebrowLight}>{eyebrow}</p>
      <h2 className={styles.siteCtaBandTitle}>{title}</h2>
      {lead ? <p className={styles.siteCtaBandLead}>{lead}</p> : null}
      <div className={styles.siteCtaBandActions}>
        <Link href={primaryHref} className={styles.siteCtaPrimary}>
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link href={secondaryHref} className={styles.siteCtaSecondary}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </SiteSection>
  );
}
