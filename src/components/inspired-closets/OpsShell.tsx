"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import OpsRoleGate from "@/components/inspired-closets/OpsRoleGate";
import InspiredClosetsLogo from "@/components/inspired-closets/InspiredClosetsLogo";
import styles from "./ops-shell.module.css";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

/** Process-shaped for Des, then supporting lanes. */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Process",
    items: [
      { href: "/inspired-closets/ops/leads", label: "Leads", icon: "◉" },
      { href: "/inspired-closets/ops/schedule", label: "Schedule", icon: "◷" },
      { href: "/inspired-closets/ops/billing", label: "Billing", icon: "◈" },
      { href: "/inspired-closets/ops/finance", label: "Finance", icon: "◆" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/inspired-closets/ops/jobs", label: "Jobs", icon: "▤" },
      { href: "/inspired-closets/ops/inventory", label: "Inventory", icon: "▣" },
      { href: "/inspired-closets/ops/crew", label: "Crew", icon: "◎" },
      { href: "/inspired-closets/field", label: "Field app", icon: "▸" },
    ],
  },
  {
    label: "People",
    items: [{ href: "/inspired-closets/ops", label: "Payroll", icon: "▦" }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/inspired-closets/ops") return pathname === href;
  return pathname.startsWith(href);
}

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <OpsRoleGate>
      <div className={styles.page}>
        <button
          type="button"
          className={`${styles.sidebarBackdrop} ${sidebarOpen ? styles.sidebarBackdropOpen : ""}`}
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />

        <aside
          className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
          aria-label="Inspired Closets OS navigation"
        >
          <div className={styles.sidebarBrand}>
            <InspiredClosetsLogo />
            <p className={styles.osLabel}>Inspired Closets OS</p>
          </div>

          <nav className={styles.sidebarNav}>
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className={styles.navGroup}>
                <p className={styles.navGroupLabel}>{group.label}</p>
                <ul className={styles.navList}>
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <span className={styles.navIcon} aria-hidden>
                            {item.icon}
                          </span>
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className={styles.sidebarBottom}>
            <Link href="/inspired-closets/gavin" className={styles.sidebarLink}>
              Gavin dashboard
            </Link>
          </div>
        </aside>

        <div className={styles.main}>
          <header className={styles.topBar}>
            <button
              type="button"
              className={styles.menuBtn}
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
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
      </div>
    </OpsRoleGate>
  );
}
