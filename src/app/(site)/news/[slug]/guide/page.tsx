import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingPageShell from "@/components/site/MarketingPageShell";
import SiteSection from "@/components/site/sections/SiteSection";
import PackMarkdown, { PackNavLinks } from "@/components/site/PackMarkdown";
import PackArticleThumbnail from "@/components/site/PackArticleHero";
import ArticleJsonLd from "@/components/site/ArticleJsonLd";
import { marketingHeroes } from "@/data/marketing-heroes";
import { siteConfig } from "@/lib/site-config";
import {
  getPackBySlug,
  getPublishedPacks,
  getPackHeroImageSrc,
  loadMarkdownFile,
} from "@/lib/content-packs";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getPublishedPacks().map((p) => ({ slug: p.metadata.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pack = getPackBySlug(slug);
  if (!pack?.metadata.published) return { title: "Not found" };

  const guide = loadMarkdownFile(pack, "guide.md");
  const guideTitle = (guide?.data.title as string) ?? `Guide — ${pack.metadata.title}`;
  const url = `${siteConfig.url.replace(/\/$/, "")}/news/${slug}/guide`;
  const hero = getPackHeroImageSrc(pack);
  const ogImage = hero.startsWith("/") ? `${siteConfig.url.replace(/\/$/, "")}${hero}` : hero;

  return {
    title: `${guideTitle} | Symphony Studio`,
    description: pack.metadata.description,
    alternates: { canonical: url },
    openGraph: {
      title: guideTitle,
      url,
      siteName: siteConfig.name,
      images: [{ url: ogImage, alt: guideTitle }],
    },
  };
}

export default async function NewsGuidePage({ params }: Props) {
  const { slug } = await params;
  const pack = getPackBySlug(slug);
  if (!pack?.metadata.published) notFound();

  const guide = loadMarkdownFile(pack, "guide.md");
  if (!guide) notFound();

  return (
    <>
      <ArticleJsonLd pack={pack} variant="guide" />
      <MarketingPageShell hero={marketingHeroes.news}>
        <SiteSection variant="light" reveal={false}>
          <PackNavLinks slug={slug} />
          <PackArticleThumbnail pack={pack} alt={`Guide: ${pack.metadata.title}`} />
          <PackMarkdown content={guide.content} />
        </SiteSection>
      </MarketingPageShell>
    </>
  );
}
