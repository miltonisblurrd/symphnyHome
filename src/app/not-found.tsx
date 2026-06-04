import Link from "next/link";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import styles from "@/components/site/site.module.css";

export default function NotFound() {
  return (
    <div className={styles.siteLayout}>
      <SiteHeader />
      <main className={styles.notFoundMain}>
        <p className={styles.siteEyebrowDark}>404</p>
        <h1 className={styles.notFoundTitle}>This movement isn&apos;t in the score</h1>
        <p className={styles.notFoundLead}>
          The page you requested doesn&apos;t exist or may have moved. Head back to the studio.
        </p>
        <div className={styles.notFoundActions}>
          <Link href="/" className={styles.siteCtaPrimary}>
            Home
          </Link>
          <Link href="/contact" className={styles.siteCtaSecondary}>
            Contact us
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
