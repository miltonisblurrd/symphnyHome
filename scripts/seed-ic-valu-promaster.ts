import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";

const ROOT = path.resolve(__dirname, "..");

async function main() {
  loadDotEnv(ROOT);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const staffRes = await fetch(
    `${url}/rest/v1/ic_staff?deleted_at=is.null&role=eq.installer&name=eq.Valu&select=id,name,active`,
    { headers },
  );
  if (!staffRes.ok) throw new Error(await staffRes.text());
  const staff = (await staffRes.json()) as Array<{ id: string; name: string; active: boolean }>;
  const valu = staff.find((row) => row.name === "Valu" && row.active !== false);
  if (!valu) throw new Error("No active installer named Valu.");

  const existingRes = await fetch(
    `${url}/rest/v1/ic_vehicles?assigned_installer_id=eq.${valu.id}&deleted_at=is.null&select=id,year,make,model`,
    { headers },
  );
  if (!existingRes.ok) {
    const text = await existingRes.text();
    if (/does not exist|schema cache/i.test(text)) {
      console.log(
        JSON.stringify({
          ok: false,
          need_sql: "drizzle/0021_ic_vehicles.sql",
        }),
      );
      return;
    }
    throw new Error(text);
  }
  const existing = (await existingRes.json()) as Array<{ id: string }>;
  if (existing[0]) {
    console.log(JSON.stringify({ ok: true, already: true, vehicle_id: existing[0].id, installer: "Valu" }));
    return;
  }

  const insert = await fetch(`${url}/rest/v1/ic_vehicles`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Valu ProMaster",
      year: 2019,
      make: "Dodge",
      model: "ProMaster 2500",
      color: "#f2efe6",
      assigned_installer_id: valu.id,
      odometer: 0,
      active: true,
    }),
  });
  if (!insert.ok) throw new Error(await insert.text());
  const [row] = (await insert.json()) as Array<{ id: string }>;
  console.log(JSON.stringify({ ok: true, created: true, vehicle_id: row?.id, installer: "Valu" }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
