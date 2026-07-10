import Image from "next/image";
import type { ContentPack } from "@/lib/content-packs";
import { getPackHeroImageSrc } from "@/lib/content-packs";
import type { SiteHeroProps } from "@/components/site/SiteHero";
import styles from "./site.module.css";

export function packToArticleHero(pack: ContentPack): SiteHeroProps {
  const meta = pack.metadata;
  return {
    id: meta.slug,
    eyebrow: meta.themeLabel ?? "Article",
    title: meta.title,
    lead: meta.description,
    imageSrc: getPackHeroImageSrc(pack),
    primaryCta: meta.cta ?? { label: "Book a discovery call", href: "/contact" },
    secondaryCta: { label: "Step-by-step guide", href: `/news/${meta.slug}/guide` },
  };
}

type PackArticleThumbnailProps = {
  pack: ContentPack;
  alt?: string;
  priority?: boolean;
};

/** Same image as article hero — used on guide page and news index. */
export default function PackArticleThumbnail({
  pack,
  alt,
  priority = false,
}: PackArticleThumbnailProps) {
  const src = getPackHeroImageSrc(pack);
  const label = alt ?? pack.metadata.title;

  return (
    <div className={styles.packThumbnail}>
      <Image
        src={src}
        alt={label}
        fill
        sizes="(max-width: 768px) 100vw, 720px"
        className={styles.packThumbnailImage}
        priority={priority}
      />
    </div>
  );
}
