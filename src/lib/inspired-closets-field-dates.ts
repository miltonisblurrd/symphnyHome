export function datesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && startB <= endA;
}

export function installerOffOn(
  installerId: string,
  day: string,
  timeOff: Array<{ installer_id: string; start_date: string; end_date: string; status: string }>,
): boolean {
  return timeOff.some(
    (row) =>
      row.installer_id === installerId &&
      row.status === "approved" &&
      datesOverlap(row.start_date, row.end_date, day, day),
  );
}

function ymdFromNoon(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Install days starting on install_date, skipping Saturday and Sunday after the start date. */
export function installDateSpan(
  installDate: string | null | undefined,
  estimatedDays: number | null | undefined,
): string[] {
  const start = installDate?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const days = Math.min(21, Math.max(1, Math.round(Number(estimatedDays) || 1)));
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00`);
  let guard = 0;
  while (out.length < days && guard < 60) {
    guard += 1;
    const key = ymdFromNoon(cur);
    const weekend = cur.getDay() === 0 || cur.getDay() === 6;
    if (!weekend || key === start) out.push(key);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function eachDateInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return out;
  while (cur.getTime() <= last.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
