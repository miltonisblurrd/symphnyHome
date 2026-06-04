"use client";

import styles from "./site.module.css";

const RIB_COUNT = 14;

export default function SiteHeroGlass() {
  return (
    <div className={styles.siteHeroGlass} aria-hidden>
      {Array.from({ length: RIB_COUNT }, (_, i) => {
        const ribWidth = 100 / RIB_COUNT;

        return (
          <div
            key={i}
            className={styles.siteHeroRib}
            style={{
              left: `${ribWidth * i}%`,
              width: `${ribWidth}%`,
            }}
          >
            <div className={styles.siteHeroRibSheen} />
            <div className={styles.siteHeroRibEdge} />
          </div>
        );
      })}

      <div className={styles.siteHeroGrain} />
    </div>
  );
}
