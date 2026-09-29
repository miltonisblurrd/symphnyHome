/**
 * Leads + jobs cleanup from docs/ic-leads-jobs-cleanup-master-plan.md.
 *
 *   npx tsx scripts/ic-cleanup-2026-09-28.ts --phase=check
 *   npx tsx scripts/ic-cleanup-2026-09-28.ts --phase=1            # dry run
 *   npx tsx scripts/ic-cleanup-2026-09-28.ts --phase=1 --apply
 *
 * Phases: 0 snapshot · 1 fake data · 2 staff + sources · 3 Community leads ·
 * 5 calendar · 4 jobs (IC_SERVICES_DIR=.tmp/services) · 6 links + flags · 7 verify.
 * Every phase is idempotent.
 */
import fs from "node:fs";
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import { clientDisplayName, clientIdentityKey, jobDescriptorFromName } from "../src/lib/inspired-closets-ops-clients";
import { resolveStaffAlias } from "../src/lib/inspired-closets-ops-staff-aliases";
import { buildDrafts } from "./import-ic-jobs-from-services";

const ROOT = path.resolve(__dirname, "..");
loadDotEnv(ROOT);

const BATCH = "2026-09-28-cleanup";
const APPLY = process.argv.includes("--apply");
const PHASE = process.argv.find((a) => a.startsWith("--phase="))?.slice("--phase=".length) ?? "check";
const NOW = new Date("2026-09-29T16:00:00Z");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

type Row = Record<string, any>;

