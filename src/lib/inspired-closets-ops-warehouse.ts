/** Pure kit rules for Bryant's warehouse portal. Safe to import from client components. */

export const GATHER_STATUSES = ["unset", "in_pile", "on_truck", "problem"] as const;
export type GatherStatus = (typeof GATHER_STATUSES)[number];

export type KitGroup = "truck" | "shelf";

export type KitProgressId = "not_started" | "gathering" | "ready" | "hold" | "no_summary";

const STOCKABLE =
  /hardware|accessor|accent|led|slatwall|wrap|bottom|handle|rod|rail|cam|hamper|valet|scribe|screw|slide/i;
const TOE = /toe\s*(kick|board)/i;
const CATALOG_SKU = /^(10000|20000|40000)\d+$/;

export function isGatherStatus(value: string): value is GatherStatus {
  return (GATHER_STATUSES as readonly string[]).includes(value);
}

export function laToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Cut pieces stay with the truck. Hardware, toe boards, and catalog SKUs are shelf pulls. */
export function kitLineGroup(line: {
  item_code?: string | null;
  description?: string | null;
  product_type?: string | null;
}): KitGroup {
  const code = (line.item_code ?? "").replace(/\s+/g, "");
  const blob = `${line.product_type ?? ""} ${line.description ?? ""}`;
  if (TOE.test(blob) || TOE.test(code)) return "shelf";
  if (CATALOG_SKU.test(code)) return "shelf";
  if (STOCKABLE.test(line.product_type ?? "") || STOCKABLE.test(line.description ?? "")) return "shelf";
  return "truck";
}

export function kitProgress(input: {
  hasSummary: boolean;
  warehouseStatus: string | null;
  markedCount: number;
}): KitProgressId {
  if (input.warehouseStatus === "ready") return "ready";
  if (input.warehouseStatus === "hold") return "hold";
  if (!input.hasSummary) return "no_summary";
  if (input.warehouseStatus === "gathering" || input.markedCount > 0) return "gathering";
  return "not_started";
}

export function kitProgressLabel(id: KitProgressId): string {
  if (id === "ready") return "Ready";
  if (id === "hold") return "Hold";
  if (id === "gathering") return "Gathering";
  if (id === "no_summary") return "No product summary";
  return "Not started";
}

export function readyGate(input: {
  hasSummary: boolean;
  lines: Array<{ gather_status: string }>;
  photoCount: number;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.hasSummary || input.lines.length === 0) {
    reasons.push("Product summary is not on this job yet.");
  } else if (input.lines.some((line) => line.gather_status === "unset" || !line.gather_status)) {
    reasons.push("Mark every line before this job can be ready.");
  }
  if (input.photoCount < 1) {
    reasons.push("Add a photo of the whole pile.");
  }
  return { ok: reasons.length === 0, reasons };
}

export function missingWarehouseSchema(message: string): boolean {
  return /warehouse_status|pile_location|warehouse_ready|gather_status|problem_note|gather_marked|ic_role|invalid input value for enum/i.test(
    message,
  );
}

export const WAREHOUSE_MIGRATION_HINT =
  "Run drizzle/0034_ic_warehouse_kit.sql in Supabase to enable the warehouse kit.";
