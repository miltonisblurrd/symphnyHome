/**
 * Parse Community (Salesforce) lead exports — CSV or Excel — into OS lead rows.
 */
import { parseXlsxToSheets } from "@/lib/inspired-closets-ops-count-sheet";
import {
  FORM_TYPES,
  LEAD_SOURCES,
  LEAD_STAGES,
  ATTEMPT_STAGES,
  joinPersonName,
  splitPersonName,
  type IcLeadSourceId,
  type IcLeadStageId,
} from "@/lib/inspired-closets-ops-leads";

export type ImportedLeadRow = {
  first_name: string;
  last_name: string;
  client_name: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  address_raw: string | null;
  source: IcLeadSourceId;
  source_raw: string | null;
  stage: IcLeadStageId;
  stage_raw: string | null;
  designer_name: string | null;
  notes: string | null;
  referral_name: string | null;
  areas_of_home: string[];
  community_name: string | null;
  community_ref: string | null;
  form_type: string | null;
  created_at: string | null;
  last_modified_at: string | null;
  last_activity_at: string | null;
  community_created_by: string | null;
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter !== ",") {
    return line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim());
  }
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  if (tabs >= 2 && tabs >= commas) return "\t";
  if (semis > commas && semis >= 2) return ";";
  return ",";
}

const FIELD_ALIASES: Record<
  keyof Omit<ImportedLeadRow, "client_name" | "areas_of_home" | "source" | "stage">,
  string[]
> = {
  first_name: ["first_name", "firstname", "first"],
  last_name: ["last_name", "lastname", "last", "surname"],
  phone: ["phone", "mobile", "mobile_phone", "phone_number", "cell", "home_phone"],
  email: ["email", "email_address", "e_mail"],
  street: ["street", "street_address", "address", "address_1", "mailing_street", "billing_street"],
  city: ["city", "mailing_city", "billing_city"],
  state: ["state", "state_province", "mailing_state_province", "mailing_state"],
  zip: ["zip", "zip_postal_code", "postal_code", "mailing_zip_postal_code", "zipcode"],
  country: ["country", "mailing_country"],
  address_raw: ["address", "street_address", "mailing_street"],
  source_raw: ["inspired_closets_lead_source", "ic_lead_source", "lead_source", "source"],
  stage_raw: ["status", "lead_status", "stage", "lead_stage"],
  designer_name: [
    "lead_owner",
    "designer",
    "designer_name",
    "owner",
    "owner_name",
    "record_owner",
    "assigned_to",
  ],
  notes: ["notes", "description", "comments", "project_notes", "lead_notes"],
  referral_name: ["referral_name", "referred_by", "referral", "referrer"],
  community_name: ["community_name", "community", "subdivision"],
  community_ref: ["id", "lead_id", "community_ref", "community_id", "salesforce_id"],
  form_type: ["form_type", "form"],
  created_at: ["created_date", "created", "created_at", "date_created"],
  last_modified_at: ["last_modified_date", "last_modified", "lastmodifieddate", "modified_date"],
  last_activity_at: ["last_activity", "last_activity_date", "lastactivitydate"],
  community_created_by: ["created_by_full_name", "created_by", "created_by_name"],
};

const NAME_ALIASES = ["name", "full_name", "lead_name", "contact_name"];
const AREA_ALIASES = ["areas_of_home", "area_of_home", "project_area", "areas"];

function looksLikeLeadHeader(cells: string[]): boolean {
  const keys = cells.map(normalizeHeader);
  const hasName =
    keys.includes("first_name") ||
    keys.includes("firstname") ||
    keys.includes("last_name") ||
    keys.includes("name") ||
    keys.includes("full_name");
  const hasContact =
    keys.includes("phone") ||
    keys.includes("email") ||
    keys.includes("mobile") ||
    keys.includes("zip") ||
    keys.includes("lead_source");
  return hasName && (hasContact || keys.includes("status") || keys.includes("lead_status"));
}

