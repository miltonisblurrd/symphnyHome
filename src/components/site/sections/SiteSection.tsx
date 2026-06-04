import type { ReactNode } from "react";
import SiteReveal from "@/components/site/SiteReveal";
import styles from "../site.module.css";

type SiteSectionProps = {
  id?: string;
  variant?: "light" | "cream" | "dark" | "warm";
  ariaLabelledBy?: string;
  children: ReactNode;
  reveal?: boolean;
  delay?: number;
};

const variantClass: Record<NonNullable<SiteSectionProps["variant"]>, string> = {
  light: styles.siteSectionLight,
  cream: styles.siteSectionCream,
  dark: styles.siteSectionDark,
  warm: styles.siteSectionWarm,
};

export default function SiteSection({
  id,
  variant = "cream",
  ariaLabelledBy,
  children,
  reveal = true,
  delay = 0,
}: SiteSectionProps) {
  const inner = <div className={styles.siteSectionInner}>{children}</div>;

  return (
    <section
      id={id}
      className={`${styles.siteSection} ${variantClass[variant]}`}
      aria-labelledby={ariaLabelledBy}
    >
      {reveal ? <SiteReveal delay={delay}>{inner}</SiteReveal> : inner}
    </section>
  );
}
