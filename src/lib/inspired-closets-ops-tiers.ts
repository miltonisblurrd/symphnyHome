/** Meeting rules: Basic 3w / Middle 4w / Custom 6–7w. Encoded here — not a Frank setting. */

export const PROJECT_TIERS = ["basic", "middle", "custom", "unknown"] as const;
export type ProjectTier = (typeof PROJECT_TIERS)[number];

export type TierReason = { label: string; qty: number; source: "keyword" | "sale" | "override" };

export const TIER_WINDOWS: Record<
  Exclude<ProjectTier, "unknown">,
  { minWeeks: number; maxWeeks: number }
> = {
  basic: { minWeeks: 3, maxWeeks: 3 },
  middle: { minWeeks: 4, maxWeeks: 4 },
  custom: { minWeeks: 6, maxWeeks: 7 },
};

const TIER_RANK: Record<ProjectTier, number> = {
  unknown: 0,
  basic: 1,
  middle: 2,
  custom: 3,
};

const MIDDLE_RE =
  /\b(led|undermount|under[- ]?mount|basket|hamper|valet|belt|tie[- ]?rack|tie rack|rod|slatwall)\b/i;
const CUSTOM_RE =
  /\b(richelieu|element|high[- ]?gloss|highgloss|jewelry|jewellery|trustco|trulite|glass|drop[- ]?ship)\b/i;

export function isProjectTier(value: unknown): value is ProjectTier {
  return PROJECT_TIERS.includes(value as ProjectTier);
}

export function tierLabel(tier: string | null | undefined): string {
  if (tier === "basic") return "Basic";
  if (tier === "middle") return "Middle";
  if (tier === "custom") return "Custom";
  return "Unknown";
}

export function maxTier(a: ProjectTier, b: ProjectTier): ProjectTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export type ClassifiableLine = {
  description?: string | null;
  product_type?: string | null;
  item_code?: string | null;
  qty?: number | null;
};

function reasonLabel(text: string): string {
  const hay = text.toLowerCase();
  if (/richelieu/.test(hay)) return "Richelieu";
  if (/element/.test(hay)) return "Element doors";
  if (/high[- ]?gloss|highgloss/.test(hay)) return "High-gloss doors";
  if (/jewelry|jewellery|tray/.test(hay)) return "Jewelry trays";
  if (/trustco|trulite/.test(hay)) return "Glass / Trustco";
  if (/\bglass\b/.test(hay)) return "Glass";
  if (/led|undermount|under[- ]?mount/.test(hay)) return "LEDs";
  if (/basket/.test(hay)) return "Baskets";
  if (/rod/.test(hay)) return "Rods";
  if (/belt|tie/.test(hay)) return "Racks";
  return text.trim().slice(0, 48) || "Custom item";
}

export function classifyProjectLines(lines: ClassifiableLine[]): {
  tier: ProjectTier;
  reasons: TierReason[];
} {
  if (lines.length === 0) return { tier: "unknown", reasons: [] };
  let tier: ProjectTier = "basic";
  const buckets = new Map<string, TierReason>();
  for (const line of lines) {
    const hay = `${line.description ?? ""} ${line.product_type ?? ""} ${line.item_code ?? ""}`;
    const qty = Math.max(1, Math.round(Number(line.qty) || 1));
    let hit: ProjectTier = "basic";
    if (CUSTOM_RE.test(hay)) hit = "custom";
    else if (MIDDLE_RE.test(hay)) hit = "middle";
    tier = maxTier(tier, hit);
    if (hit === "custom" || hit === "middle") {
      const label = reasonLabel(hay);
      const current = buckets.get(label);
      if (current) current.qty += qty;
      else buckets.set(label, { label, qty, source: "keyword" });
    }
  }
  return { tier, reasons: tier === "basic" ? [] : [...buckets.values()] };
}

export function addDaysYmd(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(`${from.slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${to.slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function ageTone(days: number | null): "ok" | "warn" | "alert" | "muted" {
  if (days == null) return "muted";
  if (days >= 14) return "alert";
  if (days >= 7) return "warn";
  return "ok";
}

export type SuggestedWindow = {
  earliest: string;
  latest: string;
  minWeeks: number;
  maxWeeks: number;
  tier: Exclude<ProjectTier, "unknown">;
  label: string;
};

export function suggestedInstallWindow(input: {
  project_tier?: string | null;
  sold_date?: string | null;
  ordered_at?: string | null;
}): SuggestedWindow | null {
  const tier = isProjectTier(input.project_tier) ? input.project_tier : "unknown";
  if (tier === "unknown") return null;
  const window = TIER_WINDOWS[tier];
  const anchor = (input.ordered_at ?? input.sold_date ?? todayYmd()).slice(0, 10);
  const earliest = addDaysYmd(anchor, window.minWeeks * 7);
  const latest = addDaysYmd(anchor, window.maxWeeks * 7);
  const weekOf = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const range =
    earliest === latest
      ? `week of ${weekOf(earliest)}`
      : `${weekOf(earliest)}–${weekOf(latest)}`;
  return {
    earliest,
    latest,
    minWeeks: window.minWeeks,
    maxWeeks: window.maxWeeks,
    tier,
    label:
      window.minWeeks === window.maxWeeks
        ? `Suggested: ${range} · ${tierLabel(tier)} ${window.minWeeks} wks`
        : `Suggested: ${range} · ${tierLabel(tier)} ${window.minWeeks}–${window.maxWeeks} wks`,
  };
}

export type JobGap = {
  id: "sold_rto" | "rto_ordered" | "ordered_in" | "deposit_check";
  label: string;
  days: number;
};

export function currentJobGap(job: {
  sold_date?: string | null;
  deposit_received_at?: string | null;
  job_check_scheduled_at?: string | null;
  job_check_completed_at?: string | null;
  ready_to_order?: boolean | null;
  rto_at?: string | null;
  ordered_at?: string | null;
  fully_received_at?: string | null;
  completed_date?: string | null;
}): JobGap | null {
  if (job.completed_date) return null;
  const today = todayYmd();
  const stamp = (value?: string | null) => (value ? value.slice(0, 10) : null);
  if (!job.ready_to_order) {
    const start = stamp(job.deposit_received_at) ?? stamp(job.sold_date);
    const days = daysBetween(start, today);
    if (days == null) return null;
    if (!job.job_check_scheduled_at) {
      return { id: "deposit_check", label: "Deposit in · no job check on the calendar", days };
    }
    return { id: "sold_rto", label: "Waiting on job check / ready to order", days };
  }
  if (!job.ordered_at) {
    const start = stamp(job.rto_at) ?? stamp(job.job_check_completed_at) ?? stamp(job.sold_date);
    const days = daysBetween(start, today);
    if (days == null) return null;
    return { id: "rto_ordered", label: "Ready to order · no summary PDF", days };
  }
  if (!job.fully_received_at) {
    const days = daysBetween(stamp(job.ordered_at), today);
    if (days == null) return null;
    return { id: "ordered_in", label: "Ordered · still receiving", days };
  }
  return null;
}

export function customReasonCopy(reasons: TierReason[] | null | undefined): string {
  const custom = (reasons ?? []).filter((row) =>
    /richelieu|element|gloss|jewelry|tray|glass|trustco|trulite/i.test(row.label),
  );
  if (custom.length === 0) return "";
  return custom.map((row) => `${row.label} (${row.qty})`).join(", ");
}
