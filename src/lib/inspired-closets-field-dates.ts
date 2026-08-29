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