function headerIndex(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((name, i) => {
    const key = normalizeHeader(name);
    if (key) map[key] = i;
  });
  return map;
}

function densifyRow(cells: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < cells.length; i += 1) out.push(String(cells[i] ?? ""));
  return out;
}

function isReportSummaryRow(cells: string[]): boolean {
  const values = cells.map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (values.some((v) => v === "count" || v === "subtotal" || v === "grand total")) return true;
  if (values.length && values.every((v) => /^[\d.]+$/.test(v) || v === "count")) return true;
  return false;
}

function parseCombinedAddress(raw: string): {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
} {
  const value = raw.trim();
  if (!value) {
    return { street: null, city: null, state: null, zip: null, country: null };
  }
  const withoutCountry = value.replace(/,?\s*United States$/i, "").trim();
  const full = withoutCountry.match(
    /^(.*),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/,
  );
  if (full) {
    return {
      street: full[1].trim() || null,
      city: full[2].trim() || null,
      state: full[3].toUpperCase(),
      zip: full[4],
      country: "United States",
    };
  }
  const zipOnly = withoutCountry.match(/^(\d{5}(?:-\d{4})?)\s*(?:US|USA)?$/i);
  if (zipOnly) {
    return {
      street: null,
      city: null,
      state: null,
      zip: zipOnly[1],
      country: "United States",
    };
  }
  return { street: value, city: null, state: null, zip: null, country: "United States" };
}

function cell(idx: Record<string, number>, cells: string[], aliases: string[]): string {
  for (const name of aliases) {
    const i = idx[name];
    if (i != null && cells[i] != null && String(cells[i]).trim()) {
      return String(cells[i]).trim();
    }
  }
  return "";
}

function mapSource(raw: string): IcLeadSourceId {
  const n = normalizeHeader(raw);
  if (!n) return "other";
  const byId = LEAD_SOURCES.find((s) => s.id === n);
  if (byId) return byId.id;
  const byLabel = LEAD_SOURCES.find((s) => normalizeHeader(s.label) === n);
  if (byLabel) return byLabel.id;
  if (n.includes("instagram")) return "instagram";
  if (n.includes("facebook") || n === "meta") return "facebook";
  if (n.includes("yelp")) return "yelp";
  if (n.includes("billboard")) return "billboard";
  if (n.includes("vehicle") || n.includes("wrap")) return "vehicle";
  if (n.includes("chatgpt") || n.includes("chat_gpt")) return "chatgpt";
  if (n.includes("organic")) return "organic_search";
  if (n.includes("paid_search") || n === "ppc" || n === "ads") return "paid_search";
  if (n.includes("website") || n === "web" || n === "online") return "website";
  if (n.includes("google")) return "google";
  if (
    n.includes("pinterest") ||
    n.includes("direct_mail") ||
    n.includes("showroom") ||
    n.includes("walk_in") ||
    n.includes("self_gen")
  ) {
    return "other";
  }
  if (n.includes("referral") && (n.includes("co") || n.includes("company"))) return "referral_company";
  if (n.includes("referral")) return "referral_personal";
  if (n.includes("phone") || n === "call" || n.includes("inbound")) return "call";
  return "other";
}

function mapStage(raw: string): IcLeadStageId {
  const n = normalizeHeader(raw);
  if (!n) return "new";
  const byId = LEAD_STAGES.find((s) => s.id === n);
  if (byId) return byId.id;
  const byLabel = LEAD_STAGES.find((s) => normalizeHeader(s.label) === n);
  if (byLabel) return byLabel.id;
  if (n === "new" || n === "new_lead" || n === "open") return "new";
  if (n.includes("schedul")) return "appointment_set";
  if (n.includes("follow")) return "follow_up";
  if (n.includes("nurtur")) return "nurturing";
  if (n.includes("studio") || n.includes("converted")) return "moved_to_studio";
  if (n.includes("junk")) return "junk";
  if (n.includes("duplicate")) return "duplicate";
  if (n.includes("prospect")) return "prospect";
  if (n.includes("reschedul")) return "rescheduled";
  if (n.includes("cancel")) return "canceled_appointment";
  return "new";
}

