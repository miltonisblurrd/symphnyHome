import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";
import { getPublishedPacks } from "@/lib/content-packs";

const routes = [
  "",
  "/about",
  "/how-it-works",
  "/pricing",
  "/enterprise",
  "/solutions",
  "/case-studies",
  "/contact",
  "/safety",
  "/security",
  "/trust",
  "/faq",
  "/news",
  "/careers",
  "/how-to-videos",
  "/terms",
  "/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url.replace(/\/$/, "");
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/contact" || path === "/pricing" ? 0.9 : 0.7,
  }));

  const published = getPublishedPacks();
  const contentEntries: MetadataRoute.Sitemap = published.flatMap((pack) => {
    const slug = pack.metadata.slug;
    const modified = pack.metadata.publishedAt
      ? new Date(pack.metadata.publishedAt)
      : now;
    return [
      {
        url: `${base}/news/${slug}`,
        lastModified: modified,
        changeFrequency: "monthly" as const,
        priority: 0.85,
      },
      {
        url: `${base}/news/${slug}/faq`,
        lastModified: modified,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      },
      {
        url: `${base}/news/${slug}/guide`,
        lastModified: modified,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      },
    ];
  });

  return [...staticEntries, ...contentEntries];
}
