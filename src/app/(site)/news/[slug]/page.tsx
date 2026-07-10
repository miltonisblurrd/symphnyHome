import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingPageShell from "@/components/site/MarketingPageShell";
import SiteSection from "@/components/site/sections/SiteSection";
import PackMarkdown, { PackNavLinks } from "@/components/site/PackMarkdown";
import { packToArticleHero } from "@/components/site/PackArticleHero";
import ArticleJsonLd from "@/components/site/ArticleJsonLd";
import { siteConfig } from "@/lib/site-config";
import {
  getPackBySlug,
  getPublishedPacks,
  getPackHeroImageSrc,
  loadMarkdownFile,
  estimateReadingTime,
} from "@/lib/content-packs";
import styles from "@/components/site/site.module.css";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getPublishedPacks().map((p) => ({ slug: p.metadata.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pack = getPackBySlug(slug);
  if (!pack?.metadata.published) return { title: "Not found" };

  const url = `${siteConfig.url.replace(/\/$/, "")}/news/${slug}`;
  const title = `${pack.metadata.title} | Symphony Studio`;
  const hero = getPackHeroImageSrc(pack);
  const ogImage = hero.startsWith("/") ? `${siteConfig.url.replace(/\/$/, "")}${hero}` : hero;

  return {
    title,
    description: pack.metadata.description,
    keywords: [pack.metadata.primaryKeyword, ...(pack.metadata.secondaryKeywords ?? [])],
    alternates: { canonical: url },
    openGraph: {
      title,
      description: pack.metadata.description,
      url,
      siteName: siteConfig.name,
      type: "article",
      publishedTime: pack.metadata.publishedAt ?? undefined,
      images: [{ url: ogImage, width: 1200, height: 675, alt: pack.metadata.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: pack.metadata.description,
      images: [ogImage],
    },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;
  const pack = getPackBySlug(slug);
  if (!pack?.metadata.published) notFound();

  const blog = loadMarkdownFile(pack, "blog.md");
  if (!blog) notFound();

  const readingTime = pack.metadata.readingTimeMinutes ?? estimateReadingTime(blog.content);

  return (
    <>
      <ArticleJsonLd pack={pack} variant="article" />
      <MarketingPageShell hero={packToArticleHero(pack)}>
        <SiteSection variant="light" reveal={false}>
          <PackNavLinks slug={slug} />
          <p className={styles.packReadingTime}>{readingTime} min read</p>
          <PackMarkdown content={blog.content} />
        </SiteSection>
      </MarketingPageShell>
    </>
  );
}
