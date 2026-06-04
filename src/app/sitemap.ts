import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

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

  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/contact" || path === "/pricing" ? 0.9 : 0.7,
  }));
}
