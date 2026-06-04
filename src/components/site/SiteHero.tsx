import Image from "next/image";
import Link from "next/link";
import SiteHeroGlass from "@/components/site/SiteHeroGlass";
import SiteHeroLiquid from "@/components/site/SiteHeroLiquid";
import styles from "./site.module.css";

export type SiteHeroCta = {
  label: string;
  href: string;
};

export type SiteHeroProps = {
  id: string;
  eyebrow?: string;
  title: string;
  titleAccent?: string;
  lead: string;
  primaryCta?: SiteHeroCta;
  secondaryCta?: SiteHeroCta;
  imageSrc?: string;
};

export default function SiteHero({
  id,
  eyebrow,
  title,
  titleAccent,
  lead,
  primaryCta,
  secondaryCta,
  imageSrc = "/about-hero.png",
}: SiteHeroProps) {
  const titleId = `${id}-hero-title`;

  return (
    <section className={styles.siteHero} aria-labelledby={titleId}>
      <div className={styles.siteHeroMedia} aria-hidden>
        <Image
          src={imageSrc}
          alt=""
          fill
          priority
          sizes="100vw"
          className={styles.siteHeroImageFallback}
        />
        <SiteHeroLiquid />
        <SiteHeroGlass />
        <div className={styles.siteHeroScrim} />
      </div>

      <div className={styles.siteHeroContent}>
        {eyebrow ? <p className={styles.siteHeroEyebrow}>{eyebrow}</p> : null}
        <h1 id={titleId} className={styles.siteHeroTitle}>
          {title}
          {titleAccent ? (
            <>
              {" "}
              <span className={styles.siteHeroTitleAccent}>{titleAccent}</span>
            </>
          ) : null}
        </h1>
        <p className={styles.siteHeroLead}>{lead}</p>
        {primaryCta || secondaryCta ? (
          <div className={styles.siteHeroActions}>
            {primaryCta ? (
              <Link href={primaryCta.href} className={styles.siteHeroCtaPrimary}>
                {primaryCta.label}
              </Link>
            ) : null}
            {secondaryCta ? (
              <Link href={secondaryCta.href} className={styles.siteHeroCtaSecondary}>
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
