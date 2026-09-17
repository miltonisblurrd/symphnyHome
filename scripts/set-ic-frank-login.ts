/**
 * Upsert Frank as inventory staff with an office login password.
 *
 * Usage:
 *   npx tsx scripts/set-ic-frank-login.ts [password] [email-or-username]
 *
 * Defaults: password FrankTemp26, email frank
 */
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import { hashPassword } from "../src/lib/inspired-closets-field-auth";

const ROOT = path.resolve(__dirname, "..");

async function main() {
  loadDotEnv(ROOT);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const password = process.argv[2] || "FrankTemp26";
  const email = (process.argv[3] || "frank").trim().toLowerCase();
  const name = "Frank";
  const hash = await hashPassword(password);

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const list = await fetch(
    `${url}/rest/v1/ic_staff?deleted_at=is.null&or=(name.ilike.${encodeURIComponent(name)},email.ilike.${encodeURIComponent(email)})&select=id,name,role,email,active`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!list.ok) throw new Error(await list.text());
  const rows = (await list.json()) as Array<{
    id: string;
    name: string;
    role: string;
    email: string | null;
    active: boolean;
  }>;

  const existing =
    rows.find((row) => row.name.trim().toLowerCase() === "frank") ??
    rows.find((row) => (row.email ?? "").trim().toLowerCase() === email) ??
    null;

  let staffId: string;
  if (existing) {
    const patch = await fetch(`${url}/rest/v1/ic_staff?id=eq.${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        name,
        role: "inventory",
        email,
        title: "Inventory",
        active: true,
        password_hash: hash,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }),
    });
    if (!patch.ok) throw new Error(await patch.text());
    const updated = (await patch.json()) as Array<{ id: string }>;
    staffId = updated[0]?.id ?? existing.id;
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const create = await fetch(`${url}/rest/v1/ic_staff`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        role: "inventory",
        email,
        title: "Inventory",
        hired_at: today,
        active: true,
        password_hash: hash,
      }),
    });
    if (!create.ok) throw new Error(await create.text());
    const created = (await create.json()) as Array<{ id: string }>;
    staffId = created[0]?.id;
    if (!staffId) throw new Error("Create succeeded but no id returned.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        id: staffId,
        name,
        role: "inventory",
        username: email,
        password,
        sign_in: "/inspired-closets/access",
        home: "/inspired-closets/ops/inventory",
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
