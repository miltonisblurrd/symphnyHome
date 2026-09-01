import fs from "node:fs";
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import type { IcJobKind, IcJobStage } from "../src/lib/inspired-closets-ops-jobs";

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");

const FILES = {
  sold: "SERVICES COPY REVISED 12-15(ALL SOLD JOBS 2026 ).csv",
  warehouse: "SERVICES COPY REVISED 12-15(JOBS IN WAREHOUSE).csv",
  installed: "SERVICES COPY REVISED 12-15(INSTALLED JOBS).csv",
  tracking: "SERVICES COPY REVISED 12-15(JOB TRACKING 2026).csv",
  svc: "SERVICES COPY REVISED 12-15(NEW SVC GB).csv",
};

const TRACK_SKIP = new Set([
  "CUSTOMER",
  "COMPLETE",
  "TOTAL NEW JOBS",
  "TOTAL SERVICES",
  "DATE",
  "COMPLETE & PIF",
  "COMPLETE NOT PAID",
  "NOT COMPLETE",
]);

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

const LEAD_SKIP_TOKENS = new Set([
  "ADD",
  "ON",
  "GARAGE",
  "LIST",
  "SVC",
  "GB",
  "PUNCH",
  "A/O",
  "AO",
  "THE",
  "LOT",
  "AND",
]);

type Draft = {
  displayName: string;
  key: string;
  ref: string;
  kind: IcJobKind;
  stage: IcJobStage;
  contractCents: number;
  soldDate: string | null;
  installDate: string | null;
  receiveDate: string | null;
  completedDate: string | null;
  visitWindow: string | null;
  tentative: string | null;
  designerHint: string | null;
  installerHint: string | null;
  jcHint: string | null;
  crewDays: number | null;
  notes: string[];
  cancelled: boolean;
  complete: boolean;
  notOrdered: boolean;
  ordered: boolean;
  owesCents: number;
  sources: string[];
};

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

