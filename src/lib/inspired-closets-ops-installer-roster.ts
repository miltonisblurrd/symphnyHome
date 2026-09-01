import { FIELD_TEST_MARK, isFieldTestInstaller } from "@/lib/inspired-closets-field-test-seed";

/** First names from job tracking / payroll installer tabs. MANDO is Armando. */
export const INSTALLER_DISPLAY: Record<string, string> = {
  VALU: "Valu",
  DIEGO: "Diego",
  ALEX: "Alex",
  ARMANDO: "Armando",
  MANDO: "Armando",
  JUAN: "Juan",
  RUBEN: "Ruben",
  VICTOR: "Victor",
  RANDY: "Randy",
};

const CANONICAL: Record<string, string> = {
  MANDO: "ARMANDO",
};

/** Office / warehouse / designers — never create installer accounts from these. */
const SKIP = new Set([
  "FRANK",
  "CRAIG",
  "GAVIN",
  "DES",
  "LULU",
  "BRYANT",
  "TANIA",
  "MONICA",
  "MONI",
  "NAVI",
  "REBEKAH",
  "REB",
  "YVONNE",
  "YVON",
  "CISSY",
  "CISS",
  "SUMMER",
  "SUMM",
  "SANDRA",
  "SAND",
  "SYDNEY",
  "JERISSA",
  "MILTON",
]);

export type RosterStaff = {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  active?: boolean;
};

export function canonicalInstallerToken(raw: string): string | null {
  const token = raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (token.length < 3 || token.length > 12) return null;
  if (SKIP.has(token)) return null;
  const mapped = CANONICAL[token] ?? token;
  if (!INSTALLER_DISPLAY[mapped] && !INSTALLER_DISPLAY[token]) return null;
  return mapped;
}

export function displayNameForInstaller(token: string): string {
  return INSTALLER_DISPLAY[token] ?? titleCase(token);
}

function titleCase(value: string): string {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function parseCrewTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .toUpperCase()
    .split(/[/,&+]|-(?=[A-Z])|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const token = canonicalInstallerToken(part);
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
}

export function crewTokensFromNotes(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const out: string[] = [];
  for (const line of notes.split(/\n+/)) {
    const match = line.match(/^\s*Crew:\s*(.+)$/i);
    if (!match) continue;
    for (const token of parseCrewTokens(match[1])) {
      if (!out.includes(token)) out.push(token);
    }
  }
  return out;
}

export function installerKeyFromStaffName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return canonicalInstallerToken(first);
}

export function isFieldTestStaff(row: { phone?: string | null; name?: string | null }): boolean {
  return isFieldTestInstaller(row);
}

export function isFieldTestJob(job: { community_ref?: string | null }): boolean {
  return job.community_ref === FIELD_TEST_MARK;
}

/** Real installers never match the Field-test Alex Rivera row. */
export function matchInstallerStaff(
  token: string,
  staff: RosterStaff[],
): RosterStaff | null {
  const canonical = canonicalInstallerToken(token);
  if (!canonical) return null;
  const hits = staff.filter((row) => {
    if (!row.active && row.active !== undefined) return false;
    if (isFieldTestStaff(row)) return false;
    return installerKeyFromStaffName(row.name) === canonical;
  });
  if (hits.length === 0) return null;
  const installers = hits.filter((row) => row.role === "installer");
  return (installers[0] ?? hits[0]) ?? null;
}

export function shouldBeInstallerRole(row: RosterStaff): boolean {
  const token = installerKeyFromStaffName(row.name);
  return Boolean(token && INSTALLER_DISPLAY[token] && row.role !== "installer");
}

export function jobBelongsOnField(input: {
  installerId: string;
  isTestInstaller: boolean;
  job: { installer_id?: string | null; community_ref?: string | null };
  crewJobIds: Set<string>;
  jobId: string;
}): boolean {
  const testJob = isFieldTestJob(input.job);
  if (input.isTestInstaller) return testJob;
  if (testJob) return false;
  if (input.job.installer_id === input.installerId) return true;
  return input.crewJobIds.has(input.jobId);
}
