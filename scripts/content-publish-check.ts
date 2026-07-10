#!/usr/bin/env npx tsx
/**
 * Validate a content pack before setting published: true in metadata.json
 *
 * Usage:
 *   npx tsx scripts/content-publish-check.ts
 *   npx tsx scripts/content-publish-check.ts --topic missing-layer
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = path.join(repoRoot, "content", "packs");

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function countFaqQuestions(content: string) {
  return (content.match(/^## /gm) ?? []).length;
}

function countGuideSteps(content: string) {
  return (content.match(/^## Step \d+ — /gm) ?? []).length;
}

function checkPack(dirPath: string, dirName: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metaPath = path.join(dirPath, "metadata.json");
  if (!fs.existsSync(metaPath)) {
    errors.push("missing metadata.json");
    return { dirName, errors, warnings, ok: false };
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  const slug = meta.slug as string | undefined;
  const priority = (meta.priority as number | undefined) ?? 10;
  const isCornerstone = priority >= 1 && priority <= 5;
  const minBlog = isCornerstone ? 1500 : 1000;
  const minFaq = isCornerstone ? 14 : 10;

  for (const field of [
    "secondaryKeywords",
    "aeQueries",
    "readingTimeMinutes",
    "canonicalPath",
    "schema",
  ]) {
    if (meta[field] === undefined) errors.push(`metadata.json missing ${field}`);
  }

  const blogPath = path.join(dirPath, "blog.md");
  if (!fs.existsSync(blogPath)) {
    errors.push("missing blog.md");
  } else {
    const { content, data } = matter(fs.readFileSync(blogPath, "utf8"));
    const words = wordCount(content);
    if (words < minBlog) errors.push(`blog.md ${words} words (need ≥${minBlog})`);
    if (!content.includes("## TL;DR")) errors.push("blog.md missing ## TL;DR");
    if (!content.includes("## Key takeaways")) warnings.push("blog.md missing ## Key takeaways");
    if (!data.primaryKeyword && !data.title) warnings.push("blog.md frontmatter thin");
    if (!/^\*\*.+\*\*/m.test(content.slice(0, 500))) {
      warnings.push("blog.md: bold definition near top recommended");
    }
  }

  const faqPath = path.join(dirPath, "faq.md");
  if (!fs.existsSync(faqPath)) {
    errors.push("missing faq.md");
  } else {
    const faqContent = fs.readFileSync(faqPath, "utf8");
    const qCount = countFaqQuestions(faqContent);
    if (qCount < minFaq) errors.push(`faq.md ${qCount} questions (need ≥${minFaq})`);
  }

  const guidePath = path.join(dirPath, "guide.md");
  if (!fs.existsSync(guidePath)) {
    errors.push("missing guide.md");
  } else {
    const { data, content } = matter(fs.readFileSync(guidePath, "utf8"));
    const steps = countGuideSteps(content);
    const minSteps = isCornerstone ? 5 : 4;
    if (steps < minSteps) errors.push(`guide.md ${steps} steps (need ≥${minSteps})`);
    if (!data.estimatedMinutes) warnings.push("guide.md missing estimatedMinutes in frontmatter");
  }

  if (meta.published === true && !meta.publishedAt) {
    warnings.push("published: true but no publishedAt date");
  }

  const imagePromptPath = path.join(dirPath, "image-prompts.md");
  if (!fs.existsSync(imagePromptPath)) {
    warnings.push("missing image-prompts.md (one article image prompt)");
  }

  const heroAsset = ["article-hero.jpg", "article-hero.png", "article-hero.webp"].some((n) =>
    fs.existsSync(path.join(dirPath, "assets", n))
  );
  const heroPublic = fs.existsSync(
    path.join(repoRoot, "public", "news", (meta.slug as string) ?? "", "hero.jpg")
  );
  if (!meta.heroImage && !heroAsset && !heroPublic) {
    warnings.push("no article hero image yet — generate per visual-style.md");
  }

  return { dirName, slug, errors, warnings, ok: errors.length === 0 };
}

function main() {
  const topicArg = process.argv.indexOf("--topic");
  const topic = topicArg >= 0 ? process.argv[topicArg + 1] : undefined;

  const dirs = fs
    .readdirSync(packsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !topic || name.endsWith(`-${topic}`));

  if (dirs.length === 0) {
    console.error("No pack directories found.");
    process.exit(1);
  }

  let anyFail = false;
  for (const dirName of dirs) {
    const result = checkPack(path.join(packsDir, dirName), dirName);
    const label = result.slug ?? dirName;
    if (result.ok && result.warnings.length === 0) {
      console.log(`✓ ${label}`);
    } else if (result.ok) {
      console.log(`✓ ${label} (warnings)`);
      result.warnings.forEach((w) => console.log(`  warn: ${w}`));
    } else {
      anyFail = true;
      console.log(`✗ ${label}`);
      result.errors.forEach((e) => console.log(`  error: ${e}`));
      result.warnings.forEach((w) => console.log(`  warn: ${w}`));
    }
  }

  process.exit(anyFail ? 1 : 0);
}

main();