async function fetchAll<T>(url: string, key: string, tableQuery: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const res = await rest(url, key, tableQuery, {
      headers: { Range: `${from}-${from + page - 1}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

/** Parse CSV, keep only the first `maxCols` fields so padded Excel exports stay small. */
function parseCsv(text: string, maxCols = 20): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    if (row.length < maxCols) row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field || row.length) pushRow();
  return rows;
}

function readCsv(filename: string): string[][] {
  let text = fs.readFileSync(path.join(DOCS, filename), "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parseCsv(text);
}

function cell(row: string[], i: number): string {
  return String(row[i] ?? "").trim();
}

function normKey(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/[#$.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function aliases(name: string): string[] {
  const n = normKey(name);
  const out = new Set<string>([n]);
  const stripped = n
    .replace(/\s+A\/O\b.*$/i, "")
    .replace(/\s+ADD ON\b.*$/i, "")
    .replace(/\s+-\s+\S.*$/, "")
    .replace(/\s+\d+$/, "")
    .replace(/\s+(SVC|G\/?B|PUNCH LIST)\b.*$/i, "")
    .trim();
  if (stripped) out.add(stripped);
  const first = n.split(/[\s-]+/)[0] ?? "";
  if (first.length >= 3) out.add(first);
  return [...out];
}

function lastToken(name: string): string {
  const base = name
    .trim()
    .split(/[-–—/]/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const words = base.split(" ").filter((w) => w && !/^\d+$/.test(w) && !LEAD_SKIP_TOKENS.has(w));
  if (words.length >= 2) return words[words.length - 1] ?? "";
  return words[0] ?? "";
}

function moneyCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned || cleaned === "-" || cleaned === "—" || cleaned === "$-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toIso(mm: string, dd: string, yy: string): string {
  let year = Number(yy);
  if (year < 100) year += 2000;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function extractDate(raw: string): { date: string | null; rest: string; window: string | null } {
  const v = raw.trim();
  if (!v) return { date: null, rest: "", window: null };

  const range = v.match(
    /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
  );
  if (range) {
    return {
      date: toIso(range[1], range[2], range[3] || range[6] || "26"),
      rest: v,
      window: null,
    };
  }

  const mon = v.match(
    /^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b(?:-(\d{2,4}))?/i,
  );
  if (mon) {
    return {
      date: toIso(MONTHS[mon[2].slice(0, 3).toUpperCase()] ?? "01", mon[1], mon[3] || "26"),
      rest: v.slice(mon[0].length).trim(),
      window: null,
    };
  }

  const md = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (md) {
    const rest = v.slice(md[0].length).trim().replace(/^[-–]\s*/, "");
    const window =
      rest.match(/\d{1,2}\s*[-–]\s*\d{1,2}\s*[AP]\.?M?\.?/i)?.[0] ??
      rest.match(/BETWEEN\s+\d{1,2}\s*[-–]\s*\d{1,2}\s*[AP]?\.?M?\.?/i)?.[0] ??
      rest.match(/\b\d{1,2}-\d{1,2}[AP]\b/i)?.[0] ??
      null;
    return { date: toIso(md[1], md[2], md[3] || "26"), rest, window };
  }

  return { date: null, rest: v, window: null };
}

function parseDate(raw: string): string | null {
  return extractDate(raw).date;
}

function isDateish(raw: string): boolean {
  return Boolean(parseDate(raw));
}

function pushNote(notes: string[], label: string, value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return;
  const line = label ? `${label}: ${v}` : v;
  if (!notes.includes(line)) notes.push(line);
}

function emptyDraft(name: string, ref: string, kind: IcJobKind): Draft {
  return {
    displayName: name.trim(),
    key: normKey(name),
    ref,
    kind,
    stage: "quoted",
    contractCents: 0,
    soldDate: null,
    installDate: null,
    receiveDate: null,
    completedDate: null,
    visitWindow: null,
    tentative: null,
    designerHint: null,
    installerHint: null,
    jcHint: null,
    crewDays: null,
    notes: [],
    cancelled: false,
    complete: false,
    notOrdered: false,
    ordered: false,
    owesCents: 0,
    sources: [],
  };
}

function applyStage(d: Draft): IcJobStage {
  if (d.cancelled) return "cancelled";
  if (d.kind !== "new_install") {
    return d.installDate ? "install_scheduled" : "quoted";
  }
  if (d.complete && d.owesCents <= 0) return "closed";
  if (d.complete && d.owesCents > 0) return "final_payment";
  if (d.notOrdered) return d.contractCents > 0 ? "deposit_received" : "job_check";
  if (d.ordered && d.installDate) return "install_scheduled";
  if (d.ordered) return "ordered";
  if (d.jcHint || d.soldDate) return "job_check";
  return "quoted";
}

function isCrewString(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  if (!v) return false;
  if (/[/,]/.test(v)) return true;
  if (v.includes("-") && !v.includes(" ")) {
    const parts = v.split("-").filter(Boolean);
    if (parts.length >= 2 && parts.every((part) => part.length >= 3)) return true;
  }
  return false;
}

function firstName(hint: string | null): string | null {
  if (!hint || isCrewString(hint)) return null;
  const first = hint.trim().split(/[\s-]/)[0]?.toUpperCase() ?? "";
  return first || null;
}

function applyCrew(d: Draft, installer: string) {
  if (!installer) return;
  if (isCrewString(installer)) {
    pushNote(d.notes, "Crew", installer);
    return;
  }
  d.installerHint = installer;
}

function takeNewer(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current) return next;
  return next > current ? next : current;
}

type BuildResult = {
  jobs: Draft[];
  stats: {
    sold: number;
    warehouse: number;
    installed: number;
    trackingVisits: number;
    trackingOverlay: number;
    trackingNew: number;
    trackingAmbiguous: number;
    services: number;
    total: number;
    stages: Record<string, number>;
  };
};

export function buildDrafts(): BuildResult {
  const installs = new Map<string, Draft>();
  const services: Draft[] = [];
  const aliasOwners = new Map<string, Set<string>>();

  const indexAliases = (d: Draft) => {
    for (const alias of aliases(d.displayName)) {
      const set = aliasOwners.get(alias) ?? new Set<string>();
      set.add(d.key);
      aliasOwners.set(alias, set);
    }
  };

  const upsertExact = (name: string, refPrefix: string): Draft => {
    const key = normKey(name);
    const existing = installs.get(key);
    if (existing) return existing;
    const draft = emptyDraft(name, `${refPrefix}:${key}`, "new_install");
    installs.set(key, draft);
    indexAliases(draft);
    return draft;
  };

  const resolveInstall = (name: string): Draft | "ambiguous" | null => {
    const key = normKey(name);
    const exact = installs.get(key);
    if (exact) return exact;
    const hits = new Set<string>();
    for (const alias of aliases(name)) {
      const owners = aliasOwners.get(alias);
      if (owners) for (const owner of owners) hits.add(owner);
    }
    if (hits.size === 1) return installs.get([...hits][0]) ?? null;
    if (hits.size > 1) return "ambiguous";
    return null;
  };

  const soldRows = readCsv(FILES.sold);
  let soldCount = 0;
  for (const row of soldRows.slice(2)) {
    const name = cell(row, 1);
    if (!name) continue;
    soldCount += 1;
    const d = upsertExact(name, "sold");
    d.sources.push("sold");
    d.soldDate = parseDate(cell(row, 0)) ?? d.soldDate;
    if (moneyCents(cell(row, 2))) d.contractCents = moneyCents(cell(row, 2));
    d.designerHint = cell(row, 4) || d.designerHint;
    if (cell(row, 5)) pushNote(d.notes, "Job check date", cell(row, 5));
    d.jcHint = cell(row, 7) || d.jcHint;
    if (cell(row, 9)) pushNote(d.notes, "RTO", cell(row, 9));
    const ordered = cell(row, 10);
    if (ordered) {
      const parsed = parseDate(ordered);
      if (parsed) d.ordered = true;
      else {
        d.ordered = !/not|no/i.test(ordered);
        pushNote(d.notes, "Date ordered", ordered);
      }
    }
    const dateScheduled = cell(row, 12);
    if (dateScheduled) {
      const parsed = extractDate(dateScheduled);
      d.installDate = parsed.date ?? d.installDate;
      if (!parsed.date) {
        d.tentative = dateScheduled;
        pushNote(d.notes, "Date scheduled", dateScheduled);
      } else if (parsed.rest && /[A-Z]/i.test(parsed.rest)) {
        pushNote(d.notes, "Date scheduled", dateScheduled);
      }
    }
    const receive = extractDate(cell(row, 13));
    d.receiveDate = receive.date ?? d.receiveDate;
    if (cell(row, 13) && !receive.date) pushNote(d.notes, "Receive", cell(row, 13));
    if (cell(row, 14)) pushNote(d.notes, "Palletize", cell(row, 14));
    if (cell(row, 15)) pushNote(d.notes, "Folder", cell(row, 15));
    const scheduled = cell(row, 16);
    if (scheduled) {
      const parsed = extractDate(scheduled);
      d.installDate = parsed.date ?? d.installDate;
      if (!parsed.date) {
        d.tentative = scheduled;
        pushNote(d.notes, "Scheduled", scheduled);
      } else if (scheduled.includes("-")) {
        pushNote(d.notes, "Scheduled", scheduled);
      }
    }
    if (cell(row, 17)) pushNote(d.notes, "", cell(row, 17));
    if (/cancel/i.test(cell(row, 17))) d.cancelled = true;
  }

  const warehouseRows = readCsv(FILES.warehouse);
  let warehouseCount = 0;
  for (const row of warehouseRows.slice(1)) {
    const name = cell(row, 7);
    if (!name || name.toUpperCase() === "PROJECT NAME") continue;
    warehouseCount += 1;
    const d = upsertExact(name, "wh");
    d.sources.push("warehouse");
    if (cell(row, 0)) pushNote(d.notes, "Order", cell(row, 0));
    if (cell(row, 1)) {
      const eta = extractDate(cell(row, 1));
      d.receiveDate = eta.date ?? d.receiveDate;
      if (!eta.date) pushNote(d.notes, "ETA", cell(row, 1));
    }
    const install = extractDate(cell(row, 3));
    d.installDate = install.date ?? d.installDate;
    if (cell(row, 3) && !install.date) pushNote(d.notes, "Install date", cell(row, 3));
    if (cell(row, 4)) pushNote(d.notes, "100% ready", cell(row, 4));
    if (cell(row, 5)) pushNote(d.notes, "M/U", cell(row, 5));
    if (cell(row, 6)) pushNote(d.notes, "Confirmed", cell(row, 6));
    d.designerHint = cell(row, 8) || d.designerHint;
    if (moneyCents(cell(row, 9)) && !d.contractCents) d.contractCents = moneyCents(cell(row, 9));
    const complete = cell(row, 10).toUpperCase();
    if (complete === "COMPLETE" || complete === "COMPLEYE") d.complete = true;
    if (complete === "CANCELLED") d.cancelled = true;
    if (complete === "NOT ORDERED") d.notOrdered = true;
    if (complete && !["COMPLETE", "COMPLEYE", "NOT ORDERED", "CANCELLED"].includes(complete)) {
      pushNote(d.notes, "Job complete", cell(row, 10));
    }
    if (complete && complete !== "NOT ORDERED" && complete !== "CANCELLED") d.ordered = true;
    if (cell(row, 11)) pushNote(d.notes, "Podium", cell(row, 11));
    d.owesCents = Math.max(d.owesCents, moneyCents(cell(row, 12)));
    if (cell(row, 13)) pushNote(d.notes, "", cell(row, 13));
  }

  const installedRows = readCsv(FILES.installed);
  let installedCount = 0;
  for (const row of installedRows.slice(1)) {
    const name = cell(row, 7);
    if (!name || name.toUpperCase() === "PROJECT NAME") continue;
    installedCount += 1;
    const d = upsertExact(name, "inst");
    d.sources.push("installed");
    if (cell(row, 0)) pushNote(d.notes, "Ship", cell(row, 0));
    if (cell(row, 1)) {
      const eta = extractDate(cell(row, 1));
      d.receiveDate = eta.date ?? d.receiveDate;
      if (!eta.date) pushNote(d.notes, "ETA", cell(row, 1));
    }
    const install = extractDate(cell(row, 3));
    d.installDate = install.date ?? d.installDate;
    if (cell(row, 3) && !install.date) pushNote(d.notes, "Install date", cell(row, 3));
    if (cell(row, 4)) {
      const ready = extractDate(cell(row, 4));
      d.completedDate = ready.date ?? d.completedDate;
      if (!ready.date) pushNote(d.notes, "100% ready", cell(row, 4));
    }
    if (cell(row, 5)) pushNote(d.notes, "M/U", cell(row, 5));
    if (cell(row, 6)) pushNote(d.notes, "Confirmed", cell(row, 6));
    d.designerHint = cell(row, 8) || d.designerHint;
    if (moneyCents(cell(row, 9)) && !d.contractCents) d.contractCents = moneyCents(cell(row, 9));
    const complete = cell(row, 10).toUpperCase();
    if (complete === "COMPLETE" || complete === "COMPLEYE") {
      d.complete = true;
      d.ordered = true;
    } else if (complete) {
      pushNote(d.notes, "Job complete", cell(row, 10));
    }
    if (cell(row, 11)) pushNote(d.notes, "Podium", cell(row, 11));
    d.owesCents = Math.max(d.owesCents, moneyCents(cell(row, 12)));
    if (cell(row, 13)) pushNote(d.notes, "", cell(row, 13));
  }

  const svcRows = readCsv(FILES.svc);
  for (const row of svcRows.slice(2)) {
    const kindRaw = cell(row, 2).toUpperCase().replace(/\s+/g, "");
    const name = cell(row, 5);
    if (!name) continue;
    if (!["SVC", "GB", "G/B"].includes(kindRaw)) continue;
    const kind: IcJobKind = kindRaw === "SVC" ? "service" : "go_back";
    const d = emptyDraft(name, `${kind === "service" ? "svc" : "gb"}:${normKey(name)}`, kind);
    d.sources.push("svc_gb");
    const sched = cell(row, 0);
    const parsed = extractDate(sched);
    d.installDate = parsed.date;
    d.visitWindow = parsed.window;
    if (sched && !parsed.date) {
      d.tentative = sched;
      pushNote(d.notes, "Scheduled", sched);
    } else if (parsed.rest && !parsed.window) {
      pushNote(d.notes, "Scheduled", sched);
    }
    if (cell(row, 1)) pushNote(d.notes, "Folder", cell(row, 1));
    if (cell(row, 3)) pushNote(d.notes, "Zip", cell(row, 3));
    if (cell(row, 4)) pushNote(d.notes, "Original install", cell(row, 4));
    applyCrew(d, cell(row, 6));
    d.designerHint = cell(row, 7) || d.designerHint;
    const days = Number(cell(row, 8));
    if (Number.isFinite(days) && days > 0) d.crewDays = Math.round(days);
    d.contractCents = moneyCents(cell(row, 9));
    d.owesCents = moneyCents(cell(row, 10));
    if (cell(row, 11)) pushNote(d.notes, "Payment type", cell(row, 11));
    if (cell(row, 12)) pushNote(d.notes, "", cell(row, 12));
    const parent = lastToken(name);
    if (parent) {
      const match = [...installs.values()].filter((job) => lastToken(job.displayName) === parent);
      if (match.length === 1) pushNote(d.notes, "Related install", match[0].displayName);
    }
    services.push(d);
  }

  const svcByAlias = new Map<string, Draft[]>();
  for (const d of services) {
    for (const alias of aliases(d.displayName)) {
      const list = svcByAlias.get(alias) ?? [];
      list.push(d);
      svcByAlias.set(alias, list);
    }
  }

  const trackingRows = readCsv(FILES.tracking);
  let trackingVisits = 0;
  let trackingOverlay = 0;
  let trackingNew = 0;
  let trackingAmbiguous = 0;
  for (const row of trackingRows) {
    const dateRaw = cell(row, 0);
    const name = cell(row, 1);
    const installer = cell(row, 2);
    if (!name) continue;
    const up = name.toUpperCase();
    if (TRACK_SKIP.has(up) || up.startsWith("WEEK OF") || up.startsWith("COMPLETE") || up.startsWith("TOTAL")) {
      continue;
    }
    if (!isDateish(dateRaw) && !installer) continue;
    trackingVisits += 1;

    let d: Draft | null = null;
    const resolved = resolveInstall(name);
    if (resolved === "ambiguous") {
      trackingAmbiguous += 1;
      continue;
    }
    if (resolved) {
      d = resolved;
      trackingOverlay += 1;
    } else {
      const svcHits = new Set<Draft>();
      for (const alias of aliases(name)) {
        for (const hit of svcByAlias.get(alias) ?? []) svcHits.add(hit);
      }
      if (svcHits.size === 1) {
        d = [...svcHits][0] ?? null;
        trackingOverlay += 1;
      } else if (svcHits.size > 1) {
        trackingAmbiguous += 1;
        continue;
      }
    }

    if (!d) {
      const kind: IcJobKind = /\bSVC\b/i.test(name)
        ? "service"
        : /\bG\/?B\b/i.test(name)
          ? "go_back"
          : "new_install";
      d = emptyDraft(name, `track:${normKey(name)}`, kind);
      if (kind === "new_install") {
        installs.set(d.key, d);
        indexAliases(d);
      } else {
        services.push(d);
      }
      trackingNew += 1;
    }

    d.sources.push("tracking");
    d.designerHint = cell(row, 3) || d.designerHint;
    const days = Number(cell(row, 4));
    if (Number.isFinite(days) && days > 0) d.crewDays = Math.round(days);
    if (moneyCents(cell(row, 5)) && !d.contractCents) d.contractCents = moneyCents(cell(row, 5));
    d.owesCents = Math.max(d.owesCents, moneyCents(cell(row, 6)));
    if (cell(row, 7)) pushNote(d.notes, "Payment type", cell(row, 7));
    if (cell(row, 8)) pushNote(d.notes, "Payment", cell(row, 8));
    const visit = parseDate(dateRaw);
    d.installDate = takeNewer(d.installDate, visit);
    if (dateRaw && !visit) pushNote(d.notes, "Visit", dateRaw);
    applyCrew(d, installer);
  }

  const jobs = [...installs.values(), ...services];
  const stages: Record<string, number> = {};
  for (const d of jobs) {
    if (d.owesCents > 0) pushNote(d.notes, "Owes", `$${(d.owesCents / 100).toFixed(2)}`);
    if (d.complete && !d.completedDate) d.completedDate = d.installDate;
    d.stage = applyStage(d);
    stages[d.stage] = (stages[d.stage] ?? 0) + 1;
  }

  return {
    jobs,
    stats: {
      sold: soldCount,
      warehouse: warehouseCount,
      installed: installedCount,
      trackingVisits,
      trackingOverlay,
      trackingNew,
      trackingAmbiguous,
      services: services.length,
      total: jobs.length,
      stages,
    },
  };
}

function matchStaff(hint: string | null, staff: Array<{ id: string; name: string }>): string | null {
  const first = firstName(hint);
  if (!first) return null;
  const hits = staff.filter((member) => member.name.trim().split(/\s+/)[0].toUpperCase() === first);
  return hits.length === 1 ? hits[0].id : null;
}

function jobBody(
  draft: Draft,
  ids: {
    clientId: string;
    leadId: string | null;
    staff: Array<{ id: string; name: string }>;
  },
) {
  return {
    client_id: ids.clientId,
    lead_id: ids.leadId,
    designer_id: matchStaff(draft.designerHint, ids.staff),
    installer_id: matchStaff(draft.installerHint, ids.staff),
    job_check_owner_id: matchStaff(draft.jcHint, ids.staff),
    stage: draft.stage,
    job_kind: draft.kind,
    contract_cents: draft.contractCents,
    deposit_cents: 0,
    collected_cents: 0,
    sold_date: draft.soldDate,
    install_date: draft.installDate,
    receive_date: draft.receiveDate,
    completed_date: draft.completedDate,
    estimated_install_days: draft.crewDays,
    visit_window: draft.visitWindow,
    tentative_install_notes: draft.tentative,
    workbook_ref: draft.ref,
    notes: draft.notes.join("\n") || null,
    deleted_at: null,
  };
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  loadDotEnv(ROOT);
  const { jobs, stats } = buildDrafts();

  if (dry) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const [staff, leads, clients, existingJobs] = await Promise.all([
    fetchAll<{ id: string; name: string }>(url, key, "ic_staff?deleted_at=is.null&select=id,name"),
    fetchAll<{ id: string; last_name: string | null }>(
      url,
      key,
      "ic_leads?deleted_at=is.null&select=id,last_name",
    ),
    fetchAll<{ id: string; name: string }>(url, key, "ic_clients?deleted_at=is.null&select=id,name"),
    fetchAll<{ id: string; workbook_ref: string | null; community_ref: string | null }>(
      url,
      key,
      "ic_jobs?deleted_at=is.null&select=id,workbook_ref,community_ref",
    ),
  ]);

  const leadsByLast = new Map<string, string[]>();
  for (const lead of leads) {
    const last = (lead.last_name ?? "").trim().toUpperCase();
    if (!last) continue;
    const list = leadsByLast.get(last) ?? [];
    list.push(lead.id);
    leadsByLast.set(last, list);
  }

  const clientByName = new Map(clients.map((client) => [normKey(client.name), client.id]));
  const jobByRef = new Map(
    existingJobs
      .filter((job) => job.workbook_ref)
      .map((job) => [job.workbook_ref as string, job.id]),
  );

  let clientsCreated = 0;
  const missingNames = [
    ...new Set(jobs.map((job) => job.displayName).filter((name) => !clientByName.has(normKey(name)))),
  ];
  for (let i = 0; i < missingNames.length; i += 50) {
    const slice = missingNames.slice(i, i + 50);
    const created = await rest(url, key, "ic_clients", {
      method: "POST",
      body: JSON.stringify(slice.map((name) => ({ name }))),
    });
    if (!created.ok) throw new Error(await created.text());
    const rows = (await created.json()) as Array<{ id: string; name: string }>;
    for (const row of rows) {
      clientByName.set(normKey(row.name), row.id);
      clientsCreated += 1;
    }
  }

  let jobsCreated = 0;
  let jobsUpdated = 0;
  let leadsTied = 0;
  const errors: string[] = [];

  const toInsert: Array<Record<string, unknown>> = [];
  const toUpdate: Array<{ id: string; body: Record<string, unknown> }> = [];

  for (const draft of jobs) {
    const clientId = clientByName.get(normKey(draft.displayName));
    if (!clientId) {
      errors.push(`${draft.ref}: missing client`);
      continue;
    }
    const last = lastToken(draft.displayName);
    const leadHits = last.length >= 3 ? (leadsByLast.get(last) ?? []) : [];
    const leadId = leadHits.length === 1 ? leadHits[0] : null;
    if (leadId) leadsTied += 1;
    const body = jobBody(draft, { clientId, leadId, staff });
    const existingId = jobByRef.get(draft.ref);
    if (existingId) toUpdate.push({ id: existingId, body });
    else toInsert.push(body);
  }

  for (let i = 0; i < toInsert.length; i += 40) {
    const slice = toInsert.slice(i, i + 40);
    const inserted = await rest(url, key, "ic_jobs", {
      method: "POST",
      body: JSON.stringify(slice),
    });
    if (!inserted.ok) {
      errors.push(`insert batch ${i}: ${await inserted.text()}`);
      continue;
    }
    jobsCreated += slice.length;
  }

  for (const item of toUpdate) {
    const updated = await rest(url, key, `ic_jobs?id=eq.${item.id}`, {
      method: "PATCH",
      body: JSON.stringify(item.body),
    });
    if (!updated.ok) {
      errors.push(`update: ${await updated.text()}`);
      continue;
    }
    jobsUpdated += 1;
  }

  const listed = await fetchAll<{ id: string; community_ref: string | null; workbook_ref: string | null }>(
    url,
    key,
    "ic_jobs?deleted_at=is.null&select=id,community_ref,workbook_ref",
  );
  const visible = listed.filter((job) => job.community_ref !== "FIELD-TEST");
  const fieldTest = listed.length - visible.length;

  console.log(
    JSON.stringify({
      ...stats,
      clientsCreated,
      jobsCreated,
      jobsUpdated,
      leadsTied,
      listedVisible: visible.length,
      listedFieldTest: fieldTest,
      errorCount: errors.length,
      errors: errors.slice(0, 8),
    }),
  );
}

if (process.argv[1]?.includes("import-ic-jobs-from-services")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
