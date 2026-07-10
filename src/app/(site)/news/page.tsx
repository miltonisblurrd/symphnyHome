import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import MarketingPageShell from "@/components/site/MarketingPageShell";
import SiteSection from "@/components/site/sections/SiteSection";
import { marketingHeroes } from "@/data/marketing-heroes";
import { siteConfig } from "@/lib/site-config";
import { getPublishedPacks, getPackHeroImageSrc } from "@/lib/content-packs";
import styles from "@/components/site/site.module.css";

export const metadata: Metadata = {
  title: "News & Insights | Symphony Studio",
  description:
    "Articles, guides, and FAQs on business orchestration, AI in operations, and the missing layer between tools and performance.",
  openGraph: {
    title: "News & Insights | Symphony Studio",
    description:
      "Articles, guides, and FAQs on business orchestration, AI in operations, and the missing layer between tools and performance.",
    url: `${siteConfig.url.replace(/\/$/, "")}/news`,
    siteName: siteConfig.name,
  },
};

export default function NewsPage() {
  const packs = getPublishedPacks();

  return (
    <MarketingPageShell hero={marketingHeroes.news}>
      <SiteSection variant="light" reveal={false}>
        <div className={styles.packIndexIntro}>
          <p>
            Practical writing on orchestration, AI in business operations, and building systems
            that perform—not just tools that pile up.
          </p>
        </div>
        {packs.length === 0 ? (
          <p className={styles.packEmpty}>
            Published articles will appear here. Set{" "}
            <code className={styles.packCode}>published: true</code> in a pack&apos;s{" "}
            <code className={styles.packCode}>metadata.json</code> after review.
          </p>
        ) : (
          <ul className={styles.packIndexList}>
            {packs.map((pack) => {
              const thumb = getPackHeroImageSrc(pack);
              return (
                <li key={pack.metadata.slug} className={styles.packIndexItem}>
                  <div className={styles.packIndexRow}>
                    <Link href={`/news/${pack.metadata.slug}`} className={styles.packIndexThumb}>
                      <Image
                        src={thumb}
                        alt=""
                        fill
                        sizes="160px"
                        className={styles.packIndexThumbImage}
                      />
                    </Link>
                    <div>
                      <Link href={`/news/${pack.metadata.slug}`} className={styles.packIndexTitle}>
                        {pack.metadata.title}
                      </Link>
                      <p className={styles.packIndexDesc}>{pack.metadata.description}</p>
                      <div className={styles.packIndexMeta}>
                        {pack.metadata.readingTimeMinutes ? (
                          <span>{pack.metadata.readingTimeMinutes} min read</span>
                        ) : null}
                        <Link
                          href={`/news/${pack.metadata.slug}/guide`}
                          className={styles.packIndexLink}
                        >
                          Guide
                        </Link>
                        <Link
                          href={`/news/${pack.metadata.slug}/faq`}
                          className={styles.packIndexLink}
                        >
                          FAQ
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SiteSection>
    </MarketingPageShell>
  );
}
