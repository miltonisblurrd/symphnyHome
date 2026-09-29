import fs from "node:fs";
import path from "node:path";
import type { AccountSnapshot } from "@/lib/meta-ads/meta/snapshot";

export function readLiveSnapshot(): AccountSnapshot | null {
  const file = path.join(process.cwd(), "data", "meta-ads-live.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as AccountSnapshot;
}
