import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingPageShell from "@/components/site/MarketingPageShell";
import SiteSection from "@/components/site/sections/SiteSection";
import PackMarkdown, { PackNavLinks } from "@/components/site/PackMarkdown";
import ArticleJsonLd from "@/components/site/ArticleJsonLd";
import { marketingHeroes } from "@/data/marketing-heroes";
import { siteConfig } from "@/lib/site-config";
import { getPackBySlug, getPublishedPacks, loadMarkdownFile } from "@/lib/content-packs";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getPublishedPacks().map((p) => ({ slug: p.metadata.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pack = getPackBySlug(slug);
  if (!pack?.metadata.published) return { title: "Not found" };

  const url = `${siteConfig.url.replace(/\/$/, "")}/news/${slug}/faq`;
  const title = `FAQ — ${pack.metadata.title} | Symphony Studio`;

  return {
    title,
    description: `Answers to common questions about ${pack.metadata.title.toLowerCase()}.`,
    alternates: { canonical: url },
    openGraph: { title, url, siteName: siteConfig.name },
  };
}

export default async function NewsFaqPage({ params }: Props) {
  const { slug } = await params;
  const pack = getPackBySlug(slug);
  if (!pack?.metadata.published) notFound();

  const faq = loadMarkdownFile(pack, "faq.md");
  if (!faq) notFound();

  return (
    <>
      <ArticleJsonLd pack={pack} variant="faq" />
      <MarketingPageShell hero={marketingHeroes.news}>
        <SiteSection variant="light" reveal={false}>
          <PackNavLinks slug={slug} />
          <PackMarkdown content={faq.content} />
        </SiteSection>
      </MarketingPageShell>
    </>
  );
}
