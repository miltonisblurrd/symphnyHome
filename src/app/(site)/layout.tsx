import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import SiteJsonLd from "@/components/site/SiteJsonLd";
import styles from "@/components/site/site.module.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.siteLayout}>
      <SiteJsonLd />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
