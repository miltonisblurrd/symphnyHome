import { siteConfig } from "@/lib/site-config";
import type { ContentPack } from "@/lib/content-packs";
import { loadMarkdownFile, parseFaqQuestions, parseHowToSteps, getPackHeroImageSrc } from "@/lib/content-packs";

type ArticleJsonLdProps = {
  pack: ContentPack;
  variant: "article" | "faq" | "guide";
};

export default function ArticleJsonLd({ pack, variant }: ArticleJsonLdProps) {
  const base = siteConfig.url.replace(/\/$/, "");
  const meta = pack.metadata;
  const articleUrl = `${base}/news/${meta.slug}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: siteConfig.name,
      url: base,
    },
  ];

  if (variant === "article") {
    const blog = loadMarkdownFile(pack, "blog.md");
    const hero = getPackHeroImageSrc(pack);
    const imageUrl = hero.startsWith("/")
      ? `${base}${hero}`
      : hero;
    graph.push({
      "@type": meta.schema?.articleType ?? "BlogPosting",
      "@id": `${articleUrl}#article`,
      headline: meta.title,
      description: meta.description,
      url: articleUrl,
      image: imageUrl,
      datePublished: meta.publishedAt ?? undefined,
      author: { "@type": "Organization", name: siteConfig.name },
      publisher: { "@id": `${base}/#organization` },
      keywords: [meta.primaryKeyword, ...(meta.secondaryKeywords ?? [])].join(", "),
      mainEntityOfPage: articleUrl,
      wordCount: blog?.content.split(/\s+/).length,
    });
  }

  if (variant === "faq") {
    const faq = loadMarkdownFile(pack, "faq.md");
    const questions = faq ? parseFaqQuestions(faq.content) : [];
    graph.push({
      "@type": "FAQPage",
      "@id": `${articleUrl}/faq#faqpage`,
      url: `${articleUrl}/faq`,
      mainEntity: questions.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: q.answer.replace(/\n+/g, " ").slice(0, 5000),
        },
      })),
    });
  }

  if (variant === "guide") {
    const guide = loadMarkdownFile(pack, "guide.md");
    const steps = guide ? parseHowToSteps(guide.content) : [];
    const data = guide?.data ?? {};
    graph.push({
      "@type": "HowTo",
      "@id": `${articleUrl}/guide#howto`,
      name: (data.title as string) ?? `How to — ${meta.title}`,
      description: meta.description,
      totalTime: data.estimatedMinutes ? `PT${data.estimatedMinutes}M` : undefined,
      step: steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text.slice(0, 2000),
      })),
    });
  }

  const jsonLd = { "@context": "https://schema.org", "@graph": graph };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
