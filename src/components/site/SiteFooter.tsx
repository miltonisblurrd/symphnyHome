import Link from "next/link";
import { footerColumns } from "@/data/site-nav";
import styles from "./site.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.footerGrid}>
        {footerColumns.map((column) => (
          <div key={column.title}>
            <p className={styles.footerColumnTitle}>{column.title}</p>
            <ul className={styles.footerLinks}>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.footerLink}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={styles.footerBottom}>
        © {new Date().getFullYear()} Symphony Studio. All rights reserved.
      </p>
    </footer>
  );
}
