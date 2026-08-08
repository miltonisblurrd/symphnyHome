"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./ops-shell.module.css";

const NAV = [
  { href: "/inspired-closets/ops/jobs", label: "Jobs" },
  { href: "/inspired-closets/ops", label: "Payroll" },
] as const;

export default function OpsShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.brandBlock}>
          <p className={styles.brand}>Inspired Closets OS</p>
          <nav className={styles.nav}>
            {NAV.map((item) => {
              const active =
                item.href === "/inspired-closets/ops"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
