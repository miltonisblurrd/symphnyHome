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

/** Consecutive install days starting on install_date. One day when the count is blank. */
export function installDateSpan(
  installDate: string | null | undefined,
  estimatedDays: number | null | undefined,
): string[] {
  const start = installDate?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const days = Math.min(21, Math.max(1, Math.round(Number(estimatedDays) || 1)));
  const end = new Date(`${start}T12:00:00`);
  end.setDate(end.getDate() + days - 1);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return eachDateInclusive(start, `${y}-${m}-${d}`);
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