async function rest(pathname: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function getAll(q: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = (await rest(q, { headers: { Range: `${from}-${from + 999}` } })) as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const log: string[] = [];
function say(line: string) {
  log.push(line);
  console.log(line);
}

/** Remove phase-6 flags that matched on a non-surname ("Doors") or a different Smith. */
async function phase6Prune() {
  const pending = await getAll("ic_lead_match_candidates?select=id,target_id,target_type,lead:ic_leads(client:ic_clients(name))&status=eq.pending");
  const jobs = new Map((await getAll("ic_jobs?select=id,workbook_ref&deleted_at=is.null")).map((j) => [j.id, j.workbook_ref ?? ""]));
  for (const m of pending) {
    const name = (m.lead?.client?.name ?? "").toUpperCase();
    const ref = m.target_type === "job" ? jobs.get(m.target_id) ?? "" : "";
    const junk =
      name.includes("HOLIDAY DOORS") ||
      (ref.includes("VANCE SMITH")) ||
      (name.includes("CONNIE") && ref.includes("SMITH"));
    if (!junk) continue;
    say(`- remove flag ${name.trim()} ↔ ${ref}`);
    if (APPLY) await rest(`ic_lead_match_candidates?id=eq.${m.id}`, { method: "DELETE" });
  }
}

async function insert(table: string, body: Row): Promise<Row> {
  if (!APPLY) return { id: `dry-${table}-${log.length}`, ...body };
  const [row] = await rest(table, { method: "POST", body: JSON.stringify(body) });
  return row;
}

async function patch(table: string, filter: string, body: Row) {
  if (!APPLY) return;
  await rest(`${table}?${filter}`, { method: "PATCH", body: JSON.stringify(body) });
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);
const upper = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Community/calendar times are Las Vegas local; everything here is before DST ends 11/1 (UTC-7). */
function pt(mdy: string, hm = "12:00"): string {
  const [m, d, y] = mdy.split("/").map(Number);
  const [h, min] = hm.split(":").map(Number);
  return new Date(Date.UTC(y < 100 ? 2000 + y : y, m - 1, d, h + 7, min)).toISOString();
}

function splitAddress(raw: string | null): { street: string | null; city: string | null; state: string | null; zip: string | null } {
  if (!raw) return { street: null, city: null, state: null, zip: null };
  const m = raw.match(/^(.*?),\s*([^,]+?),\s*NV\s*(\d{5})/i);
  if (m) return { street: m[1].trim(), city: m[2].trim(), state: "NV", zip: m[3] };
  const zip = raw.match(/\b(\d{5})\b/)?.[1] ?? null;
  return { street: raw.replace(/\s*\b\d{5}\b\s*$/, "").trim(), city: null, state: zip ? "NV" : null, zip };
}

async function loadStaff(): Promise<Row[]> {
  return getAll("ic_staff?select=id,name,role,active&deleted_at=is.null");
}

function staffId(staff: Row[], name: string | null): string | null {
  return resolveStaffAlias(name, staff as Array<{ id: string; name: string }>);
}

// ---------------------------------------------------------------- check

async function phaseCheck() {
  const probes = [
    "ic_leads?select=import_batch,data_flags&limit=1",
    "ic_lead_match_candidates?select=id&limit=1",
    "ic_jobs?select=import_batch&limit=1",
    "ic_appointments?select=import_batch&limit=1",
    "ic_clients?select=import_batch&limit=1",
    "ic_staff?select=import_batch&limit=1",
  ];
  let ok = true;
  for (const probe of probes) {
    try {
      await rest(probe);
      say(`ok   ${probe.split("?")[0]} ${probe.split("select=")[1].split("&")[0]}`);
    } catch (error) {
      ok = false;
      say(`MISSING ${probe.split("?")[0]}: ${(error as Error).message.slice(0, 120)}`);
    }
  }
  try {
    await rest("ic_leads?source=eq.pinterest&select=id&limit=1");
    say("ok   ic_lead_source has pinterest");
  } catch {
    ok = false;
    say("MISSING ic_lead_source values (pinterest …)");
  }
  say(ok ? "Migration 0031 is applied." : "Migration 0031 is NOT applied yet.");
  return ok;
}

// ---------------------------------------------------------------- 0 snapshot

async function phase0() {
  const dir = path.join(ROOT, ".tmp", "snapshots", "2026-09-28");
  fs.mkdirSync(dir, { recursive: true });
  for (const table of ["ic_leads", "ic_clients", "ic_jobs", "ic_appointments", "ic_staff", "ic_lead_chatter"]) {
    const file = path.join(dir, `${table}.json`);
    if (fs.existsSync(file)) {
      say(`snapshot exists, kept: ${table}`);
      continue;
    }
    const rows = await getAll(`${table}?select=*`);
    if (APPLY) fs.writeFileSync(file, JSON.stringify(rows));
    say(`snapshot ${table}: ${rows.length} rows${APPLY ? "" : " (dry run, not written)"}`);
  }
}

// ---------------------------------------------------------------- 1 fake data

const FAKE_CLIENTS = [
  "f6888422-4fb1-42f2-8d75-12f9ac354570", // Jade Amaya
  "14a1fa17-7ce0-45e2-ac01-d84f06f69d47", // Milton test
  "04bb9036-5a09-46b2-882d-ee3146c946bd", // Des Test
  "42446b40-cbdd-4b8f-bdce-908eeeb41cd9", // TEST CLIENT — DES LEADS
  "13ffdbd7-ceea-4699-be4d-1296f8e7bc83", // TEST CLIENT — FIELD APP
];

async function phase1() {
  const ids = FAKE_CLIENTS.join(",");
  const leads = await getAll(`ic_leads?select=id&client_id=in.(${ids})&deleted_at=is.null`);
  const jobs = await getAll(`ic_jobs?select=id&client_id=in.(${ids})&deleted_at=is.null`);
  const leadIds = leads.map((l) => l.id).join(",");
  const jobIds = jobs.map((j) => j.id).join(",");
  const or = [`client_id.in.(${ids})`, leadIds && `lead_id.in.(${leadIds})`, jobIds && `job_id.in.(${jobIds})`]
    .filter(Boolean)
    .join(",");
  const appts = await getAll(`ic_appointments?select=id&deleted_at=is.null&or=(${or})`);
  const clients = await getAll(`ic_clients?select=id,name&id=in.(${ids})&deleted_at=is.null`);
  say(`remove ${clients.length} clients (${clients.map((c) => c.name).join(", ")}), ${leads.length} leads, ${jobs.length} jobs, ${appts.length} appointments`);
  const soft = { deleted_at: new Date().toISOString() };
  if (appts.length) await patch("ic_appointments", `id=in.(${appts.map((a) => a.id).join(",")})`, soft);
  if (jobIds) await patch("ic_jobs", `id=in.(${jobIds})`, soft);
  if (leadIds) {
    await patch("ic_lead_chatter", `lead_id=in.(${leadIds})&deleted_at=is.null`, soft);
    await patch("ic_leads", `id=in.(${leadIds})`, soft);
  }
  if (clients.length) await patch("ic_clients", `id=in.(${ids})`, soft);
}

// ---------------------------------------------------------------- 2 staff + sources

const NEW_STAFF = [
  { name: "Des Amaya", role: "front_office", title: "Front office" },
  { name: "NAVI", role: "designer", title: "Designer" },
  { name: "ESP", role: "designer", title: "Designer" },
];

const SOURCE_BY_RAW: Record<string, string> = {
  pinterest: "pinterest",
  "showroom walk-in": "showroom_walk_in",
  "self-generated": "self_generated",
  web: "web",
  online: "online",
  "paid instagram ads": "paid_instagram_ads",
  "google business profile": "google_business_profile",
};

async function phase2() {
  const staff = await loadStaff();
  for (const person of NEW_STAFF) {
    if (staff.some((s) => upper(s.name) === upper(person.name))) {
      say(`staff exists: ${person.name}`);
      continue;
    }
    await insert("ic_staff", { ...person, active: true, import_batch: BATCH });
    say(`+ staff ${person.name} (${person.role})`);
  }
  const leads = await getAll("ic_leads?select=id,source,source_raw&deleted_at=is.null&source_raw=not.is.null");
  let fixed = 0;
  for (const lead of leads) {
    const want = SOURCE_BY_RAW[(lead.source_raw ?? "").trim().toLowerCase()];
    if (want && lead.source !== want) {
      await patch("ic_leads", `id=eq.${lead.id}`, { source: want });
      fixed += 1;
    }
  }
  say(`existing leads re-sourced to exact Community source: ${fixed}`);
}

// ---------------------------------------------------------------- 3 Community leads

type CommunityLead = {
  first: string;
  last: string;
  phone: string;
  email: string | null;
  zip: string | null;
  status: string;
  form: string | null;
  source: string;
  created: string;
  modified: string;
  owner: string;
  address?: string;
};

const SCHEDULED: CommunityLead[] = [
  { first: "Ken", last: "Smith", phone: "7025018487", email: "smithkr0924@gmail.com", zip: "89129", status: "Scheduled", form: "Consultation request", source: "Facebook", created: "9/27/2026", modified: "9/28/2026", owner: "Yvonne Duval", address: "4242 Helena Hideaway Ct, Las Vegas, NV 89129" },
  { first: "Cassi", last: "Wright", phone: "7026827448", email: "cassijowright@mac.com", zip: "89138", status: "Scheduled", form: "Consultation request", source: "Web", created: "9/24/2026", modified: "9/28/2026", owner: "Yvonne Duval", address: "12540 Alpine Creek Pl, Las Vegas, NV 89138" },
  { first: "Heidi", last: "Meier", phone: "8015292925", email: "summerluvin96@yahoo.com", zip: "89135", status: "Scheduled", form: null, source: "Online", created: "9/28/2026", modified: "9/28/2026", owner: "Rebekah Larson", address: "4862 Shady Ridge Dr, Las Vegas, NV 89135" },
  { first: "Kelly", last: "Fountain", phone: "3104899464", email: "kellytfountain@gmail.com", zip: "89149", status: "Scheduled", form: "Consultation request", source: "Facebook", created: "9/23/2026", modified: "9/23/2026", owner: "Rebekah Larson", address: "6152 Royal Topaz Ct, Las Vegas, NV 89149" },
  { first: "Duane", last: "Thomas", phone: "6787728723", email: "duane.thomasatl@gmail.com", zip: "89011", status: "Scheduled", form: null, source: "Other", created: "9/17/2026", modified: "9/17/2026", owner: "Cissy Valdez", address: "91 Alta Cascata Pl, Henderson, NV 89011" },
];

const UNSCHEDULED: CommunityLead[] = [
  { first: "Sophie", last: "Jensen", phone: "7029697995", email: "sophievegas1994@gmail.com", zip: "89107", status: "1st Attempt - No Response", form: "Consultation request", source: "Instagram", created: "9/27/2026", modified: "9/28/2026", owner: "Des Amaya" },
  { first: "Cassandra", last: "Hardy", phone: "7025560613", email: "purrfecturimage@gmail.com", zip: "89031", status: "1st Attempt - No Response", form: "Consultation request", source: "Facebook", created: "9/27/2026", modified: "9/28/2026", owner: "Des Amaya" },
  { first: "Emma", last: "Carlins", phone: "8474368020", email: "ecarlins28@gmail.com", zip: "60601", status: "1st Attempt - No Response", form: "Consultation request", source: "Paid Search", created: "9/28/2026", modified: "9/28/2026", owner: "Des Amaya" },
  { first: "Angie", last: "Lee", phone: "9135446564", email: "maybooa@hotmail.com", zip: "89148", status: "4th Attempt - No Response", form: "Brochure download", source: "Web", created: "9/19/2026", modified: "9/28/2026", owner: "Des Amaya" },
  { first: "Tracy", last: "Fluker", phone: "7026732983", email: "bamaterry5@gmail.com", zip: "89128", status: "4th Attempt - No Response", form: "Consultation request", source: "Facebook", created: "9/20/2026", modified: "9/28/2026", owner: "Des Amaya" },
  { first: "Carol", last: "Cable", phone: "5108464327", email: "carolcable7@gmail.com", zip: "89141", status: "Needs Follow Up", form: "Brochure download", source: "Web", created: "7/15/2025", modified: "8/25/2026", owner: "Des Amaya" },
  { first: "Jolene", last: "Tupper", phone: "3605814938", email: "jtupper321@outlook.com", zip: "89135", status: "Needs Follow Up", form: "Consultation request", source: "Organic Search", created: "9/26/2025", modified: "5/5/2026", owner: "Rebekah Larson" },
  { first: "Jennifer", last: "Hoge", phone: "7024968602", email: "uscjenn@cox.net", zip: "89113", status: "Needs Follow Up", form: "Brochure download", source: "Paid Instagram Ads", created: "1/2/2026", modified: "8/27/2026", owner: "Des Amaya" },
  { first: "Lance", last: "Hurst", phone: "7022324008", email: "labs1996@gmail.com", zip: "89113", status: "Needs Follow Up", form: "Consultation request", source: "Web", created: "2/20/2026", modified: "7/13/2026", owner: "Cissy Valdez" },
  { first: "Lovetta", last: "Adams", phone: "9043071540", email: "loveyadams40@yahoo.com", zip: "89086", status: "Needs Follow Up", form: "Consultation request", source: "Paid Search", created: "4/10/2026", modified: "7/1/2026", owner: "Yvonne Duval" },
  { first: "Sandra", last: "Rebolledo", phone: "7023739793", email: "info@sginjurylaw.com", zip: "89010", status: "Needs Follow Up", form: "Brochure download", source: "Paid Search", created: "4/13/2026", modified: "5/13/2026", owner: "Des Amaya" },
  { first: "Carol", last: "Mayorga", phone: "7029035804", email: "carolmayorga40@gmail.com", zip: "89131", status: "Needs Follow Up", form: "Consultation request", source: "Organic Search", created: "5/28/2026", modified: "8/24/2026", owner: "Des Amaya" },
  { first: "Trish", last: "Rowan", phone: "3602701509", email: "trishkrowan@gmail.com", zip: "89060", status: "Needs Follow Up", form: "Brochure download", source: "Paid Search", created: "6/8/2026", modified: "6/17/2026", owner: "Des Amaya" },
  { first: "Cyndy", last: "Sharp", phone: "7145070590", email: "cynndysharp@icloud.com", zip: "89149", status: "Needs Follow Up", form: "Consultation request", source: "Instagram", created: "6/13/2026", modified: "6/16/2026", owner: "Des Amaya" },
  { first: "Jaime", last: "Wallace-Yang", phone: "7028073337", email: "jswallaceyang@yahoo.com", zip: "89143", status: "Needs Follow Up", form: "Brochure download", source: "Paid Instagram Ads", created: "6/20/2026", modified: "8/25/2026", owner: "Des Amaya" },
  { first: "Debby", last: "Bunn", phone: "7022819900", email: "ithinkikan@gmail.com", zip: null, status: "Needs Follow Up", form: null, source: "Instagram", created: "7/6/2026", modified: "8/25/2026", owner: "Des Amaya" },
  { first: "Nancy", last: "Benton", phone: "7022355632", email: "nlbenton13@gmail.com", zip: "89143", status: "Needs Follow Up", form: "Brochure download", source: "Organic Search", created: "7/7/2026", modified: "7/13/2026", owner: "Des Amaya" },
  { first: "Connie", last: "Smith", phone: "7024399624", email: "csmith53@cox.net", zip: null, status: "Needs Follow Up", form: null, source: "Facebook", created: "7/8/2026", modified: "7/16/2026", owner: "Des Amaya" },
  { first: "Shawn", last: "Gonsalves", phone: "7028545803", email: "sgonsalves@blueheron.com", zip: "89119", status: "Needs Follow Up", form: "Consultation request", source: "Paid Search", created: "7/8/2026", modified: "7/27/2026", owner: "Des Amaya" },
  { first: "Sara", last: "Oatt", phone: "6197948254", email: "saraoatt@gmail.com", zip: "89143", status: "Needs Follow Up", form: "Brochure download", source: "Paid Search", created: "7/9/2026", modified: "7/17/2026", owner: "Des Amaya" },
  { first: "Ida", last: "Peetz", phone: "7026824263", email: "iderspider2@gmail.com", zip: "89141", status: "Needs Follow Up", form: "Consultation request", source: "Facebook", created: "7/9/2026", modified: "7/21/2026", owner: "Des Amaya" },
  { first: "Laeo", last: "Boat", phone: "7026614236", email: "lbtalaleu@gmail.com", zip: "89120", status: "Needs Follow Up", form: "Consultation request", source: "Web", created: "7/21/2026", modified: "8/24/2026", owner: "Des Amaya" },
  { first: "Rhonda", last: "Wyman-Patterson", phone: "4085158611", email: "rhonda_wyman@yahoo.com", zip: "89123", status: "Needs Follow Up", form: null, source: "Instagram", created: "7/27/2026", modified: "8/21/2026", owner: "Des Amaya" },
  { first: "Leslie", last: "Toy", phone: "9167306329", email: "toytalk61@gmail.com", zip: "89034", status: "Needs Follow Up", form: null, source: "Instagram", created: "7/30/2026", modified: "9/24/2026", owner: "Des Amaya" },
];

/** Already in the OS by phone. Only blank fields get filled. */
const EXISTING_BY_PHONE: Array<CommunityLead & { formNote?: string }> = [
  { first: "Rosacruz G", last: "Barillas", phone: "7023266578", email: "pqestrella25@gmail.com", zip: null, status: "Scheduled", form: "Consultation request", source: "Pinterest", created: "8/13/2026", modified: "8/21/2026", owner: "Cissy Valdez" },
  { first: "Mr./Mrs.", last: "Hetzel", phone: "9514513783", email: "elizabethmyers1958@gmail.com", zip: null, status: "Scheduled", form: null, source: "Other", created: "8/24/2026", modified: "8/24/2026", owner: "Gavin Grundmeier" },
  { first: "Kyle", last: "Hagen", phone: "7023197509", email: "k.hagen1@icloud.com", zip: "89135", status: "Needs Follow Up", form: "Brochure download", source: "Google Business Profile", created: "8/18/2026", modified: "8/26/2026", owner: "Des Amaya" },
];

const STAGE: Record<string, [string, number]> = {
  Scheduled: ["appointment_set", 0],
  "1st Attempt - No Response": ["attempt_1", 1],
  "4th Attempt - No Response": ["attempt_4", 4],
  "Needs Follow Up": ["follow_up", 0],
};

const SOURCE: Record<string, string> = {
  Other: "other",
  "Organic Search": "organic_search",
  Facebook: "facebook",
  Online: "online",
  Web: "web",
  Instagram: "instagram",
  "Paid Instagram Ads": "paid_instagram_ads",
  "Paid Search": "paid_search",
  Pinterest: "pinterest",
  "Google Business Profile": "google_business_profile",
};

const FORM: Record<string, string> = {
  "Consultation request": "consultation_request",
  "Brochure download": "brochure_download",
};

async function phase3() {
  const staff = await loadStaff();
  const clients = await getAll("ic_clients?select=id,name,phone,email,address&deleted_at=is.null");
  const leads = await getAll("ic_leads?select=*&deleted_at=is.null");
  const clientByPhone = new Map(clients.filter((c) => digits(c.phone)).map((c) => [digits(c.phone), c]));

  for (const r of [...SCHEDULED, ...UNSCHEDULED]) {
    const name = `${r.first} ${r.last}`;
    const [stage, attempts] = STAGE[r.status];
    const designer = staffId(staff, r.owner) ?? (!APPLY && r.owner === "Des Amaya" ? "dry-des-amaya" : null);
    if (!designer) throw new Error(`No staff record for ${r.owner}`);
    const existingClient = clientByPhone.get(r.phone);
    if (existingClient) {
      const hasLead = leads.some((l) => l.client_id === existingClient.id);
      if (hasLead) {
        say(`= ${name}: already imported`);
        continue;
      }
      throw new Error(`${name}: phone already on client ${existingClient.name} — needs a decision, not an import`);
    }
    const addr = splitAddress(r.address ?? null);
    const client = await insert("ic_clients", {
      name,
      phone: r.phone,
      email: r.email,
      address: r.address ?? null,
      identity_key: clientIdentityKey(name),
      created_at: pt(r.created),
      import_batch: BATCH,
    });
    await insert("ic_leads", {
      client_id: client.id,
      source: SOURCE[r.source],
      source_raw: r.source,
      stage,
      stage_raw: r.status,
      contact_attempts: attempts,
      designer_id: designer,
      owner_id: designer,
      lead_owner_name: r.owner,
      first_name: r.first,
      last_name: r.last,
      street: addr.street,
      city: addr.city,
      state: addr.state ?? (r.zip?.startsWith("89") ? "NV" : null),
      zip: r.zip ?? addr.zip,
      address_raw: r.address ?? null,
      country: "United States",
      form_type: r.form ? FORM[r.form] : null,
      created_at: pt(r.created),
      last_modified_at: pt(r.modified),
      updated_at: pt(r.modified),
      community_created_by: "Community Active Leads export 9/28/2026",
      import_batch: BATCH,
    });
    say(`+ lead ${name} | ${r.status} | ${r.source} | ${r.owner}`);
  }

  for (const r of EXISTING_BY_PHONE) {
    const client = clientByPhone.get(r.phone);
    if (!client) throw new Error(`${r.last}: expected an existing client with phone ${r.phone}`);
    const lead = leads.find((l) => l.client_id === client.id);
    if (!lead) throw new Error(`${r.last}: client has no lead`);
    const fill: Row = {};
    const set = (field: string, value: unknown) => {
      if (value != null && value !== "" && (lead[field] == null || lead[field] === "")) fill[field] = value;
    };
    set("source_raw", r.source);
    if (!lead.source_raw && (lead.source === "other" || !lead.source)) fill.source = SOURCE[r.source];
    set("form_type", r.form ? FORM[r.form] : null);
    set("zip", r.zip);
    set("lead_owner_name", r.owner);
    set("designer_id", staffId(staff, r.owner));
    set("stage_raw", r.status);
    set("last_modified_at", pt(r.modified));
    set("community_created_by", "Community Active Leads export 9/28/2026");
    const clientFill: Row = {};
    if (!client.email && r.email) clientFill.email = r.email;
    if (Object.keys(fill).length) await patch("ic_leads", `id=eq.${lead.id}`, { ...fill, import_batch: BATCH });
    if (Object.keys(clientFill).length) await patch("ic_clients", `id=eq.${client.id}`, clientFill);
    say(`~ existing ${client.name}: filled ${[...Object.keys(fill), ...Object.keys(clientFill).map((k) => `client.${k}`)].join(", ") || "nothing (already complete)"}`);
  }
}

// ---------------------------------------------------------------- 5 calendar

type Visit = {
  date: string;
  time: string;
  kind: "consultation" | "job_check";
  location: "on_site" | "showroom" | "virtual";
  designer: string | null;
  text: string;
  address?: string;
  status?: "cancelled" | "rescheduled";
};

type CalendarPerson = {
  /** Name to find an existing lead by (client name contains). */
  find?: RegExp;
  /** For calendar-only people: the new client/lead name. */
  name?: string;
  designer: string | null;
  address?: string;
  sold?: boolean;
  advanceTo?: string;
  visits: Visit[];
};

const c = (date: string, time: string, designer: string | null, text: string, address?: string): Visit => ({
  date, time, kind: "consultation", location: "on_site", designer, text, address,
});
const sr = (date: string, time: string, designer: string | null, text: string): Visit => ({
  date, time, kind: "consultation", location: "showroom", designer, text,
});
const jc = (date: string, time: string, designer: string | null, text: string, address?: string): Visit => ({
  date, time, kind: "job_check", location: "on_site", designer, text, address,
});

const SCHEDULED_VISITS: CalendarPerson[] = [
  { find: /^Cassi Wright$/i, designer: "YVONNE", visits: [
    c("9/28/26", "13:30", "YVONNE", "Yvonne @ Wright Consultation @ 12540 Alpine Crk Pl, Las Vegas, NV 89138", "12540 Alpine Creek Pl, Las Vegas, NV 89138"),
    sr("10/13/26", "08:30", "YVONNE", "SR FRONT - YVONNE - WRIGHT (calendar shows 8:30pm; confirmed 8:30am)"),
  ] },
  { find: /^Ken Smith$/i, designer: "YVONNE", visits: [
    c("9/29/26", "14:00", "YVONNE", "Yvonne @ Smith Consultation @ 4242 Helena Hideaway Ct, Las Vegas, NV 89129", "4242 Helena Hideaway Ct, Las Vegas, NV 89129"),
  ] },
  { find: /^Heidi Meier$/i, designer: "BEX", visits: [
    c("9/30/26", "11:00", "BEX", "11 BEX @ Meier @ 4862 Shady Rdg Dr, Las Vegas, NV 89135", "4862 Shady Ridge Dr, Las Vegas, NV 89135"),
  ] },
  { find: /^Kelly Fountain$/i, designer: "BEX", visits: [
    c("9/30/26", "12:45", "BEX", "1245 BEX @ Fountain Consultation @ 6152 Royal Topaz Ct, Las Vegas, NV 89149", "6152 Royal Topaz Ct, Las Vegas, NV 89149"),
  ] },
  { find: /^Duane Thomas$/i, designer: "CISSY", visits: [
    c("10/1/26", "15:30", "CISSY", "Cissy @ Thomas Consultation @ 91 Alta Cascata Pl, Henderson, NV 89011", "91 Alta Cascata Pl, Henderson, NV 89011"),
  ] },
];

const EXISTING_LEAD_VISITS: CalendarPerson[] = [
  { find: /Hailee Long/i, designer: "YVONNE", address: "8278 Sweetwater Creek Way, Las Vegas, NV 89113", advanceTo: "moved_to_studio", visits: [
    c("8/31/26", "12:00", "YVONNE", "Yvonne @ Long Consultation @ 8278 Sweetwater Creek Way, Las Vegas, NV 89113", "8278 Sweetwater Creek Way, Las Vegas, NV 89113"),
    sr("9/4/26", "10:00", "YVONNE", "SR FRONT - YVONNE - LONG"),
    jc("9/7/26", "10:00", "YVONNE", "YVONNE - JC - LONG"),
  ] },
  { find: /Alex Brant/i, designer: "CISSY", address: "643 Ridgeview Bend St, Henderson, NV 89015", advanceTo: "appointment_set", visits: [
    c("9/2/26", "10:00", "CISSY", "Cissy @ Brant Consultation @ 643 Ridgeview Bnd St, Henderson, NV 89015", "643 Ridgeview Bend St, Henderson, NV 89015"),
  ] },
  { find: /Wasserburger/i, designer: "CISSY", address: "10772 White Granite Ave, Las Vegas, NV 89135", advanceTo: "appointment_set", visits: [
    c("9/2/26", "12:00", "CISSY", "Cissy @ Wasserburger Consultation @ 10772 White Granite Ave, Las Vegas, NV 89135", "10772 White Granite Ave, Las Vegas, NV 89135"),
    sr("9/4/26", "10:00", "CISSY", "Wasserbirger-sr back Cissy"),
    sr("9/18/26", "10:30", "CISSY", "Wasserberger-cissy sr front"),
  ] },
  { find: /Quentin Wheaton/i, designer: "YVONNE", address: "10049 Copper Edge Rd, Las Vegas, NV 89148", advanceTo: "appointment_set", visits: [
    c("9/3/26", "10:00", "YVONNE", "Yvonne @ Wheaton Consultation @ 10049 Copper Edge Rd, Las Vegas, NV 89148", "10049 Copper Edge Rd, Las Vegas, NV 89148"),
  ] },
  { find: /Tawny Bakke/i, designer: "BEX", address: "9045 W Rosada Way, Las Vegas, NV 89149", advanceTo: "appointment_set", visits: [
    c("9/4/26", "09:00", "BEX", "9 BEX @ Bakke Consultation @ 9045 W Rosada Way, Las Vegas, NV 89149", "9045 W Rosada Way, Las Vegas, NV 89149"),
    sr("9/11/26", "10:00", "BEX", "10 Bex SR FRONT w/ Tawny"),
  ] },
  { find: /Feldscher/i, designer: "SANDY", address: "10706 Monaco Beach Ave, Las Vegas, NV 89166", advanceTo: "appointment_set", visits: [
    c("9/4/26", "11:30", "SANDY", "Sandy @ Feldsher Consultation @ 10706 Monaco Beach Ave, Las Vegas, NV 89166", "10706 Monaco Beach Ave, Las Vegas, NV 89166"),
  ] },
  { find: /Pam Howatt/i, designer: "YVONNE", address: "5272 Villa Vecchio Ct, Las Vegas, NV 89141", advanceTo: "moved_to_studio", visits: [
    c("9/16/26", "12:00", "YVONNE", "Yvonne @ Howatt Consultation @ 5272 Villa Vecchio Ct, Las Vegas, NV 89141", "5272 Villa Vecchio Ct, Las Vegas, NV 89141"),
    sr("9/23/26", "12:00", "YVONNE", "SR BACK - YVONNE - HOWATT"),
    jc("9/25/26", "09:30", "YVONNE", "YVONNE - JOBCHECK - HOWATT"),
  ] },
  { find: /Jason Chong/i, designer: "TANIA", address: "353 E Bonneville Ave, Las Vegas, NV 89101", advanceTo: "moved_to_studio", visits: [
    c("9/1/26", "13:00", "TANIA", "JASON CHONG-TANIA @ 353 E Bonneville Ave, Las Vegas, NV 89101", "353 E Bonneville Ave, Las Vegas, NV 89101"),
  ] },
  { find: /Sharan Ochsner/i, designer: "YVONNE", visits: [
    sr("8/30/26", "11:00", "YVONNE", "SR BACK - YVONNE - OCHSNER"),
    jc("9/1/26", "10:00", "YVONNE", "YVONNE - JC - OCHSNER"),
  ] },
  { find: /Susan Privman/i, designer: "SUMMER", address: "11280 Granite Ridge", advanceTo: "moved_to_studio", visits: [
    sr("9/7/26", "12:00", "SUMMER", "Summer privman sr front"),
    jc("9/16/26", "10:00", "SUMMER", "Summer and bekah job check privman / Bex JC with Summer @ 11280 granite ridge", "11280 Granite Ridge"),
  ] },
  { find: /Emily & Beau Cushman/i, designer: "CRAIG", address: "2925 Wigwam Pkwy #1421", visits: [
    c("9/2/26", "08:00", "CRAIG", "CUSHMAN-CRAIG @ 2925 Wigwam PKWY #1421", "2925 Wigwam Pkwy #1421"),
  ] },
  { find: /Chris Johnson/i, designer: "YVONNE", address: "2496 Grassy Spring Pl, Las Vegas, NV 89135", visits: [
    c("9/11/26", "13:30", "YVONNE", "Yvonne @ Johnson Consultation @ 2496 Grassy Spring Pl, Las Vegas, NV 89135", "2496 Grassy Spring Pl, Las Vegas, NV 89135"),
    sr("9/15/26", "15:00", "YVONNE", "YVONNE - SR FRONT - JOHNSON"),
    jc("9/18/26", "11:15", "YVONNE", "YVONNE - JW - JOHNSON"),
    { ...sr("9/27/26", "13:30", "YVONNE", "** rescheduling** SR FRONT - YVONNE - JOHNSON"), status: "rescheduled" },
  ] },
];

const CALENDAR_ONLY: CalendarPerson[] = [
  { name: "Padilla", designer: "YVONNE", address: "344 E Rush Ave, Las Vegas, NV 89183", visits: [
    c("8/30/26", "13:00", "YVONNE", "Yvonne @ Padilla consultation @ 344 E Rush Ave, Las Vegas, NV 89183", "344 E Rush Ave, Las Vegas, NV 89183")] },
  { name: "Renee Nichols", designer: "SANDY", visits: [
    c("9/2/26", "11:30", "SANDY", "Sandy Renee Nichols consultation"),
    sr("9/5/26", "10:00", "SANDY", "Sandy SR 1 Renee Nichols")] },
  { name: "Dibari", designer: "BEX", address: "11391 Peaks Landing Ave, Las Vegas, NV 89138", visits: [
    c("9/4/26", "10:30", "BEX", "10ish Bex @ Dibari Kitchen Client @ 11391 Peaks Landing Ave 89138", "11391 Peaks Landing Ave, Las Vegas, NV 89138")] },
  { name: "Schlobohm", designer: "MONICA", address: "9857 Masterful Dr, Las Vegas, NV 89148", sold: true, visits: [
    c("9/9/26", "16:30", "MONICA", "Monica @ Schlobohm Consultation @ 9857 Masterful Dr, Las Vegas, NV 89148", "9857 Masterful Dr, Las Vegas, NV 89148")] },
  { name: "Sherri & Trey Wilson", designer: "SANDY", address: "4095 Russian Rider Dr, Las Vegas, NV 89122", sold: true, visits: [
    c("9/11/26", "14:30", "SANDY", "Sandy @ Wilson Consultation @ 4095 Russian Rider Dr, Las Vegas, NV 89122", "4095 Russian Rider Dr, Las Vegas, NV 89122"),
    sr("9/17/26", "16:45", "SANDY", "Sandy SR Sherri & Trey Wilson"),
    jc("9/22/26", "14:00", "SANDY", "2 Bex JC with Sandy @ 4095 Russian Rider Dr, Las Vegas, NV 89122", "4095 Russian Rider Dr, Las Vegas, NV 89122")] },
  { name: "Hobson", designer: "BEX", address: "477 Cliff Terrace Ave, Las Vegas, NV 89138", sold: true, visits: [
    c("9/11/26", "13:00", "BEX", "1 BEX @ Hobson Consultation @ 477 Clf Ter Ave, Las Vegas, NV 89138", "477 Cliff Terrace Ave, Las Vegas, NV 89138"),
    sr("9/12/26", "10:30", "BEX", "1030 Bex SR FRONT w/ Hobson")] },
  { name: "Miele", designer: "BEX", address: "2837 Red Springs Dr, Las Vegas, NV 89135", visits: [
    c("9/12/26", "09:00", "BEX", "9 BEX @ Miele Consultation @ 2837 Red Springs Dr, Las Vegas, NV 89135", "2837 Red Springs Dr, Las Vegas, NV 89135")] },
  { name: "Beckman", designer: "YVONNE", address: "10012 Mirada Dr, Las Vegas, NV 89144", visits: [
    c("9/14/26", "08:00", "YVONNE", "Yvonne @ Beckman consultation @ 10012 Mirada Dr, Las Vegas, NV 89144", "10012 Mirada Dr, Las Vegas, NV 89144")] },
  { name: "Rahman", designer: "YVONNE", address: "4814 Shady Ridge Dr, Las Vegas, NV 89135", visits: [
    c("9/17/26", "13:00", "YVONNE", "Yvonne @ Rahman consultation @ 4814 Shady Rdg Dr, Las Vegas, NV 89135", "4814 Shady Ridge Dr, Las Vegas, NV 89135"),
    sr("9/23/26", "14:00", "YVONNE", "SR FRONT - YVONNE - RAHMAN")] },
  { name: "Soo Uh", designer: "BEX", address: "12006 Girasole Ave, Las Vegas, NV 89138", visits: [
    c("9/17/26", "09:00", "BEX", "9 Bex Appt with Soo Uh @ 12006 Girasole Ave., Las Vegas, NV 89138", "12006 Girasole Ave, Las Vegas, NV 89138"),
    sr("9/21/26", "09:00", "BEX", "9 Bex SR FRONT with Soo Uh")] },
  { name: "Mallori", designer: "YVONNE", address: "12381 Brantley Cove Dr, Las Vegas, NV 89138", visits: [
    c("9/21/26", "12:00", "YVONNE", "Yvonne @ Mallori Consultation @ 12381 Brantley Cv Dr, Las Vegas, NV 89138", "12381 Brantley Cove Dr, Las Vegas, NV 89138")] },
  { name: "Angela Porello", designer: "BEX", address: "22 Carolina Cherry Dr", visits: [
    c("9/21/26", "13:00", "BEX", "1 Bex @ Angela Porello @ 22 Carolina Cherry Dr", "22 Carolina Cherry Dr")] },
  { name: "Donaldson", designer: "CISSY", address: "12613 Penfield Ave, Las Vegas, NV 89138", sold: true, visits: [
    c("9/22/26", "10:00", "CISSY", "Cissy @ Donaldson @ 12613 Penfield Ave, Las Vegas, NV 89138", "12613 Penfield Ave, Las Vegas, NV 89138"),
    jc("9/25/26", "10:30", "CISSY", "1030 Bex JC with Cissy @ 12613 penfield avenue, las vegas, nv 89138", "12613 Penfield Ave, Las Vegas, NV 89138")] },
  { name: "Andrews", designer: "MONICA", address: "5945 Palmilla St, North Las Vegas, NV 89031", advanceTo: "canceled_appointment", visits: [
    { ...c("9/22/26", "13:00", "MONICA", "cancelled---Monica @ Andrews Consultation @ 5945 Palmilla St, North Las Vegas, NV 89031", "5945 Palmilla St, North Las Vegas, NV 89031"), status: "cancelled" }] },
  { name: "Blitz", designer: "MONICA", address: "1273 Anamarie Ln, Henderson, NV 89002", visits: [
    c("9/23/26", "14:00", "MONICA", "Monica @ Blitz Consultation @ 1273 Anamarie Ln, Henderson, NV 89002", "1273 Anamarie Ln, Henderson, NV 89002"),
    sr("9/30/26", "12:00", "MONICA", "Monica -Blitz SR BACK")] },
  { name: "Ronski", designer: "MONICA", address: "9425 Steeplehill Dr, Las Vegas, NV 89117", visits: [
    c("9/24/26", "12:00", "MONICA", "Monica @ Ronski Consultation @ 9425 Steeplehill Dr, Las Vegas, NV 89117", "9425 Steeplehill Dr, Las Vegas, NV 89117"),
    sr("9/24/26", "17:00", "MONICA", "Monica -SR BACK Ronski Consultation")] },
  { name: "Cana", designer: "SANDY", address: "9217 Quartz Hills Ave, Las Vegas, NV 89178", visits: [
    c("9/25/26", "18:00", "SANDY", "Sandy @ Cana Consultation @ 9217 Quartz Hls Ave, Las Vegas, NV 89178", "9217 Quartz Hills Ave, Las Vegas, NV 89178")] },
  { name: "Moore", designer: "CISSY", address: "704 Everett Ridge Ave, North Las Vegas, NV 89084", visits: [
    c("9/25/26", "09:00", "CISSY", "Cissy @ Moore Consultation @ 704 Everett Ridge Ave, North Las Vegas, NV 89084", "704 Everett Ridge Ave, North Las Vegas, NV 89084")] },
  { name: "Richter", designer: "SANDY", address: "8221 Impatiens Ave, Las Vegas, NV 89131", visits: [
    c("9/26/26", "11:00", "SANDY", "Sandy @ Richter Consultation @ 8221 Impatients Ave, Las Vegas, NV 89131", "8221 Impatiens Ave, Las Vegas, NV 89131")] },
  { name: "Steve Hohenshil", designer: "BEX", address: "230 Tarragona Breeze Ave, Las Vegas, NV 89138", sold: true, visits: [
    c("9/26/26", "10:00", "BEX", "10 Bex appt with Steve Hohenshil 460153 @ 230 Tarragona Breeze Ave 89138", "230 Tarragona Breeze Ave, Las Vegas, NV 89138")] },
  { name: "Jamie & Marlon", designer: null, address: "11958 Girasole Ave, Las Vegas, NV 89138", visits: [
    c("9/28/26", "12:00", null, "Jamie and Marlon @ 11958 Girasole Avenue, Las Vegas, NV 89138", "11958 Girasole Ave, Las Vegas, NV 89138")] },
  { name: "Kurle", designer: "CISSY", sold: true, visits: [
    sr("9/4/26", "12:00", "CISSY", "Kurle- sr back Cissy"),
    sr("9/22/26", "13:00", "CISSY", "Cissy SR back Kurle")] },
];

const STAGE_RANK: Record<string, number> = {
  new: 0, follow_up: 1, attempt_1: 1, attempt_2: 1, attempt_3: 1, attempt_4: 1, attempt_5: 1,
  nurturing: 1, prospect: 1, canceled_appointment: 2, rescheduled: 3, appointment_set: 3, moved_to_studio: 4,
};

function pickLead(leads: Row[], clientsById: Map<string, Row>, find: RegExp): Row | null {
  const hits = leads.filter((l) => find.test(clientsById.get(l.client_id)?.name ?? ""));
  if (!hits.length) return null;
  return hits.sort((a, b) => (STAGE_RANK[b.stage] ?? 0) - (STAGE_RANK[a.stage] ?? 0))[0];
}

async function addVisits(person: CalendarPerson, lead: Row, staff: Row[], existingAppts: Row[]) {
  for (const v of person.visits) {
    const at = pt(v.date, v.time);
    if (existingAppts.some((a) => a.lead_id === lead.id && new Date(a.scheduled_at).getTime() === new Date(at).getTime())) {
      say(`    = appt ${v.date} ${v.time} already there`);
      continue;
    }
    const status = v.status ?? (new Date(at) < NOW ? "completed" : "scheduled");
    await insert("ic_appointments", {
      lead_id: lead.id,
      client_id: lead.client_id,
      designer_id: staffId(staff, v.designer),
      kind: v.kind,
      subject: v.kind === "job_check" ? "Job check" : v.location === "showroom" ? "Showroom visit" : "Design consultation",
      scheduled_at: at,
      location_type: v.location,
      location_text: v.location === "showroom" ? "Las Vegas Showroom" : v.address ?? person.address ?? null,
      status,
      notes: `Google Calendar: ${v.text}`,
      import_batch: BATCH,
    });
    say(`    + ${v.kind}/${v.location} ${v.date} ${v.time} ${v.designer ?? "no designer"} [${status}]`);
  }
}

async function phase5() {
  const staff = await loadStaff();
  const clients = await getAll("ic_clients?select=id,name,phone,email,address&deleted_at=is.null");
  const clientsById = new Map(clients.map((cl) => [cl.id, cl]));
  const leads = await getAll("ic_leads?select=*&deleted_at=is.null");
  const appts = await getAll("ic_appointments?select=id,lead_id,scheduled_at&deleted_at=is.null");

  for (const group of [SCHEDULED_VISITS, EXISTING_LEAD_VISITS]) {
    for (const person of group) {
      const lead = pickLead(leads, clientsById, person.find!);
      if (!lead) {
        say(`!! no lead found for ${person.find} — run phase 3 first`);
        continue;
      }
      const client = clientsById.get(lead.client_id);
      say(`${client?.name} (lead ${lead.stage})`);
      await addVisits(person, lead, staff, appts);
      const fill: Row = {};
      if (person.advanceTo && (STAGE_RANK[person.advanceTo] ?? 0) > (STAGE_RANK[lead.stage] ?? 0)) fill.stage = person.advanceTo;
      if (!lead.designer_id && person.designer) fill.designer_id = staffId(staff, person.designer);
      if (person.address && !lead.street) {
        const a = splitAddress(person.address);
        Object.assign(fill, { street: a.street, city: a.city, state: a.state ?? lead.state, zip: lead.zip ?? a.zip, address_raw: person.address });
      }
      if (Object.keys(fill).length) {
        await patch("ic_leads", `id=eq.${lead.id}`, { ...fill, import_batch: lead.import_batch ?? BATCH });
        say(`    ~ lead ${Object.entries(fill).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      }
      if (person.address && client && !client.address) await patch("ic_clients", `id=eq.${client.id}`, { address: person.address });
    }
  }

  for (const person of CALENDAR_ONLY) {
    const name = person.name!;
    const existing = leads.find((l) => l.import_batch === BATCH && l.stage_raw === "From calendar" && clientsById.get(l.client_id)?.name === name);
    let lead = existing ?? null;
    const first = person.visits[0];
    if (!lead) {
      const addr = splitAddress(person.address ?? null);
      const client = await insert("ic_clients", {
        name,
        address: person.address ?? null,
        identity_key: clientIdentityKey(name),
        created_at: pt(first.date, first.time),
        notes: "Created from the designers' Google Calendar (no phone/email on the calendar).",
        import_batch: BATCH,
      });
      const designer = staffId(staff, person.designer);
      const parts = name.split(" ");
      const stage = person.advanceTo ?? (person.sold ? "moved_to_studio" : "appointment_set");
      lead = await insert("ic_leads", {
        client_id: client.id,
        source: "other",
        source_raw: "Google Calendar",
        stage,
        stage_raw: "From calendar",
        designer_id: designer,
        owner_id: designer,
        lead_owner_name: person.designer,
        first_name: parts.length > 1 ? parts.slice(0, -1).join(" ") : null,
        last_name: parts[parts.length - 1],
        street: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        address_raw: person.address ?? null,
        country: "United States",
        showroom_visit: person.visits.some((v) => v.location === "showroom"),
        data_flags: person.designer ? ["missing_contact"] : ["missing_contact", "missing_staff"],
        notes: person.visits.map((v) => `Calendar ${v.date} ${v.time}: ${v.text}`).join("\n"),
        created_at: pt(first.date, first.time),
        community_created_by: "Google Calendar PDF (Aug 30 – Dec 31, 2026)",
        import_batch: BATCH,
      });
      say(`+ calendar lead ${name} | ${stage} | ${person.designer ?? "UNASSIGNED"}`);
    } else {
      say(`= calendar lead ${name} exists`);
    }
    await addVisits(person, lead!, staff, appts);
  }
}

// ---------------------------------------------------------------- 4 jobs

type Draft = ReturnType<typeof buildDrafts>["jobs"][number];

const TRACKING_ALIASES: Record<string, string> = { OSHNER: "OCHSNER", OCCULEE: "OCULEE", MAHONY: "MAHONEY" };
const SKIP_DRAFT_KEYS = new Set(["SIMMONS"]);

const CALENDAR_JOB_NOTES: Array<[RegExp, string]> = [
  [/^OCHSNER$/, "Calendar 8/30 11am: SR BACK - YVONNE - OCHSNER; 9/1 10am: YVONNE - JC - OCHSNER"],
  [/^SKINNER$/, "Calendar 8/31 9:30am: YVONNE - JC - SKINNER"],
  [/^NORTHERN$/, "Calendar 9/1 2pm: Northern JC Craig-Frank @ 7007 Cordite Rd, Las Vegas, NV 89178"],
  [/^LONG$/, "Calendar 8/31 consult, 9/4 SR front, 9/7 JC (Yvonne)"],
  [/^PRIVMAN$/, "Calendar 9/7 SR front, 9/16 job check @ 11280 Granite Ridge (Summer, Bex)"],
  [/^HOWATT$/, "Calendar 9/16 consult, 9/23 SR back, 9/25 9:30am job check (Yvonne)"],
  [/^DONALDSON$/, "Calendar 9/22 consult, 9/25 10:30am JC with Cissy @ 12613 Penfield Ave"],
  [/^WHITTEMORE$/, "Calendar 9/28 10am: Becka JC @ Whittemore @ 2411 Green Mountain Ct"],
  [/^NELSON$/, "Calendar 9/9 10am: Bex @ Casey Nelson Garage @ 312 Proud Eagle Ln, 89144; 9/28 9am: Bex JC @ Nelson Garage"],
  [/^WHELAN$/, "Calendar 9/23 4:30pm: Final measure - Whelan"],
  [/^O HEARN$/, "Calendar 9/9 12:30pm: O Hearn Final Measure"],
  [/^SEBERRY$/, "Calendar 9/15 4pm: CRAIG @ SEBERRY @ 309 Whispering Tree Ave, Las Vegas, NV 89183"],
  [/^POHLMAN$/, "Calendar 9/4 10am: Sandy Craig Job Check Pohlman"],
  [/^VARGAS$/, "Calendar 9/3 3pm: VARGAS-S/R-FT-CRAIG @ 6445 W Sunset Rd ste #160"],
  [/^MOFFITT$/, "Calendar 9/8 1pm: MOFFITT-CRAIG"],
  [/^HEINRICH$/, "Calendar 9/9 1pm: HEINRICH-CRAIG"],
  [/^PLUCHINO 4$/, "Calendar 9/15 12pm: Bex @ Pluchino @ 2910 Reverence Heights Ln"],
  [/^HARTFIELD$/, "Calendar 9/18 10am: YVONNE - HARTFIELD - repeat"],
  [/^SIGNATURE HOMES-SWEETLAND$/, "Calendar 9/26 11:30am: Monica-Sweetland SR BACK"],
];

/** Pairs that might be the same job; noted on both and listed in the report. */
const POSSIBLE_SAME_JOB: Array<[string, string]> = [
  ["wh:HARTFIELD", "HARTFIELD"],
  ["wh:FRIEDMAN", "FRIEDMAN"],
  ["inst:PRIETO", "PRIETO"],
  ["wh:LUKE", "SILBERMAN-LUKE"],
  ["wh:SIGNATURE HOMES MODEL/JESSUP", "SIGNATURE HOMES MODEL"],
  ["wh:WESTPOINT-VARGAS", "VARGAS"],
  ["wh:CUSHMAN", "CUSHMAN"],
];

function refKey(ref: string): string {
  return ref.slice(ref.indexOf(":") + 1);
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function stripOwes(notes: string | null): string {
  return (notes ?? "").split("\n").filter((l) => !/^Owes: \$/.test(l)).join("\n");
}

function normNote(n: string): string {
  const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  return n
    .toLowerCase()
    .replace(/^sheet 9\/28: /, "")
    .replace(/\b(\d{1,2})-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b(-\d{2,4})?/g, (_m, d, m) => `${MON[m]}/${Number(d)}`)
    .replace(/\b0?(\d{1,2})\/0?(\d{1,2})(\/(20)?\d{2})?\b/g, "$1/$2")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeTrackingServices(drafts: Draft[]): Draft[] {
  const out: Draft[] = [];
  const byRef = new Map<string, Draft>();
  for (const d of drafts) {
    const prior = byRef.get(d.ref);
    if (prior && d.kind !== "new_install" && d.ref.startsWith("track:")) {
      const dates = [prior.installDate, d.installDate].filter(Boolean) as string[];
      prior.installDate = dates.sort().at(-1) ?? prior.installDate;
      prior.notes.push(`Visits: ${dates.sort().join(", ")}`, ...d.notes.filter((n) => !prior.notes.includes(n)));
      prior.owesCents = Math.max(prior.owesCents, d.owesCents);
      continue;
    }
    byRef.set(d.ref, d);
    out.push(d);
  }
  return out;
}

async function phase4() {
  if (!process.env.IC_SERVICES_DIR) throw new Error("Set IC_SERVICES_DIR=.tmp/services (the converted sheet).");
  const staff = await loadStaff();
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const { jobs: rawDrafts } = buildDrafts();
  const drafts = mergeTrackingServices(rawDrafts);
  const jobs = await getAll("ic_jobs?select=*&deleted_at=is.null");
  const clients = await getAll("ic_clients?select=id,name,identity_key&deleted_at=is.null");
  const clientByKey = new Map<string, string>();
  for (const cl of clients) if (!clientByKey.has(clientIdentityKey(cl.name))) clientByKey.set(clientIdentityKey(cl.name), cl.id);

  const byRef = new Map(jobs.filter((j) => j.workbook_ref).map((j) => [j.workbook_ref as string, j]));
  const claimed = new Set<string>();
  const byKey = new Map<string, Row[]>();
  for (const j of jobs) {
    if (!j.workbook_ref) continue;
    const k = refKey(j.workbook_ref);
    byKey.set(k, [...(byKey.get(k) ?? []), j]);
  }

  const report: string[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const stats: Record<string, number> = {};
  const bump = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);

  // Pass 1: find the OS job for every draft.
  const matched: Array<{ d: Draft; j: Row | null; moved: boolean }> = [];
  const misspelled: Draft[] = [];
  for (const d of drafts) {
    const key = refKey(d.ref);
    if (SKIP_DRAFT_KEYS.has(key)) {
      report.push(`skip ${d.displayName}: no data on the sheet`);
      continue;
    }
    if (TRACKING_ALIASES[key]) {
      misspelled.push(d);
      continue;
    }
    const exact = byRef.get(d.ref);
    if (exact && !claimed.has(exact.id)) {
      claimed.add(exact.id);
      matched.push({ d, j: exact, moved: false });
      continue;
    }
    matched.push({ d, j: null, moved: false });
  }
  for (const m of matched) {
    if (m.j) continue;
    const key = refKey(m.d.ref);
    const candidates = (byKey.get(key) ?? []).filter(
      (j) =>
        !claimed.has(j.id) &&
        ["new_install", "go_back"].includes(j.job_kind ?? "new_install") &&
        !j.workbook_ref.startsWith("track:"),
    );
    if (candidates.length === 1 && m.d.kind === "new_install") {
      m.j = candidates[0];
      m.moved = true;
      claimed.add(candidates[0].id);
    }
  }
  for (const d of misspelled) {
    const key = refKey(d.ref);
    const alias = TRACKING_ALIASES[key];
    const lines = d.notes.map((n) => `(tracking, spelled ${key}) ${n}`);
    if (d.installDate) lines.push(`(tracking, spelled ${key}) visit ${d.installDate}`);
    const host = matched.find((m) => refKey(m.d.ref) === alias && !m.d.ref.startsWith("track:")) ?? matched.find((m) => refKey(m.d.ref) === alias);
    if (host) {
      host.d = { ...host.d, notes: [...host.d.notes, ...lines] };
      report.push(`misspelling ${key} → ${alias}: visit notes added to ${host.d.ref}`);
      continue;
    }
    const target = (byKey.get(alias) ?? [])[0];
    if (target) {
      matched.push({ d: { ...d, notes: lines.map((l) => `Sheet 9/28 ${l}`), installDate: null, contractCents: 0, owesCents: -1, designerHint: null, stage: target.stage } as Draft, j: target, moved: false });
      report.push(`misspelling ${key} → ${alias}: visit notes added to ${target.workbook_ref}`);
    } else {
      matched.push({ d, j: null, moved: false });
    }
  }

  // Pass 2: apply sheet values.
  for (const { d, j, moved } of matched) {
    const designerId = d.designerHint ? staffId(staff, d.designerHint.split(/[\s/-]/)[0]) : null;
    const isAliasNote = d.owesCents === -1;
    if (!j) {
      const identity = clientIdentityKey(d.displayName);
      let clientId = clientByKey.get(identity);
      if (!clientId) {
        const cl = await insert("ic_clients", { name: clientDisplayName(d.displayName), identity_key: identity, import_batch: BATCH });
        clientId = cl.id;
        clientByKey.set(identity, clientId!);
      }
      const past = d.installDate ? new Date(`${d.installDate}T23:00:00-07:00`) < NOW : false;
      const stage =
        d.kind === "service" && d.ref.startsWith("track:") && past
          ? d.owesCents > 0 ? "final_payment" : "closed"
          : d.stage === "quoted" && d.installDate && d.ref.startsWith("wh:") ? "install_scheduled" : d.stage;
      const notes = [...d.notes, d.owesCents > 0 && !d.notes.some((n) => n.startsWith("Owes:")) ? `Owes: ${money(d.owesCents)}` : null]
        .filter(Boolean)
        .map((n) => (n!.startsWith("Owes:") ? n : `Sheet 9/28: ${n}`));
      await insert("ic_jobs", {
        client_id: clientId,
        designer_id: designerId,
        installer_id: d.installerHint ? staffId(staff, d.installerHint) : null,
        stage,
        job_kind: d.kind,
        contract_cents: d.contractCents,
        sold_date: d.soldDate,
        install_date: d.installDate,
        receive_date: d.receiveDate,
        completed_date: stage === "closed" || stage === "final_payment" ? d.completedDate ?? (past ? d.installDate : null) : d.completedDate,
        estimated_install_days: d.crewDays,
        visit_window: d.visitWindow,
        tentative_install_notes: d.tentative,
        workbook_ref: d.ref,
        title: jobDescriptorFromName(d.displayName),
        notes: notes.join("\n") || null,
        import_batch: BATCH,
      });
      created += 1;
      bump(`created:${d.kind}`);
      report.push(`+ NEW ${d.displayName} [${d.ref}] ${d.kind} ${stage} ${money(d.contractCents)} designer=${d.designerHint ?? "-"} install=${d.installDate ?? "-"} owes=${money(d.owesCents)}`);
      continue;
    }

    const body: Row = {};
    const changes: string[] = [];
    const change = (field: string, label: string, next: unknown) => {
      const cur = j[field] ?? null;
      if ((next ?? null) === cur) return;
      body[field] = next;
      changes.push(`${label}: was ${cur ?? "—"}, now ${next ?? "—"}`);
    };

    if (!isAliasNote) {
      if (d.stage !== j.stage && d.stage !== "quoted" && !(j.stage === "install_complete" && d.stage === "install_scheduled")) {
        change("stage", "stage", d.stage);
        if (!["closed", "final_payment", "install_complete"].includes(d.stage) && j.completed_date) change("completed_date", "completed", null);
      }
      if (d.contractCents > 0) change("contract_cents", "amount", d.contractCents);
      if (d.installDate) change("install_date", "install", d.installDate);
      if (d.soldDate) change("sold_date", "sold", d.soldDate);
      if (d.receiveDate) change("receive_date", "received", d.receiveDate);
      if (d.completedDate && (d.stage === "closed" || d.stage === "final_payment")) change("completed_date", "completed", d.completedDate);
      if (designerId && designerId !== j.designer_id) {
        const cur = j.designer_id ? staffName.get(j.designer_id) : null;
        body.designer_id = designerId;
        changes.push(`designer: was ${cur ?? "—"}, now ${staffName.get(designerId)}`);
        bump(cur ? "designer changed" : "designer linked");
      } else if (d.designerHint && !designerId) {
        report.push(`?? designer "${d.designerHint}" not a staff member (${d.displayName})`);
      }
      if (d.crewDays && d.crewDays !== j.estimated_install_days) change("estimated_install_days", "install days", d.crewDays);
      if (d.visitWindow) change("visit_window", "visit window", d.visitWindow);
      if (d.tentative) change("tentative_install_notes", "tentative", d.tentative);
      if (moved) change("workbook_ref", "sheet tab", d.ref);
    }

    const existingNotes = isAliasNote ? j.notes ?? "" : stripOwes(j.notes);
    const seen = new Set(existingNotes.split("\n").map(normNote));
    const oldOwes = Math.round(Number((j.notes ?? "").match(/Owes: \$([\d.]+)/)?.[1] ?? 0) * 100);
    const addLines = d.notes
      .filter((n) => !n.startsWith("Owes:") && !seen.has(normNote(n)))
      .map((n) => (n.startsWith("Sheet 9/28") ? n : `Sheet 9/28: ${n}`));
    const owesLine = !isAliasNote && d.owesCents > 0 ? `Owes: ${money(d.owesCents)}` : null;
    if (!isAliasNote && d.owesCents !== oldOwes) changes.push(`owes: was ${money(oldOwes)}, now ${money(d.owesCents)}`);
    const nonDesignerChanges = changes.filter((ch) => !ch.startsWith("designer:"));
    const changeLines = nonDesignerChanges.length ? [`Sheet 9/28 changes — ${nonDesignerChanges.join("; ")}`] : [];
    const noteChanged = addLines.length > 0 || changeLines.length > 0 || (!isAliasNote && d.owesCents !== oldOwes);
    if (noteChanged) {
      body.notes = [existingNotes.trim(), ...addLines, ...changeLines, owesLine].filter(Boolean).join("\n");
    }
    if (!Object.keys(body).length) {
      unchanged += 1;
      continue;
    }
    body.import_batch = BATCH;
    await patch("ic_jobs", `id=eq.${j.id}`, body);
    updated += 1;
    if (moved) bump("moved tab");
    if (body.stage) bump(`stage→${body.stage}`);
    if (changes.some((ch) => ch.startsWith("stage: was closed"))) bump("reopened");
    report.push(`~ ${d.displayName} [${j.workbook_ref}${moved ? ` → ${d.ref}` : ""}] ${changes.join(" | ")}${addLines.length ? ` | +${addLines.length} note lines` : ""}`);
  }

  // Calendar notes onto jobs, and possible-same-job notes.
  const fresh = APPLY ? await getAll("ic_jobs?select=id,workbook_ref,notes&deleted_at=is.null") : jobs;
  for (const [pattern, line] of CALENDAR_JOB_NOTES) {
    const targets = fresh.filter((j) => j.workbook_ref && pattern.test(refKey(j.workbook_ref)) && !j.workbook_ref.startsWith("gb:") && !j.workbook_ref.startsWith("svc:"));
    const target = targets.find((j) => j.workbook_ref.startsWith("wh:") || j.workbook_ref.startsWith("inst:")) ?? targets[0];
    if (!target) {
      report.push(`calendar note, no job yet: ${line}`);
      continue;
    }
    if ((target.notes ?? "").includes(line)) continue;
    await patch("ic_jobs", `id=eq.${target.id}`, { notes: [target.notes, line].filter(Boolean).join("\n"), import_batch: BATCH });
    report.push(`calendar note → ${target.workbook_ref}: ${line}`);
  }
  for (const [newRef, otherKey] of POSSIBLE_SAME_JOB) {
    const a = fresh.find((j) => j.workbook_ref === newRef);
    const b = fresh.find((j) => j.workbook_ref && refKey(j.workbook_ref) === otherKey && j.workbook_ref !== newRef);
    if (!a || !b) {
      report.push(`possible same job ${newRef} ↔ ${otherKey}: ${a ? "" : "new job missing (dry run)"}${b ? "" : " other job not found"}`);
      continue;
    }
    const la = `Possibly the same project as ${b.workbook_ref} — confirm before merging.`;
    const lb = `Possibly the same project as ${a.workbook_ref} — confirm before merging.`;
    if (!(a.notes ?? "").includes(la)) await patch("ic_jobs", `id=eq.${a.id}`, { notes: [a.notes, la].filter(Boolean).join("\n"), import_batch: BATCH });
    if (!(b.notes ?? "").includes(lb)) await patch("ic_jobs", `id=eq.${b.id}`, { notes: [b.notes, lb].filter(Boolean).join("\n"), import_batch: BATCH });
    report.push(`possible same job: ${a.workbook_ref} ↔ ${b.workbook_ref}`);
  }

  const untouched = jobs.filter((j) => j.workbook_ref && !claimed.has(j.id) && !j.deleted_at);
  for (const j of untouched) report.push(`not on any sheet tab (left as is): ${j.workbook_ref} ${j.stage}`);

  say(`jobs: created ${created}, updated ${updated}, unchanged ${unchanged}, not on sheet ${untouched.length}`);
  say(`breakdown ${JSON.stringify(stats)}`);
  const file = path.join(ROOT, ".tmp", `review-jobs-2026-09-28${APPLY ? "" : "-dry"}.md`);
  fs.writeFileSync(file, `# Job changes from the sheet (9/28)\n\n${report.map((r) => `- ${r}`).join("\n")}\n`);
  say(`report: ${path.relative(ROOT, file)}`);
}

// ---------------------------------------------------------------- 6 links + flags

function lastNameOf(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, "").replace(/[#\d]/g, " ").trim();
  const base = cleaned.split(/[-–/]/)[0].trim();
  const words = base.split(/\s+/).filter((w) => w && !/^(A\/O|ADD|ON|SVC|GB)$/i.test(w));
  return upper(words[words.length - 1] ?? "");
}

async function flag(leadId: string, targetType: "job" | "client" | "lead", targetId: string, matched: Row, mismatched: Row, reason: string, existing: Row[]) {
  if (existing.some((m) => m.lead_id === leadId && m.target_type === targetType && m.target_id === targetId)) return false;
  await insert("ic_lead_match_candidates", {
    lead_id: leadId,
    target_type: targetType,
    target_id: targetId,
    matched_fields: matched,
    mismatched_fields: mismatched,
    reason,
  });
  existing.push({ lead_id: leadId, target_type: targetType, target_id: targetId });
  return true;
}

async function phase6() {
  const clients = await getAll("ic_clients?select=id,name,phone,email,address&deleted_at=is.null");
  const clientsById = new Map(clients.map((cl) => [cl.id, cl]));
  const leads = await getAll("ic_leads?select=id,client_id,stage,designer_id,created_at,last_name,import_batch&deleted_at=is.null");
  const jobs = await getAll("ic_jobs?select=id,client_id,lead_id,designer_id,workbook_ref,stage,import_batch,sold_date&deleted_at=is.null");
  const appts = await getAll("ic_appointments?select=lead_id,scheduled_at&deleted_at=is.null");
  const existing = await getAll("ic_lead_match_candidates?select=lead_id,target_type,target_id");
  const leadName = (l: Row) => clientsById.get(l.client_id)?.name ?? "";
  const leadsByLast = new Map<string, Row[]>();
  for (const l of leads) {
    const last = upper(l.last_name) || lastNameOf(leadName(l));
    if (!last) continue;
    leadsByLast.set(last, [...(leadsByLast.get(last) ?? []), l]);
  }

  // 6.1 / 6.2 for sheet jobs that have no lead.
  const FLAG_ONLY = new Set(["CUSHMAN", "BRAUNGER", "PANG", "PRIVMAN", "MOORE", "SMITH", "JENSEN", "JOHNSON"]);
  let linked = 0;
  let flagged = 0;
  for (const j of jobs) {
    if (j.lead_id || j.import_batch !== BATCH || !j.workbook_ref) continue;
    const jobName = clientsById.get(j.client_id)?.name ?? refKey(j.workbook_ref);
    const last = lastNameOf(refKey(j.workbook_ref));
    if (last.length < 3) continue;
    const hits = leadsByLast.get(last) ?? [];
    if (!hits.length) continue;
    const corroborated = hits.filter(
      (l) => (l.designer_id && l.designer_id === j.designer_id) || appts.some((a) => a.lead_id === l.id),
    );
    if (hits.length === 1 && corroborated.length === 1 && !FLAG_ONLY.has(last)) {
      const lead = hits[0];
      const why = lead.designer_id === j.designer_id ? "same designer" : "calendar consultation";
      await patch("ic_jobs", `id=eq.${j.id}`, { lead_id: lead.id });
      if (lead.stage !== "moved_to_studio") await patch("ic_leads", `id=eq.${lead.id}`, { stage: "moved_to_studio" });
      linked += 1;
      say(`link ${leadName(lead)} → job ${j.workbook_ref} (last name + ${why})`);
      continue;
    }
    for (const lead of hits) {
      const matched: Row = { last_name: last };
      const mismatched: Row = {};
      if (lead.designer_id && lead.designer_id === j.designer_id) matched.designer = "same";
      else mismatched.designer = lead.designer_id && j.designer_id ? "different" : "missing on one side";
      const lc = clientsById.get(lead.client_id);
      const jc = clientsById.get(j.client_id);
      if (lc?.phone && jc?.phone) (digits(lc.phone) === digits(jc.phone) ? matched : mismatched).phone = digits(lc.phone) === digits(jc.phone) ? lc.phone : `${lc.phone} vs ${jc.phone}`;
      else mismatched.phone = "not on the job";
      const reason = hits.length > 1 ? `${hits.length} leads named ${last}` : FLAG_ONLY.has(last) ? "Last name only — confirm it's the same person" : "Last name only";
      if (await flag(lead.id, "job", j.id, matched, mismatched, `${reason}. Job: ${jobName} (${j.stage}).`, existing)) {
        flagged += 1;
        say(`flag ${leadName(lead)} ↔ job ${j.workbook_ref}: ${reason}`);
      }
    }
  }

  // Named partial matches from the plan (6.2) on older jobs.
  const named: Array<{ lead: RegExp; job: RegExp; reason: string }> = [
    { lead: /^Ken Smith$/i, job: /^(sold|wh|inst|track):(K SMITH|SMITH K)$/, reason: "Last name and first initial match; the job has no phone or email to compare." },
    { lead: /^Sophie Jensen$/i, job: /^(sold|wh|inst|track):JENSEN$/, reason: "Last name only; the job has no phone or email to compare." },
    { lead: /^Moore$/i, job: /^(sold|wh|inst|track):(MOORE|JOHNNY MOORE-LAUNDRY)$/, reason: "Calendar consultation 9/25 with Cissy; last name matches an existing job." },
  ];
  for (const spec of named) {
    const lead = leads.find((l) => spec.lead.test(leadName(l)));
    if (!lead) {
      say(`!! named flag: no lead ${spec.lead}`);
      continue;
    }
    for (const j of jobs.filter((x) => x.workbook_ref && spec.job.test(x.workbook_ref))) {
      if (await flag(lead.id, "job", j.id, { last_name: lastNameOf(leadName(lead)) }, { phone: "not on the job", email: "not on the job" }, spec.reason, existing)) {
        flagged += 1;
        say(`flag ${leadName(lead)} ↔ job ${j.workbook_ref}`);
      }
    }
  }

  // 6.3 duplicate leads already in the OS.
  for (const who of [/Tawny Bakke/i, /Jeff Braunger/i, /Joyce Pang/i, /Susan Privman/i, /Sharan Ochsner/i, /Chris Johnson/i]) {
    const pair = leads.filter((l) => who.test(leadName(l))).sort((a, b) => (STAGE_RANK[a.stage] ?? 0) - (STAGE_RANK[b.stage] ?? 0) || a.created_at.localeCompare(b.created_at));
    if (pair.length < 2) {
      say(`dup check ${who}: ${pair.length} lead(s), nothing to flag`);
      continue;
    }
    const [weaker, ...others] = pair;
    for (const other of others) {
      const matched: Row = { name: leadName(weaker) };
      if (weaker.client_id === other.client_id) matched.client = "same client record";
      if (await flag(weaker.id, "lead", other.id, matched, { stage: `${weaker.stage} vs ${other.stage}` }, "Same name as another lead. Not merged — confirm if it's a duplicate.", existing)) {
        flagged += 1;
        say(`flag duplicate lead ${leadName(weaker)} (${weaker.stage}) ↔ (${other.stage})`);
      }
    }
  }
  say(`links: ${linked}, flags: ${flagged}`);
}

// ---------------------------------------------------------------- 7 verify

async function phase7() {
  const problems: string[] = [];
  const clients = await getAll("ic_clients?select=id,name,email,phone&deleted_at=is.null");
  const leads = await getAll("ic_leads?select=id,client_id,designer_id,source,source_raw,import_batch,stage_raw,data_flags&deleted_at=is.null");
  const jobs = await getAll("ic_jobs?select=id,workbook_ref,designer_id,import_batch&deleted_at=is.null");
  const appts = await getAll("ic_appointments?select=id,lead_id,scheduled_at,status&deleted_at=is.null");
  const flags = await getAll("ic_lead_match_candidates?select=id,status");
  const byClient = new Map(clients.map((cl) => [cl.id, cl]));

  if (clients.some((cl) => /amaya|blurrd|\btest\b/i.test(`${cl.name} ${cl.email ?? ""}`))) problems.push("fake/test client still visible");
  const batchLeads = leads.filter((l) => l.import_batch === BATCH && l.stage_raw !== "From calendar" && byClient.get(l.client_id)?.phone);
  const calendarLeads = leads.filter((l) => l.stage_raw === "From calendar");
  say(`new Community leads: ${batchLeads.filter((l) => [...SCHEDULED, ...UNSCHEDULED].some((r) => digits(byClient.get(l.client_id)?.phone) === r.phone)).length} (expect 29)`);
  say(`calendar leads: ${calendarLeads.length} (expect 22)`);
  for (const r of EXISTING_BY_PHONE) {
    const n = leads.filter((l) => digits(byClient.get(l.client_id)?.phone) === r.phone).length;
    if (n !== 1) problems.push(`${r.last} has ${n} leads`);
  }
  for (const r of [...SCHEDULED, ...UNSCHEDULED]) {
    const lead = leads.find((l) => digits(byClient.get(l.client_id)?.phone) === r.phone);
    if (!lead) problems.push(`missing lead ${r.first} ${r.last}`);
    else {
      if (!lead.designer_id) problems.push(`${r.first} ${r.last} has no staff member`);
      if (lead.source_raw !== r.source) problems.push(`${r.first} ${r.last} source ${lead.source_raw}`);
    }
  }
  for (const r of SCHEDULED) {
    const lead = leads.find((l) => digits(byClient.get(l.client_id)?.phone) === r.phone);
    if (lead && !appts.some((a) => a.lead_id === lead.id)) problems.push(`${r.first} ${r.last} has no appointment`);
  }
  for (const l of calendarLeads) if (!appts.some((a) => a.lead_id === l.id)) problems.push(`calendar lead ${byClient.get(l.client_id)?.name} has no appointment`);
  const refs = new Map<string, number>();
  for (const j of jobs) if (j.workbook_ref) refs.set(j.workbook_ref, (refs.get(j.workbook_ref) ?? 0) + 1);
  for (const [ref, n] of refs) if (n > 1) problems.push(`duplicate workbook_ref ${ref} ×${n}`);
  say(`jobs changed or created by sheet: ${jobs.filter((j) => j.import_batch === BATCH).length}`);
  say(`jobs with a designer: ${jobs.filter((j) => j.designer_id).length} / ${jobs.length}`);
  say(`appointments tagged: ${appts.length}`);
  say(`pending confirmation flags: ${flags.filter((f) => f.status === "pending").length}`);
  say(problems.length ? `PROBLEMS:\n  ${problems.join("\n  ")}` : "All checks passed.");
}

async function main() {
  say(`${APPLY ? "APPLY" : "DRY RUN"} phase ${PHASE}`);
  if (APPLY && PHASE !== "0" && PHASE !== "1" && !(await phaseCheck())) {
    throw new Error("Run drizzle/0031_ic_lead_cleanup_2026_09.sql in the Supabase SQL editor first.");
  }
  const phases: Record<string, () => Promise<unknown>> = {
    check: phaseCheck, "0": phase0, "1": phase1, "2": phase2, "3": phase3, "5": phase5, "4": phase4, "6": phase6, "6b": phase6Prune, "7": phase7,
  };
  const run = phases[PHASE];
  if (!run) throw new Error(`Unknown phase ${PHASE}`);
  await run();
  const out = path.join(ROOT, ".tmp", `cleanup-phase-${PHASE}${APPLY ? "" : "-dry"}.log`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, log.join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
