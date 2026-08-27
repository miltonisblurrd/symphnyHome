import styles from "./site-forms.module.css";

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <span>&lt; inspiredclosets.com</span>
        <span>All locations</span>
      </div>
      <header className={styles.header}>
        <div className={styles.logoBox}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/inspired-closets/InspiredClosets_Logo_RGB-300x277.png" alt="Inspired Closets" />
        </div>
        <div className={styles.locationBlock}>
          <p className={styles.locationName}>Las Vegas</p>
          <a className={styles.locationPhone} href="tel:+17022599569">
            (702) 259-9569
          </a>
        </div>
        <div className={styles.headerSpacer} />
        <div className={styles.menuDots} aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        Inspired Closets Las Vegas · (702) 259-9569
      </footer>
    </div>
  );
}
