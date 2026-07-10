#!/usr/bin/env npx tsx
/** Copy pack assets/article-hero files to public/news/{slug}/hero */

import { getAllPacks, syncAllPackHeroes } from "../src/lib/content-packs";

const count = syncAllPackHeroes();
const packs = getAllPacks();
console.log(`Synced ${count} pack hero image(s) to public/news/`);
for (const pack of packs) {
  const assetDir = `${pack.dirPath}/assets`;
  console.log(`  ${pack.metadata.slug}: check ${assetDir} → public/news/${pack.metadata.slug}/`);
}
