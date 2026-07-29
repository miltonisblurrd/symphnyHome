"use client";

import InspiredClosetsLogo, { ChatIcon } from "./InspiredClosetsLogo";
import styles from "./gavin-dashboard.module.css";

export type NavSectionId =
  | "attention"
  | "finance"
  | "pipeline"
  | "schedule"
  | "activity"
  | "leads"
  | "ask";

type NavItem = { id: NavSectionId; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

export const SIDEBAR_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { id: "attention", label: "Dashboard", icon: "▦" },
      { id: "finance", label: "Financial Pulse", icon: "◈" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "pipeline", label: "Job Pipeline", icon: "▤" },
      { id: "schedule", label: "Schedule", icon: "◷" },
      { id: "activity", label: "Activity", icon: "◎" },
    ],
  },
  {
    label: "Finance",
    items: [{ id: "leads", label: "Leads", icon: "◉" }],
  },
];

type GavinSidebarProps = {
  activeSection: NavSectionId;
  onNavigate: (id: NavSectionId) => void;
  qbConnected: boolean;
  open: boolean;
  onClose: () => void;
};

export default function GavinSidebar({
  activeSection,
  onNavigate,
  qbConnected,
  open,
  onClose,
}: GavinSidebarProps) {
  return (
    <>
      <button
        type="button"
        className={`${styles.sidebarBackdrop} ${open ? styles.sidebarBackdropOpen : ""}`}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`} aria-label="Main navigation">
        <div className={styles.sidebarBrand}>
          <InspiredClosetsLogo />
        </div>

        <div className={styles.sidebarCubby}>
          <button
            type="button"
            className={styles.sidebarCta}
            onClick={() => {
              onNavigate("ask");
              onClose();
            }}
          >
            <ChatIcon />
            Ask Your Partner Cubby
          </button>
        </div>

        <nav className={styles.sidebarNav}>
          {SIDEBAR_NAV.map((group) => (
            <div key={group.label} className={styles.navGroup}>
              <p className={styles.navGroupLabel}>{group.label}</p>
              <ul className={styles.navList}>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`${styles.navItem} ${
                        activeSection === item.id ? styles.navItemActive : ""
                      }`}
                      onClick={() => {
                        onNavigate(item.id);
                        onClose();
                      }}
                    >
                      <span className={styles.navIcon} aria-hidden>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.qbStatus}>
            <span
              className={`${styles.qbDot} ${qbConnected ? styles.qbDotOn : styles.qbDotOff}`}
              aria-hidden
            />
            <div>
              <p className={styles.qbLabel}>QuickBooks</p>
              <p className={styles.qbMeta}>
                {qbConnected ? "Sandbox connected" : "Not connected"}
              </p>
            </div>
          </div>
          {!qbConnected ? (
            <a className={styles.sidebarLink} href="/api/integrations/quickbooks/connect">
              Connect sandbox
            </a>
          ) : null}
        </div>
      </aside>
    </>
  );
}
