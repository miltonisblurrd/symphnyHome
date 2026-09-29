import fs from "node:fs";
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import { pullLiveSnapshot } from "../src/lib/meta-ads/meta/pull";

const ROOT = path.resolve(__dirname, "..");

async function main() {
  loadDotEnv(ROOT);
  const snapshot = await pullLiveSnapshot();
  const dir = path.join(ROOT, "data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "meta-ads-live.json");
  fs.writeFileSync(file, JSON.stringify(snapshot));
  const currentSpend = snapshot.campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const currentLeads = snapshot.campaigns.reduce((sum, campaign) => sum + campaign.leads, 0);
  console.log(
    JSON.stringify({
      ok: true,
      company: snapshot.company,
      from: snapshot.dates[0],
      to: snapshot.dates[snapshot.dates.length - 1],
      campaigns: snapshot.campaigns.length,
      ads: snapshot.ads.length,
      currentSpend: Math.round(currentSpend * 100) / 100,
      currentLeads,
      file: "data/meta-ads-live.json",
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Sync failed";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