function mapFormType(raw: string): string | null {
  const n = normalizeHeader(raw);
  if (!n) return null;
  const hit = FORM_TYPES.find((f) => f.id === n || normalizeHeader(f.label) === n);
  return hit?.id ?? null;
}

function parseMaybeDate(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n > 20000 && n < 90000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return null;
}

function parseAreas(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;|,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function rowFromCells(idx: Record<string, number>, cells: string[]): ImportedLeadRow | null {
  const first = cell(idx, cells, FIELD_ALIASES.first_name);
  const last = cell(idx, cells, FIELD_ALIASES.last_name);
  const full = cell(idx, cells, NAME_ALIASES);
  const split = splitPersonName(full);
  const first_name = first || split.first;
  const last_name = last || split.last;
  const client_name = joinPersonName(first_name, last_name) || full;
  if (!client_name) return null;

  const addressRaw = cell(idx, cells, FIELD_ALIASES.street) || null;
  let street = addressRaw;
  let city = cell(idx, cells, FIELD_ALIASES.city) || null;
  let state = cell(idx, cells, FIELD_ALIASES.state) || null;
  let zip = cell(idx, cells, FIELD_ALIASES.zip) || null;
  let country = cell(idx, cells, FIELD_ALIASES.country) || "United States";
  if (street && !city && !state && !zip) {
    const parsed = parseCombinedAddress(street);
    street = parsed.street;
    city = parsed.city;
    state = parsed.state;
    zip = parsed.zip;
    country = parsed.country || country;
  }

  const sourceRaw = cell(idx, cells, FIELD_ALIASES.source_raw) || null;
  const stageRaw = cell(idx, cells, FIELD_ALIASES.stage_raw) || null;

  return {
    first_name,
    last_name,
    client_name,
    phone: cell(idx, cells, FIELD_ALIASES.phone) || null,
    email: cell(idx, cells, FIELD_ALIASES.email) || null,
    street,
    city,
    state,
    zip,
    country,
    address_raw: addressRaw,
    source: mapSource(sourceRaw ?? ""),
    source_raw: sourceRaw,
    stage: mapStage(stageRaw ?? ""),
    stage_raw: stageRaw,
    designer_name: cell(idx, cells, FIELD_ALIASES.designer_name) || null,
    notes: cell(idx, cells, FIELD_ALIASES.notes) || null,
    referral_name: cell(idx, cells, FIELD_ALIASES.referral_name) || null,
    areas_of_home: parseAreas(cell(idx, cells, AREA_ALIASES)),
    community_name: cell(idx, cells, FIELD_ALIASES.community_name) || null,
    community_ref: cell(idx, cells, FIELD_ALIASES.community_ref) || null,
    form_type: mapFormType(cell(idx, cells, FIELD_ALIASES.form_type)),
    created_at: parseMaybeDate(cell(idx, cells, FIELD_ALIASES.created_at)),
    last_modified_at: parseMaybeDate(cell(idx, cells, FIELD_ALIASES.last_modified_at)),
    last_activity_at: parseMaybeDate(cell(idx, cells, FIELD_ALIASES.last_activity_at)),
    community_created_by: cell(idx, cells, FIELD_ALIASES.community_created_by) || null,
  };
}

export function rowsFromGrid(grid: string[][]): ImportedLeadRow[] {
  const headerAt = grid.findIndex((row) => looksLikeLeadHeader(densifyRow(row ?? [])));
  if (headerAt < 0) return [];
  const idx = headerIndex(densifyRow(grid[headerAt] ?? []));
  const rows: ImportedLeadRow[] = [];
  let lastSource = "";
  const sourceCol = FIELD_ALIASES.source_raw.map((name) => idx[name]).find((i) => i != null);
  for (const raw of grid.slice(headerAt + 1)) {
    const cells = densifyRow(raw ?? []);
    if (isReportSummaryRow(cells)) continue;
    if (sourceCol != null) {
      const sourceRaw = cells[sourceCol]?.trim() ?? "";
      if (sourceRaw && !/^subtotal$/i.test(sourceRaw)) lastSource = sourceRaw;
      else if (!sourceRaw && lastSource) cells[sourceCol] = lastSource;
    }
    const row = rowFromCells(idx, cells);
    if (row) rows.push(row);
  }
  return rows;
}

export function parseLeadSheetText(text: string): ImportedLeadRow[] {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0] ?? "");
  const grid = lines.map((line) => splitDelimitedLine(line, delimiter));
  const rows = rowsFromGrid(grid);
  if (!rows.length) {
    throw new Error(
      "Need a header row with name (or first/last) plus phone, email, or lead source — the Community lead export.",
    );
  }
  return rows;
}

