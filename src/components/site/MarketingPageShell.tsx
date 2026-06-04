import type { ReactNode } from "react";
import SiteHero, { type SiteHeroProps } from "@/components/site/SiteHero";
import SitePageShell from "@/components/site/SitePageShell";
import styles from "./site.module.css";

type MarketingPageShellProps = {
  hero: SiteHeroProps;
  children: ReactNode;
};

export default function MarketingPageShell({ hero, children }: MarketingPageShellProps) {
  return (
    <SitePageShell>
      <SiteHero {...hero} />
      <div className={styles.siteStory}>{children}</div>
    </SitePageShell>
  );
}
