"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import OpsRoleGate from "@/components/inspired-closets/OpsRoleGate";
import InspiredClosetsLogo from "@/components/inspired-closets/InspiredClosetsLogo";
import {
  IC_STAFF_NAME_COOKIE,
  IC_STAFF_ROLE_COOKIE,
} from "@/lib/inspired-closets-ops-field";
import {
  canAccessOpsPage,
  filterNavHrefForRole,
  IC_INVENTORY_HOME,
  isInventoryRole,
} from "@/lib/inspired-closets-ops-roles";
import styles from "./ops-shell.module.css";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

/** Sequenced process for Des → Craig → money, then supporting lanes. */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Projects",
    items: [{ href: "/inspired-closets/ops/projects", label: "Projects", icon: "▤" }],
  },
  {
    label: "Process",
    items: [
      { href: "/inspired-closets/ops/leads", label: "Leads", icon: "◉" },
      { href: "/inspired-closets/ops/appointments", label: "Calendar", icon: "◷" },
      { href: "/inspired-closets/ops/billing", label: "Payments", icon: "◈" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/inspired-closets/ops/inventory", label: "Inventory", icon: "▦" },
      { href: "/inspired-closets/ops/inventory/receiving", label: "Receiving", icon: "▣" },
      { href: "/inspired-closets/ops/installers", label: "Install Workers", icon: "◎" },
      { href: "/inspired-closets/ops/designers", label: "Designer portal", icon: "✎" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/inspired-closets/ops", label: "Payroll", icon: "▦" },
      { href: "/inspired-closets/ops/finance", label: "Billing", icon: "◆" },
    ],
  },
];

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .filter(Boolean)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!row) return null;
  return decodeURIComponent(row.slice(name.length + 1));
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/inspired-closets/ops") return pathname === href;
  if (href === "/inspired-closets/ops/appointments") {
    return (
      pathname.startsWith("/inspired-closets/ops/appointments") ||
      pathname.startsWith("/inspired-closets/ops/installs") ||
      pathname.startsWith("/inspired-closets/ops/schedule")
    );
  }
  if (href === "/inspired-closets/ops/projects") {
    return (
      pathname.startsWith("/inspired-closets/ops/projects") ||
      pathname.startsWith("/inspired-closets/ops/jobs")
    );
  }
  if (href === "/inspired-closets/ops/installers") {
    return (
      pathname.startsWith("/inspired-closets/ops/installers") ||
      pathname.startsWith("/inspired-closets/ops/crew")
    );
  }
  if (href === "/inspired-closets/ops/inventory") {
    return (
      pathname === href ||
      (pathname.startsWith(`${href}/`) && !pathname.includes("/receiving"))
    );
  }
  return pathname.startsWith(href);
}

export default function OpsShell({
  title,
  subtitle,
  actions,
  hideTitle,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [staffRole, setStaffRole] = useState<string | null>(() => readCookie(IC_STAFF_ROLE_COOKIE));
  const [staffName, setStaffName] = useState<string | null>(() => readCookie(IC_STAFF_NAME_COOKIE));
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setStaffRole(readCookie(IC_STAFF_ROLE_COOKIE));
    setStaffName(readCookie(IC_STAFF_NAME_COOKIE));
  }, []);

  useEffect(() => {
    if (!isInventoryRole(staffRole)) return;
    if (canAccessOpsPage(staffRole, pathname)) return;
    router.replace(IC_INVENTORY_HOME);
  }, [staffRole, pathname, router]);

  const navGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => filterNavHrefForRole(staffRole, item.href)),
    })).filter((group) => group.items.length > 0);
  }, [staffRole]);

  const inventoryOnly = isInventoryRole(staffRole);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/inspired-closets/access", { method: "DELETE" });
      window.location.href = "/inspired-closets/access";
    } catch {
      setSigningOut(false);
    }
  }

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
            {navGroups.map((group) => (
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
            {inventoryOnly ? null : (
              <>
                <Link
                  href="/inspired-closets/ops/designer-sales"
                  className={`${styles.sidebarLink} ${pathname.startsWith("/inspired-closets/ops/designer-sales") ? styles.sidebarLinkActive : ""}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  Craig’s dashboard
                </Link>
                <Link
                  href="/inspired-closets/gavin"
                  className={`${styles.sidebarLink} ${pathname.startsWith("/inspired-closets/gavin") ? styles.sidebarLinkActive : ""}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  Gavin dashboard
                </Link>
              </>
            )}
            {staffName || inventoryOnly ? (
              <div className={styles.sidebarSession}>
                {staffName ? <p className={styles.sidebarSessionName}>{staffName}</p> : null}
                <button
                  type="button"
                  className={styles.signOutBtn}
                  onClick={() => void signOut()}
                  disabled={signingOut}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <div className={styles.main}>
          <header className={`${styles.topBar} ${hideTitle ? styles.topBarCompact : ""}`}>
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
            {hideTitle ? null : (
              <div className={styles.headerRow}>
                <div>
                  <h1 className={styles.title}>{title}</h1>
                  {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
                </div>
                {actions ? <div className={styles.actions}>{actions}</div> : null}
              </div>
            )}
          </header>
          {children}
        </div>
      </div>
    </OpsRoleGate>
  );
}