export function parseLeadXlsxBuffer(buf: Buffer): ImportedLeadRow[] {
  const sheets = parseXlsxToSheets(buf);
  for (const sheet of sheets) {
    const rows = rowsFromGrid(sheet.grid);
    if (rows.length) return rows;
  }
  throw new Error(
    "No leads found in that Excel file. Export from Community with a header row (First Name, Last Name, Phone…).",
  );
}

export function normalizePhoneKey(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

function staffKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchStaffId(
  name: string | null | undefined,
  staff: Array<{ id: string; name: string }>,
): string | null {
  if (!name?.trim()) return null;
  const key = staffKey(name);
  const exact = staff.find((person) => staffKey(person.name) === key);
  if (exact) return exact.id;
  const parts = key.split(" ");
  const last = parts[parts.length - 1] ?? "";
  const first = parts[0] ?? "";
  const byLast = staff.filter((person) => {
    const n = staffKey(person.name);
    return Boolean(last) && (n === last || n.endsWith(` ${last}`));
  });
  if (byLast.length === 1) return byLast[0].id;
  const byFirst = staff.filter((person) => {
    const n = staffKey(person.name);
    return Boolean(first) && (n === first || n.startsWith(`${first} `));
  });
  if (byFirst.length === 1) return byFirst[0].id;
  return null;
}

function attemptsFromStage(stage: string): number {
  const idx = ATTEMPT_STAGES.indexOf(stage as (typeof ATTEMPT_STAGES)[number]);
  return idx >= 0 ? idx + 1 : 0;
}

export function importedLeadColumns(
  row: ImportedLeadRow,
  opts: { designerId: string | null; actorId: string | null; isNew?: boolean },
): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    source: row.source,
    source_raw: row.source_raw,
    stage: row.stage,
    stage_raw: row.stage_raw,
    designer_id: opts.designerId,
    notes: row.notes,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    referral_name: row.referral_name,
    street: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    country: row.country,
    address_raw: row.address_raw,
    community_name: row.community_name,
    community_ref: row.community_ref || null,
    areas_of_home: row.areas_of_home,
    project_area: row.areas_of_home[0] ?? null,
    form_type: row.form_type,
    lead_owner_name: row.designer_name,
    last_activity_at: row.last_activity_at,
    last_modified_at: row.last_modified_at,
    community_created_by: row.community_created_by,
    contact_attempts: attemptsFromStage(row.stage),
    updated_by: opts.actorId,
  };
  if (row.created_at) columns.created_at = row.created_at;
  if (row.last_modified_at) columns.updated_at = row.last_modified_at;
  if (opts.isNew) {
    columns.owner_id = opts.actorId;
    columns.created_by = opts.actorId;
  }
  return columns;
}
