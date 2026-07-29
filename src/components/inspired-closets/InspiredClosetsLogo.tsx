"use client";

import { useState } from "react";
import styles from "./gavin-dashboard.module.css";

type InspiredClosetsLogoProps = {
  location?: string;
};

const LOGO_SRC = "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png";

/**
 * Official logo sits on a White plaque so it is never reversed out on black chrome.
 */
export default function InspiredClosetsLogo({
  location = "Inspired Closets Las Vegas",
}: InspiredClosetsLogoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={styles.logoPlaque}>
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={LOGO_SRC}
          alt="Inspired Closets"
          width={52}
          height={48}
          className={styles.logoImage}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={styles.logoFallbackMark} aria-hidden>
          <span className={styles.logoFallbackScript}>Inspired</span>
        </div>
      )}
      <p className={styles.logoLocation}>{location}</p>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg
      className={styles.sidebarCtaIcon}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { ChatIcon };
