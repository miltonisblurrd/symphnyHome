/**
 * Deterministic install-week draft. Des reviews; nothing auto-books.
 *
 * Places ready jobs (and services / go-backs) on consecutive days after
 * materials arrive, without overbooking installer headcount.
 */
export type SuggestJob = {
  id: string;
  clientName: string;
  stage: string;
  installDate: string | null;
  receiveDate: string | null;
  crewSize: number;
  estimatedInstallDays: number;
  serviceTag: "SVC" | "G/B" | null;
  contractCents: number;
};

export type SuggestPlacement = {
  jobId: string;
  clientName: string;
  startDate: string;
  endDate: string;
  days: number;
  crewSize: number;
  reason: string;
  kind: "install" | "service";
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur < to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function suggestInstallSchedule(input: {
  from: string;
  to: string;
  installerCount: number;
  jobs: SuggestJob[];
}): { placements: SuggestPlacement[]; unplaced: Array<{ jobId: string; clientName: string; reason: string }> } {
  const capacity = Math.max(1, input.installerCount);
  const remaining: Record<string, number> = {};
  for (const day of eachDay(input.from, input.to)) remaining[day] = capacity;

  const placements: SuggestPlacement[] = [];
  const unplaced: Array<{ jobId: string; clientName: string; reason: string }> = [];

  for (const job of input.jobs) {
    if (!job.installDate) continue;
    const days = Math.max(1, job.estimatedInstallDays || 1);
    const crew = Math.max(1, job.crewSize || 2);
    let d = job.installDate;
    for (let i = 0; i < days; i += 1) {
      remaining[d] = (remaining[d] ?? capacity) - crew;
      d = addDays(d, 1);
    }
  }

  const queue = input.jobs
    .filter((job) => !job.installDate)
    .slice()
    .sort((a, b) => {
      const ar = a.receiveDate ?? "9999";
      const br = b.receiveDate ?? "9999";
      if (ar !== br) return ar.localeCompare(br);
      return b.contractCents - a.contractCents;
    });

  for (const job of queue) {
    const days = Math.max(1, job.estimatedInstallDays || (job.serviceTag ? 1 : 1));
    const crew = Math.max(1, job.crewSize || (job.serviceTag ? 1 : 2));
    const earliest = job.receiveDate
      ? addDays(job.receiveDate, 1)
      : input.from;
    const startFloor = earliest > input.from ? earliest : input.from;
    const window = eachDay(startFloor, input.to);
    let placed: string | null = null;
    for (let i = 0; i <= window.length - days; i += 1) {
      const start = window[i] ?? "";
      const slice = window.slice(i, i + days);
      if (slice.length < days) break;
      const fits = slice.every((day) => (remaining[day] ?? 0) >= crew);
      if (fits) {
        placed = start;
        for (const day of slice) remaining[day] = (remaining[day] ?? 0) - crew;
        break;
      }
    }
    if (!placed) {
      unplaced.push({
        jobId: job.id,
        clientName: job.clientName,
        reason: job.receiveDate
          ? `No ${days}-day / ${crew}-person slot after receive ${job.receiveDate}`
          : "No receive date and no open slot this window",
      });
      continue;
    }
    const endDate = addDays(placed, days - 1);
    const kind = job.serviceTag ? "service" : "install";
    const reason = job.receiveDate
      ? `Materials ${job.receiveDate}; ${crew} guys × ${days} day${days === 1 ? "" : "s"} from ${placed}`
      : `No receive date — slotted ${placed} (${crew} guys × ${days}d). Confirm with Frank.`;
    placements.push({
      jobId: job.id,
      clientName: job.clientName,
      startDate: placed,
      endDate,
      days,
      crewSize: crew,
      reason,
      kind,
    });
  }

  return { placements, unplaced };
}
