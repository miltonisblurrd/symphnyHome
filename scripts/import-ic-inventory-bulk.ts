import fs from "node:fs";
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import { parseCountSheetText } from "../src/lib/inspired-closets-ops-count-sheet";
import { hiddenPartSku } from "../src/lib/inspired-closets-ops-inventory";

const ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(ROOT, "docs/inspired-closets-inventory-bulk.csv");

function rest(url: string, key: string, pathname: string, init: RequestInit = {}) {
  return fetch(`${url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  loadDotEnv(ROOT);
  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCountSheetText(csv);
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter((line) => line.trim());
  const dataLines = Math.max(0, lines.length - 1);

  if (dry) {
    const sample = rows.slice(0, 8).map((row) => ({
      name: row.name,
      item: row.item_number,
      color: row.color,
      vendor: row.vendor,
      size: row.size,
      qty: row.qty,
      on_job: row.qty_reserved,
    }));
    const inchSizes = rows.filter((row) => (row.size ?? "").includes('"')).length;
    const withItem = rows.filter((row) => row.item_number).length;
    console.log(
      JSON.stringify(
        {
          csvLines: dataLines,
          parsed: rows.length,
          withItem,
          inchSizes,
          sample,
        },
        null,
        2,
      ),
    );
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const colorProbe = await rest(url, key, "ic_parts?select=color&limit=1");
  const hasColorColumn = colorProbe.ok;
  const errors: string[] = [];
  let created = 0;

  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const color = String(row.color ?? "").trim() || null;
    const size = String(row.size ?? "").trim() || null;
    const vendor = String(row.vendor ?? "").trim() || null;
    const itemNumber = String(row.item_number ?? row.barcode ?? "").trim() || null;
    const qty = Math.max(0, Math.round(row.qty ?? 0));
    const reserved = Math.max(0, Math.round(row.qty_reserved ?? 0));
    const body: Record<string, unknown> = {
      sku: hiddenPartSku(),
      name,
      size,
      category: "hardware",
      barcode: itemNumber,
      vendor,
      notes: null,
      qty_on_hand: qty,
      qty_reserved: reserved,
      unit_cost_cents: 0,
      reorder_point: 0,
      active: true,
      deleted_at: null,
    };
    if (hasColorColumn) {
      body.color = color;
      body.location = null;
    } else {
      body.location = color;
    }

    const insertRes = await rest(url, key, "ic_parts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!insertRes.ok) {
      errors.push(`${name}: ${await insertRes.text()}`);
      continue;
    }
    const inserted = (await insertRes.json()) as Array<{ id: string }>;
    const partId = inserted[0]?.id;
    if (partId && qty > 0) {
      const moveRes = await rest(url, key, "ic_stock_movements", {
        method: "POST",
        body: JSON.stringify({
          part_id: partId,
          movement_type: "receive",
          qty,
          note: "Opening count (import)",
        }),
      });
      if (!moveRes.ok) errors.push(`${name} movement: ${await moveRes.text()}`);
    }
    created += 1;
  }

  const check = await rest(
    url,
    key,
    "ic_parts?deleted_at=is.null&select=id&limit=5000",
  );
  if (!check.ok) throw new Error(await check.text());
  const leftover = (await check.json()) as Array<{ id: string }>;
  console.log(
    JSON.stringify({
      csvLines: dataLines,
      parsed: rows.length,
      created,
      listed: leftover.length,
      errors,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
