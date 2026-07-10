import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const PACKS_DIR = path.join(process.cwd(), "content", "packs");
const DEFAULT_HERO = "/heroes/hero-orchestra-engraving-wide.jpg";

export type PackMetadata = {
  id: string;
  slug: string;
  title: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
  aeQueries?: string[];
  theme: number;
  themeLabel?: string;
  type?: string;
  day?: number;
  workflow?: string;
  priority?: number;
  published?: boolean;
  publishedAt?: string | null;
  readingTimeMinutes?: number;
  canonicalPath?: string;
  /** Public path e.g. /news/missing-layer/hero.jpg */
  heroImage?: string;
  cta?: { label: string; href: string };
  internalLinks?: string[];
  schema?: {
    articleType?: string;
    faqCount?: number;
    howToSteps?: number;
  };
  youtubeChapters?: { time: string; title: string }[];
};

export type ContentPack = {
  dirName: string;
  dirPath: string;
  metadata: PackMetadata;
};

export type MarkdownDoc = {
  content: string;
  data: Record<string, unknown>;
};

function listPackDirs(): string[] {
  if (!fs.existsSync(PACKS_DIR)) return [];
  return fs
    .readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

function readMetadata(dirPath: string): PackMetadata | null {
  const metaPath = path.join(dirPath, "metadata.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as PackMetadata;
  } catch {
    return null;
  }
}

function packAssetHeroPath(pack: ContentPack): string | null {
  for (const name of ["article-hero.jpg", "article-hero.png", "article-hero.webp"]) {
    const p = path.join(pack.dirPath, "assets", name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function publicHeroPath(slug: string): string | null {
  const dir = path.join(process.cwd(), "public", "news", slug);
  for (const name of ["hero.jpg", "hero.png", "hero.webp"]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return `/news/${slug}/${name}`;
  }
  return null;
}

/** Public URL for pack article hero (blog, guide thumbnail, /news hero). */
export function getPackHeroImageSrc(pack: ContentPack): string {
  if (pack.metadata.heroImage?.startsWith("/")) {
    const disk = path.join(process.cwd(), "public", pack.metadata.heroImage.replace(/^\//, ""));
    if (fs.existsSync(disk)) return pack.metadata.heroImage;
  }
  const fromPublic = publicHeroPath(pack.metadata.slug);
  if (fromPublic) return fromPublic;
  return DEFAULT_HERO;
}

export function packHasCustomHero(pack: ContentPack): boolean {
  return getPackHeroImageSrc(pack) !== DEFAULT_HERO;
}

export function getAllPacks(): ContentPack[] {
  return listPackDirs()
    .map((dirName) => {
      const dirPath = path.join(PACKS_DIR, dirName);
      const metadata = readMetadata(dirPath);
      if (!metadata?.slug) return null;
      return { dirName, dirPath, metadata };
    })
    .filter((p): p is ContentPack => p !== null)
    .sort((a, b) => {
      const dateA = a.dirName.slice(0, 10);
      const dateB = b.dirName.slice(0, 10);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (a.metadata.priority ?? 99) - (b.metadata.priority ?? 99);
    });
}

export function getPublishedPacks(): ContentPack[] {
  return getAllPacks().filter((p) => p.metadata.published === true);
}

export function getPackBySlug(slug: string): ContentPack | undefined {
  return getAllPacks().find((p) => p.metadata.slug === slug);
}

export function loadMarkdownFile(
  pack: ContentPack,
  filename: "blog.md" | "guide.md" | "faq.md"
): MarkdownDoc | null {
  const filePath = path.join(pack.dirPath, filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { content, data } = matter(raw);
  return { content, data: data as Record<string, unknown> };
}

export function parseFaqQuestions(content: string): { question: string; answer: string }[] {
  const items: { question: string; answer: string }[] = [];
  const sections = content.split(/^## /m).slice(1);
  for (const section of sections) {
    const nl = section.indexOf("\n");
    if (nl === -1) continue;
    const question = section.slice(0, nl).trim();
    const answer = section.slice(nl + 1).trim();
    if (question && answer) items.push({ question, answer });
  }
  return items;
}

export function parseHowToSteps(content: string): { name: string; text: string }[] {
  const steps: { name: string; text: string }[] = [];
  const matches = content.matchAll(/^## Step (\d+) — (.+)$/gm);
  for (const m of matches) {
    const start = m.index ?? 0;
    const next = content.slice(start + m[0].length);
    const end = next.search(/^## Step \d+ — /m);
    const body = (end === -1 ? next : next.slice(0, end)).trim();
    steps.push({ name: m[2].trim(), text: body.replace(/\n### .+/g, "").trim() });
  }
  return steps;
}

export function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Copy pack assets/article-hero.* → public/news/{slug}/hero.* */
export function syncPackHeroToPublic(pack: ContentPack): boolean {
  const asset = packAssetHeroPath(pack);
  if (!asset) return false;

  const ext = path.extname(asset);
  const outDir = path.join(process.cwd(), "public", "news", pack.metadata.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `hero${ext}`);
  fs.copyFileSync(asset, outPath);
  return true;
}

export function syncAllPackHeroes(): number {
  let n = 0;
  for (const pack of getAllPacks()) {
    if (syncPackHeroToPublic(pack)) n++;
  }
  return n;
}
