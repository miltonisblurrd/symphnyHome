"use client";

import styles from "./gavin-dashboard.module.css";

type GavinTopBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onMenuToggle: () => void;
  viewer: string;
};

export default function GavinTopBar({
  search,
  onSearchChange,
  onMenuToggle,
  viewer,
}: GavinTopBarProps) {
  return (
    <header className={styles.topChrome}>
      <button
        type="button"
        className={styles.menuBtn}
        aria-label="Open navigation"
        onClick={onMenuToggle}
      >
        <span />
        <span />
        <span />
      </button>

      <label className={styles.searchField}>
        <span className={styles.searchIcon} aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search jobs, leads, exceptions…"
          aria-label="Search dashboard"
        />
        <kbd className={styles.searchHint}>/</kbd>
      </label>

      <div className={styles.topActions}>
        <div className={styles.avatar} title={viewer} aria-label={viewer}>
          {viewer
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </div>
      </div>
    </header>
  );
}
