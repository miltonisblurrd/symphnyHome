import AboutHeroGlass from "@/components/site/AboutHeroGlass";
import AboutHeroLiquid from "@/components/site/AboutHeroLiquid";
import Image from "next/image";
import styles from "./site.module.css";

export default function AboutHero() {
  return (
    <section className={styles.aboutHero} aria-labelledby="about-hero-title">
      <div className={styles.aboutHeroMedia} aria-hidden>
        <Image
          src="/about-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className={styles.aboutHeroImageFallback}
        />
        <AboutHeroLiquid />
        <AboutHeroGlass />
        <div className={styles.aboutHeroScrim} />
      </div>

      <div className={styles.aboutHeroContent}>
        <h1 id="about-hero-title" className={styles.aboutHeroTitle}>
          Where Technology Meets Harmony
        </h1>
        <p className={styles.aboutHeroLead}>
          Symphony Studio helps businesses perform at their best by orchestrating the
          systems, workflows, and intelligence that drive modern operations.
        </p>
      </div>
    </section>
  );
}
