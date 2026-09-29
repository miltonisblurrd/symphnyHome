/**
 * Names staff go by on the services workbook, Community and the calendar,
 * keyed to the ic_staff.name they belong to.
 */
const STAFF_ALIASES: Record<string, string[]> = {
  YVON: ["YVONNE", "YVONNE DUVAL"],
  NAVI: ["NAVY"],
  CISS: ["CISSY", "CISSY VALDEZ"],
  MONI: ["MONICA"],
  SUMM: ["SUMMER"],
  SAND: ["SANDY", "SANDY SCAMMAN"],
  "REBEKAH LARSON": ["REBEKAH", "BEX", "BECKA", "BEKAH"],
  GAVIN: ["GAVIN GRUNDMEIER"],
  "DES AMAYA": ["DES"],
};

function norm(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Resolve a free-text staff name to an ic_staff id, or null when unknown or ambiguous. */
export function resolveStaffAlias(
  raw: string | null | undefined,
  staff: Array<{ id: string; name: string }>,
): string | null {
  if (!raw?.trim()) return null;
  const key = norm(raw);
  const byName = new Map(staff.map((member) => [norm(member.name), member.id]));
  const exact = byName.get(key);
  if (exact) return exact;
  for (const [canonical, names] of Object.entries(STAFF_ALIASES)) {
    if (names.includes(key)) return byName.get(canonical) ?? null;
  }
  const first = key.split(/[\s-]/)[0] ?? "";
  if (first !== key) return resolveStaffAlias(first, staff);
  return null;
}
