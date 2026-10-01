/**
 * Bryant's warehouse login. Staging + Receiving. Does not take over an
 * installer row if one already exists under the same first name.
 *
 * Run drizzle/0034_ic_warehouse_kit.sql first so the warehouse role exists.
 *
 * Usage:
 *   npx tsx scripts/set-ic-bryant-login.ts [password]
 *
 * Default password: BryantTemp26
 * Username: bryant
 */
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import { hashPassword } from "../src/lib/inspired-closets-field-auth";

const ROOT = path.resolve(__dirname, "..");

function isBryant(row: { name: string; email: string | null; workbook_tab: string | null }): boolean {
  const name = row.name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  const tab = (row.workbook_tab ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
  const email = (row.email ?? "").trim().toLowerCase().split("@")[0] ?? "";
  return name === "bryant" || tab === "bryant" || email === "bryant";
}

async function main() {
  loadDotEnv(ROOT);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const password = process.argv[2] || "BryantTemp26";
  const username = "bryant";
  const hash = await hashPassword(password);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const list = await fetch(
    `${url}/rest/v1/ic_staff?deleted_at=is.null&select=id,name,email,role,active,workbook_tab`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!list.ok) throw new Error(await list.text());
  const rows = (await list.json()) as Array<{
    id: string;
    name: string;
    email: string | null;
    role: string;
    active: boolean;
    workbook_tab: string | null;
  }>;

  const matches = rows.filter(isBryant);
  const office = matches.filter((row) => row.role !== "installer");
  if (office.length > 1) {
    throw new Error(`Expected one Bryant office row, found ${office.length}: ${office.map((row) => row.name).join(", ")}`);
  }

  const existing = office[0];
  if (existing) {
    const patch = await fetch(`${url}/rest/v1/ic_staff?id=eq.${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        role: "warehouse",
        email: existing.email?.trim() || username,
        title: "Warehouse",
        active: true,
        password_hash: hash,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!patch.ok) throw new Error(await patch.text());
  } else {
    const created = await fetch(`${url}/rest/v1/ic_staff`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Bryant",
        role: "warehouse",
        email: username,
        title: "Warehouse",
        workbook_tab: "Bryant",
        active: true,
        password_hash: hash,
      }),
    });
    if (!created.ok) throw new Error(await created.text());
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        name: existing?.name ?? "Bryant",
        role: "warehouse",
        username,
        password,
        sign_in: "/inspired-closets/access",
        home: "/inspired-closets/ops/warehouse",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
