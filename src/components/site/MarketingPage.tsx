import type { ReactNode } from "react";
import styles from "./site.module.css";

type MarketingPageProps = {
  title: string;
  lead?: string;
  children: ReactNode;
};

export default function MarketingPage({ title, lead, children }: MarketingPageProps) {
  return (
    <article className={styles.marketingMain}>
      <h1 className={styles.marketingTitle}>{title}</h1>
      {lead ? <p className={styles.marketingLead}>{lead}</p> : null}
      {children}
    </article>
  );
}
