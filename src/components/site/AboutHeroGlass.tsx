"use client";

import styles from "./site.module.css";

const RIB_COUNT = 14;

export default function AboutHeroGlass() {
  return (
    <div className={styles.aboutHeroGlass} aria-hidden>
      {Array.from({ length: RIB_COUNT }, (_, i) => {
        const ribWidth = 100 / RIB_COUNT;

        return (
          <div
            key={i}
            className={styles.aboutHeroRib}
            style={{
              left: `${ribWidth * i}%`,
              width: `${ribWidth}%`,
            }}
          >
            <div className={styles.aboutHeroRibSheen} />
            <div className={styles.aboutHeroRibEdge} />
          </div>
        );
      })}

      <div className={styles.aboutHeroGrain} />
    </div>
  );
}
