import Image from "next/image";
import Link from "next/link";
import { headerCta } from "@/data/site-nav";
import styles from "./site.module.css";

type SiteHeaderProps = {
  variant?: "dark" | "light";
};

export default function SiteHeader({ variant = "light" }: SiteHeaderProps) {
  return (
    <header
      className={`${styles.siteHeader} ${variant === "dark" ? styles.siteHeaderDark : ""}`}
    >
      <Link href="/" className={styles.siteLogo}>
        <Image
          src="/symphnyNavLogo.svg"
          alt="Symphony"
          width={160}
          height={40}
          priority
        />
      </Link>
      <Link href={headerCta.href} className={styles.ctaButton}>
        {headerCta.label}
      </Link>
    </header>
  );
}
