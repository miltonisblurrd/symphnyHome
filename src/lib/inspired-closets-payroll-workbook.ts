import type { OperationsSnapshot, OperationsSheetRow } from "@/lib/inspired-closets-google-sheets";
import type { AttentionSeverity, GavinPeriod } from "@/data/inspired-closets-gavin-demo";
import { gavinDemoMeta } from "@/data/inspired-closets-gavin-demo";

export const DEFAULT_RED_2026_TABS = [
  "REB 26",
  "YVON 26",
  "CISS 26",
  "MONI 26",
  "SUMM 26",
  "SAND 26",
  "TANIA 2026",
  "CRAIG 2026",
  "ALEX 2026",
  "VALU 2026",
  "JUAN 2026",
  "RUBEN 2026",
  "DIEGO 2026",
  "GAVIN 2026",
  "JERISSA 2026",
  "NAVI 2026",
  "FRANK 2026",
  "BRYANT 2026",
  "ARMANDO 2026",
  "VICTOR 2026",
  "RANDY 2026",
  "MANDO 2026",
  "SYDNEY 2026",
] as const;

const MARGIN_GATE = gavinDemoMeta.marginGate;
const MAX_ATTENTION = 48;
const MAX_CUBBY_JOBS = 80;
const MAX_CELL = 140;

export type PayrollJob = {
  id: string;
  designer: string;
  tab: string;
  client: string;
  date: string | null;
  dateMs: number | null;
  contract: number;
  deposit: number;
  collected: number;
  outstanding: number;
  marginStarting: number | null;
  marginAfterSpiff: number | null;
  marginFinal: number | null;
  hasSpiffAdjustment: boolean;
  belowGate: boolean;
  commPct: number | null;
  checkAmount: number;
  payDate: string | null;
  commissionOpen: boolean;
  notes: string;
  rowType: "job" | "training" | "adjustment" | "other";
};

export type WorkbookAttentionItem = {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  owner: string;
  amount: number | null;
  action: string;
  todoLabel: string;
  todoWhy: string;
  defaultAssignee: string;
  notifyMessage: string;
  context: string;
};

export type WorkbookFinancialPulse = {
  sales: number;
  cashCollected: number;
  outstandingBalances: number;
  collectionRate: number;
  avgMarginStarting: number;
  avgMarginFinal: number;
  jobsBelowMarginGate: number;
  jobsMissingMargin: number;
  jobsWithSpiff: number;
  atRiskSales: number;
  commissionsOpen: number;
  commissionsPaid: number;
  activeJobs: number;
  designerCount: number;
  marginSampleStarting: number;
  marginSampleCurrent: number;
  metricNotes: {
    sales: string;
    cashCollected: string;
    outstanding: string;
    collectionRate: string;
    avgMarginStarting: string;
    avgMarginFinal: string;
    belowGate: string;
    missingMargin: string;
    spiffJobs: string;
    atRiskSales: string;
    commissionsOpen: string;
    commissionsPaid: string;
    activeJobs: string;
  };
};

export type DesignerSummary = {
  designer: string;
  tab: string;
  jobCount: number;
  sales: number;
  deposits: number;
  outstanding: number;
  avgMarginStarting: number | null;
  avgMarginFinal: number | null;
  belowGateCount: number;
  commissionsOpen: number;
  commissionsPaid: number;
};

export type WorkbookHub = {
  source: "payroll_workbook";
  syncedAt: string;
  period: GavinPeriod;
  tabCount: number;
  jobCount: number;
  pulse: WorkbookFinancialPulse;
  attentionItems: WorkbookAttentionItem[];
  designers: DesignerSummary[];
};

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\n\r]+/g, " ")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(value: string): string {
  return normalizeKey(value).replace(/[^a-z0-9]/g, "");
}

function parseMoney(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parsePercent(value: string | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "—") return null;
  const cleaned = raw.replace(/%/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  // Sheets may return 0.50 (fraction) or 50 / 50.00 (percent points)
  if (num > 0 && num <= 1.5) return Number((num * 100).toFixed(2));
  if (num > 100) return null;
  return Number(num.toFixed(2));
}

function parseDate(value: string | undefined): { label: string | null; ms: number | null } {
  if (!value?.trim()) return { label: null, ms: null };
  const raw = value.trim();

  // Google Sheets UNFORMATTED_VALUE returns day serials (Excel epoch).
  // Only treat as dates in ~1990–2100 so money-like numbers elsewhere stay out.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial >= 32874 && serial < 73415) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      const year = new Date(utcMs).getUTCFullYear();
      const month = new Date(utcMs).getUTCMonth();
      const day = new Date(utcMs).getUTCDate();
      const ms = Date.UTC(year, month, day);
      return { label: `${month + 1}/${day}/${year}`, ms };
    }
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const ms = Date.UTC(year, month - 1, day);
    return { label: raw, ms };
  }
  const fallback = Date.parse(raw);
  return Number.isFinite(fallback) ? { label: raw, ms: fallback } : { label: raw, ms: null };
}

function designerFromTab(tabName: string): string {
  return tabName
    .replace(/\s*2026\s*$/i, "")
    .replace(/\s*26\s*$/i, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function findHeaderIndex(values: string[][]): number {
  const maxScan = Math.min(values.length, 8);
  for (let i = 0; i < maxScan; i += 1) {
    const row = values[i] ?? [];
    if (row.some((cell) => normalizeKey(cell) === "client")) return i;
  }
  return 0;
}

function pickColumn(
  headers: string[],
  predicates: Array<(key: string, compact: string) => boolean>,
): number {
  for (const predicate of predicates) {
    const index = headers.findIndex((header) =>
      predicate(normalizeKey(header), compactKey(header)),
    );
    if (index >= 0) return index;
  }
  return -1;
}

type PayrollColumnMap = {
  client: number;
  date: number;
  contract: number;
  deposit: number;
  marginStart: number;
  contractAfterSpiff: number;
  marginAfterSpiff: number;
  depositAfterSpiff: number;
  marginFinal: number;
  comm: number;
  check: number;
  payDate: number;
  notes: number;
};

/**
 * Fuzzy name match first, then positional fallback from the CLIENT column.
 * Red 2026 tabs follow a stable left-to-right payroll layout.
 */
function resolvePayrollColumns(headers: string[]): PayrollColumnMap {
  const client = pickColumn(headers, [(k, c) => k === "client" || c === "client"]);
  const base = client >= 0 ? client : 0;

  const named = {
    client,
    date: pickColumn(headers, [(k, c) => k === "date" || c === "date"]),
    contract: pickColumn(headers, [
      (k, c) => c.includes("totalcontract"),
      (k, c) => c === "contractamount",
      (k) => k.includes("total contract"),
    ]),
    deposit: pickColumn(headers, [
      (k, c) => c === "deposit",
      (k) => k === "deposit",
    ]),
    marginStart: pickColumn(headers, [
      (k, c) => c.includes("marginstart") || c === "marginpctstarting",
      (k) => k.includes("margin") && k.includes("start"),
      // First plain "MARGIN %" after uniquify (before AFTER SPIFF / FINAL renames)
      (k, c) => c === "margin" || c === "marginpct",
    ]),
    contractAfterSpiff: pickColumn(headers, [
      (k, c) => c.includes("contract") && c.includes("spiff"),
      (k, c) => c === "contract" && !c.includes("total"),
    ]),
    marginAfterSpiff: pickColumn(headers, [
      (k, c) => c.includes("marginafterspiff") || c.includes("marginafter"),
      (k) => k.includes("margin") && k.includes("after") && k.includes("spiff"),
    ]),
    depositAfterSpiff: pickColumn(headers, [
      (k, c) => c.includes("depositafterspiff") || c.includes("depositspiff"),
      (k, c) => c === "finalafterspiff" || c === "final",
      (k) => k.includes("deposit") && k.includes("spiff"),
    ]),
    marginFinal: pickColumn(headers, [
      (k, c) => c === "marginfinal" || c === "marginpctfinal" || c === "finalmargin",
      (k, c) => c.includes("marginfinal"),
      (k) => k.includes("margin") && k.includes("final"),
      (k, c) => c.includes("final") && c.includes("margin"),
    ]),
    comm: pickColumn(headers, [(k, c) => c.startsWith("comm") || c === "commpct"]),
    check: pickColumn(headers, [(k, c) => c === "check"]),
    payDate: pickColumn(headers, [(k, c) => c.includes("paydate")]),
    notes: pickColumn(headers, [(k, c) => c === "notes" || c === "note"]),
  };

  // Positional fallbacks relative to CLIENT (standard Inspired Closets payroll layout):
  // CLIENT | DATE | TOTAL CONTRACT | DEPOSIT | MARGIN % | CONTRACT | MARGIN % |
  // DEPOSIT | FINAL | MARGIN % | COMM | CHECK | PAY DATE | NOTES
  const positional = {
    date: base + 1,
    contract: base + 2,
    deposit: base + 3,
    marginStart: base + 4,
    contractAfterSpiff: base + 5,
    marginAfterSpiff: base + 6,
    depositAfterSpiff: base + 7,
    marginFinal: base + 9,
  };

  const within = (index: number) => index >= 0 && index < headers.length;

  return {
    client: named.client >= 0 ? named.client : base,
    date: named.date >= 0 ? named.date : positional.date,
    contract: named.contract >= 0 ? named.contract : positional.contract,
    deposit: named.deposit >= 0 ? named.deposit : positional.deposit,
    marginStart: named.marginStart >= 0 ? named.marginStart : positional.marginStart,
    contractAfterSpiff:
      named.contractAfterSpiff >= 0
        ? named.contractAfterSpiff
        : within(positional.contractAfterSpiff)
          ? positional.contractAfterSpiff
          : -1,
    marginAfterSpiff:
      named.marginAfterSpiff >= 0
        ? named.marginAfterSpiff
        : within(positional.marginAfterSpiff)
          ? positional.marginAfterSpiff
          : -1,
    depositAfterSpiff:
      named.depositAfterSpiff >= 0
        ? named.depositAfterSpiff
        : within(positional.depositAfterSpiff)
          ? positional.depositAfterSpiff
          : -1,
    marginFinal:
      named.marginFinal >= 0
        ? named.marginFinal
        : within(positional.marginFinal)
          ? positional.marginFinal
          : -1,
    comm: named.comm,
    check: named.check,
    payDate: named.payDate,
    notes: named.notes,
  };
}

function bestMargin(job: Pick<PayrollJob, "marginFinal" | "marginAfterSpiff" | "marginStarting">) {
  return job.marginFinal ?? job.marginAfterSpiff ?? job.marginStarting ?? null;
}

function classifyRow(client: string, contract: number, checkAmount: number): PayrollJob["rowType"] {
  const upper = client.toUpperCase();
  if (upper.includes("SALES TRAINING") || upper.includes("TRAINING")) return "training";
  if (upper.includes("ADJUSTMENT") || upper.includes("DEDUCT") || upper.startsWith("ADJ")) {
    return "adjustment";
  }
  if (contract > 0 || checkAmount !== 0) return "job";
  return "other";
}

function periodBounds(period: GavinPeriod, now = new Date()): { startMs: number; endMs: number } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
  const endMs = end.getTime();

  if (period === "This week") {
    const day = end.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - diff);
    start.setUTCHours(0, 0, 0, 0);
    return { startMs: start.getTime(), endMs };
  }

  if (period === "This month") {
    return {
      startMs: Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1),
      endMs,
    };
  }

  if (period === "This quarter") {
    const quarter = Math.floor(end.getUTCMonth() / 3);
    return {
      startMs: Date.UTC(end.getUTCFullYear(), quarter * 3, 1),
      endMs,
    };
  }

  // YtD and YoY both use calendar year to date for workbook view
  return {
    startMs: Date.UTC(end.getUTCFullYear(), 0, 1),
    endMs,
  };
}

function inPeriod(job: PayrollJob, startMs: number, endMs: number): boolean {
  // Undated rows are excluded from period sales (they still count in open-book metrics).
  if (job.dateMs == null) return false;
  return job.dateMs >= startMs && job.dateMs <= endMs;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function truncate(value: string, max = MAX_CELL): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function isRed2026Tab(tabName: string): boolean {
  const upper = tabName.toUpperCase().trim();
  if (upper.includes("PRIOR")) return false;
  if (upper.includes("2025")) return false;
  if (upper === "BLANK" || upper === "VACATIONS") return false;
  if (upper.includes("WAREHOUSE") || upper.includes("SALES 2019")) return false;
  if (/SHEET\d+/i.test(upper)) return false;
  if (upper.includes("2026") || /\b26\b/.test(upper)) return true;
  return DEFAULT_RED_2026_TABS.some((tab) => tab.toUpperCase() === upper);
}

export function filterDefaultSyncTabs(tabNames: string[]): string[] {
  const defaults = DEFAULT_RED_2026_TABS.map((tab) => tab.toUpperCase());
  const matchedDefaults = tabNames.filter((name) => defaults.includes(name.trim().toUpperCase()));
  if (matchedDefaults.length > 0) return matchedDefaults;

  const auto = tabNames.filter(isRed2026Tab);
  return auto.length > 0 ? auto : [...DEFAULT_RED_2026_TABS];
}

export function parsePayrollJobsFromSnapshot(snapshot: OperationsSnapshot): PayrollJob[] {
  const jobs: PayrollJob[] = [];

  for (const tab of snapshot.tabs) {
    const designer = designerFromTab(tab.name);
    const headers = tab.headers;
    if (headers.length === 0) continue;

    const idx = resolvePayrollColumns(headers);

    tab.rows.forEach((row, rowIndex) => {
      const values = headers.map((header) => row[header] ?? "");
      const client = (values[idx.client] ?? "").trim();
      if (!client) return;

      // Skip pure subtotal / section rows
      if (/^total\b/i.test(client) || client === "-" || client.toUpperCase() === "SUBTOTAL") {
        return;
      }

      const contract = idx.contract >= 0 ? parseMoney(values[idx.contract]) : 0;
      const deposit = idx.deposit >= 0 ? parseMoney(values[idx.deposit]) : 0;
      const depositAfter =
        idx.depositAfterSpiff >= 0 ? parseMoney(values[idx.depositAfterSpiff]) : 0;
      const checkAmount = idx.check >= 0 ? parseMoney(values[idx.check]) : 0;
      const collected = Math.max(deposit, depositAfter > 0 ? depositAfter : 0);
      // If "final after spiff" looks like a full remaining balance payment, still count deposit.
      const outstanding = Math.max(0, contract - Math.max(deposit, collected));
      const marginStarting = idx.marginStart >= 0 ? parsePercent(values[idx.marginStart]) : null;
      const marginAfterSpiff =
        idx.marginAfterSpiff >= 0 ? parsePercent(values[idx.marginAfterSpiff]) : null;
      const marginFinal = idx.marginFinal >= 0 ? parsePercent(values[idx.marginFinal]) : null;
      const effectiveMargin = bestMargin({ marginFinal, marginAfterSpiff, marginStarting });
      const hasSpiffAdjustment =
        (idx.contractAfterSpiff >= 0 && Boolean(values[idx.contractAfterSpiff]?.trim())) ||
        (idx.marginAfterSpiff >= 0 &&
          values[idx.marginAfterSpiff] != null &&
          String(values[idx.marginAfterSpiff]).trim() !== "") ||
        (idx.depositAfterSpiff >= 0 && depositAfter > 0);
      const dateInfo = idx.date >= 0 ? parseDate(values[idx.date]) : { label: null, ms: null };
      const payInfo = idx.payDate >= 0 ? parseDate(values[idx.payDate]) : { label: null, ms: null };
      const notes = idx.notes >= 0 ? values[idx.notes]?.trim() ?? "" : "";
      const rowType = classifyRow(client, contract, checkAmount);

      // Skip empty noise rows with no economic signal
      if (rowType === "other" && !notes && contract === 0 && checkAmount === 0) return;

      jobs.push({
        id: `${tab.name}-${rowIndex}-${client}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        designer,
        tab: tab.name,
        client,
        date: dateInfo.label,
        dateMs: dateInfo.ms,
        contract,
        deposit,
        collected: Math.max(deposit, collected),
        outstanding,
        marginStarting,
        marginAfterSpiff,
        marginFinal,
        hasSpiffAdjustment,
        belowGate: effectiveMargin != null && effectiveMargin < MARGIN_GATE,
        commPct: idx.comm >= 0 ? parsePercent(values[idx.comm]) : null,
        checkAmount,
        payDate: payInfo.label,
        commissionOpen: checkAmount > 0 && !payInfo.label,
        notes,
        rowType,
      });
    });
  }

  return jobs;
}

/** Re-parse from raw sheet values when headers may not be row 0. */
function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  return String(value).trim();
}

function uniquifyHeaders(headerRow: string[]): string[] {
  const seen = new Map<string, number>();
  return headerRow.map((cell, index) => {
    const base = cell.trim() || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) return base;
    // Preserve readable names for the known duplicate payroll columns
    if (/^margin\s*%?$/i.test(base)) {
      if (count === 1) return "MARGIN % AFTER SPIFF";
      if (count === 2) return "MARGIN % FINAL";
    }
    if (/^deposit$/i.test(base) && count === 1) return "DEPOSIT AFTER SPIFF";
    if (/^contract$/i.test(base) && count === 1) return "CONTRACT AFTER SPIFF";
    return `${base} (${count + 1})`;
  });
}

export function reparseTabWithDetectedHeaders(
  tabName: string,
  values: unknown[][],
): { headers: string[]; rows: OperationsSheetRow[] } {
  if (values.length === 0) return { headers: [], rows: [] };

  const asStrings = values.map((row) => row.map((cell) => cellToString(cell)));
  const headerIndex = findHeaderIndex(asStrings);
  const headerRow = asStrings[headerIndex] ?? [];
  const headers = uniquifyHeaders(headerRow);

  const rows: OperationsSheetRow[] = [];
  for (const rawRow of asStrings.slice(headerIndex + 1)) {
    if (!rawRow.some((cell) => cell.trim())) continue;
    const row: OperationsSheetRow = {};
    headers.forEach((header, index) => {
      row[header] = rawRow[index]?.trim() ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

const MIN_MARGIN_SAMPLE = 5;

function marginSet(jobs: PayrollJob[]) {
  const starting = jobs
    .map((job) => job.marginStarting)
    .filter((value): value is number => value != null && value > 0);
  const current = jobs
    .map((job) => bestMargin(job))
    .filter((value): value is number => value != null && value > 0);
  return { starting, current };
}

export function buildWorkbookPulse(
  jobs: PayrollJob[],
  period: GavinPeriod,
  syncedAt: string,
): WorkbookFinancialPulse {
  const { startMs, endMs } = periodBounds(period);
  const ytdBounds = periodBounds("YtD");

  const realJobs = jobs.filter((job) => job.rowType === "job");
  const periodJobs = realJobs.filter((job) => inPeriod(job, startMs, endMs));
  const ytdJobs = realJobs.filter((job) => inPeriod(job, ytdBounds.startMs, ytdBounds.endMs));
  // Open-book: all unpaid / active economics across the workbook
  const openJobs = realJobs.filter((job) => job.outstanding > 0 || job.commissionOpen);

  const sales = periodJobs.reduce((sum, job) => sum + job.contract, 0);
  const cashCollected = periodJobs.reduce((sum, job) => sum + job.collected, 0);
  const outstandingBalances = openJobs.reduce((sum, job) => sum + job.outstanding, 0);
  const collectionRate =
    sales > 0 ? Number(((cashCollected / sales) * 100).toFixed(1)) : 0;

  const periodMargins = marginSet(periodJobs);
  const ytdMargins = marginSet(ytdJobs);
  const allMargins = marginSet(realJobs);

  const useStartingFallback = periodMargins.starting.length < MIN_MARGIN_SAMPLE;
  const useCurrentFallback = periodMargins.current.length < MIN_MARGIN_SAMPLE;

  const startingSource = !useStartingFallback
    ? periodMargins.starting
    : ytdMargins.starting.length > 0
      ? ytdMargins.starting
      : allMargins.starting;
  const currentSource = !useCurrentFallback
    ? periodMargins.current
    : ytdMargins.current.length > 0
      ? ytdMargins.current
      : allMargins.current;

  const avgMarginStarting = average(startingSource) ?? 0;
  const avgMarginFinal = average(currentSource) ?? 0;

  const marginJobsForGate =
    periodMargins.current.length >= MIN_MARGIN_SAMPLE
      ? periodJobs
      : ytdJobs.length > 0
        ? ytdJobs
        : realJobs;

  const jobsBelowMarginGate = marginJobsForGate.filter((job) => job.belowGate).length;
  const jobsMissingMargin = periodJobs.filter(
    (job) => job.contract > 0 && bestMargin(job) == null,
  ).length;
  const jobsWithSpiff = periodJobs.filter((job) => job.hasSpiffAdjustment).length;
  const atRiskSales = marginJobsForGate
    .filter((job) => job.belowGate)
    .reduce((sum, job) => sum + job.contract, 0);

  const commissionsOpen = realJobs
    .filter((job) => job.commissionOpen)
    .reduce((sum, job) => sum + job.checkAmount, 0);
  const commissionsPaid = periodJobs
    .filter((job) => job.checkAmount > 0 && job.payDate)
    .reduce((sum, job) => sum + job.checkAmount, 0);

  const designers = new Set(periodJobs.map((job) => job.designer));
  const syncLabel = new Date(syncedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const startingScope = !useStartingFallback
    ? period
    : ytdMargins.starting.length > 0
      ? "YtD fallback"
      : "All workbook";
  const currentScope = !useCurrentFallback
    ? period
    : ytdMargins.current.length > 0
      ? "YtD fallback"
      : "All workbook";

  return {
    sales,
    cashCollected,
    outstandingBalances,
    collectionRate,
    avgMarginStarting,
    avgMarginFinal,
    jobsBelowMarginGate,
    jobsMissingMargin,
    jobsWithSpiff,
    atRiskSales,
    commissionsOpen,
    commissionsPaid,
    activeJobs: periodJobs.length,
    designerCount: designers.size,
    marginSampleStarting: startingSource.length,
    marginSampleCurrent: currentSource.length,
    metricNotes: {
      sales: `${period} · dated jobs`,
      cashCollected: `${period} · sum of deposits`,
      outstanding: "Open book · contract − collected",
      collectionRate: `${period} cash ÷ sales`,
      avgMarginStarting:
        startingSource.length === 0
          ? "No margin % starting values readable yet"
          : `As sold · ${startingScope} · n=${startingSource.length}`,
      avgMarginFinal:
        currentSource.length === 0
          ? "No margin values readable yet"
          : `Best available (final→spiff→start) · ${currentScope} · n=${currentSource.length}`,
      belowGate: `Gate ${MARGIN_GATE}% · ${currentScope} · synced ${syncLabel}`,
      missingMargin: `${period} jobs with contract but no margin`,
      spiffJobs: `${period} rows with after-spiff fields`,
      atRiskSales: `Contract $ on below-gate jobs · ${currentScope}`,
      commissionsOpen: "Open book · CHECK with no pay date",
      commissionsPaid: `${period} paid checks`,
      activeJobs: `${designers.size} designers with dated jobs`,
    },
  };
}

function noteSignals(notes: string): string[] {
  const lower = notes.toLowerCase();
  const hits: string[] = [];
  if (/still owed|retention|will collect|balance owed|owed \$/.test(lower)) {
    hits.push("balance_note");
  }
  if (/pif|paid in full/.test(lower)) hits.push("pif");
  if (/approved by gavin|discount was approved|discount approved/.test(lower)) {
    hits.push("gavin_discount");
  }
  if (/missing|waiting|hold|no commission/.test(lower)) hits.push("ops_flag");
  return hits;
}

export function buildWorkbookAttention(jobs: PayrollJob[]): WorkbookAttentionItem[] {
  const items: WorkbookAttentionItem[] = [];
  const recentMs = Date.now() - 3 * 24 * 60 * 60 * 1000;

  for (const job of jobs) {
    if (job.rowType !== "job" && job.rowType !== "adjustment") continue;
    const signals = noteSignals(job.notes);

    if (job.belowGate) {
      const margin = bestMargin(job) ?? 0;
      items.push({
        id: `att-margin-${job.id}`,
        severity: "critical",
        title: `${job.client} · below ${MARGIN_GATE}% margin`,
        detail: `${job.designer} · margin ${margin}% (starting ${job.marginStarting ?? "—"}% / final ${job.marginFinal ?? "—"}%)`,
        owner: job.designer,
        amount: job.contract || null,
        action: "Review margin / spiff",
        todoLabel: `Review ${job.client} margin on ${job.tab}`,
        todoWhy: `Enforces the ${MARGIN_GATE}% gate before commissions/spiffs.`,
        defaultAssignee: "",
        notifyMessage: `${job.client} on ${job.tab} is at ${margin}% margin (gate ${MARGIN_GATE}%). Please review.`,
        context: job.notes || "Flagged from Payroll Workbook margin columns.",
      });
    }

    if (signals.includes("balance_note")) {
      items.push({
        id: `att-note-balance-${job.id}`,
        severity: "critical",
        title: `${job.client} · balance note`,
        detail: truncate(`${job.designer} · ${job.notes}`),
        owner: job.designer,
        amount: job.outstanding || job.checkAmount || null,
        action: "Follow up collection",
        todoLabel: `Follow up ${job.client} balance note`,
        todoWhy: "NOTES flagged money still owed or retention.",
        defaultAssignee: "",
        notifyMessage: `${job.client} (${job.designer}): ${truncate(job.notes, 200)}`,
        context: `Tab ${job.tab}. Outstanding math: ${job.outstanding}.`,
      });
    }

    if (job.outstanding > 0 && job.contract > 0 && job.collected / job.contract < 0.5) {
      items.push({
        id: `att-outstanding-${job.id}`,
        severity: "warning",
        title: `${job.client} · deposit incomplete`,
        detail: `${job.designer} · collected ${job.collected.toLocaleString()} of ${job.contract.toLocaleString()}`,
        owner: job.designer,
        amount: job.outstanding,
        action: "Collect remaining deposit",
        todoLabel: `Chase remaining deposit for ${job.client}`,
        todoWhy: "Contract largely uncollected on the workbook.",
        defaultAssignee: "",
        notifyMessage: `${job.client}: $${job.outstanding.toLocaleString()} still outstanding on a $${job.contract.toLocaleString()} contract.`,
        context: job.notes || `From ${job.tab}.`,
      });
    }

    if (job.commissionOpen && job.checkAmount >= 500) {
      items.push({
        id: `att-comm-${job.id}`,
        severity: "warning",
        title: `${job.client} · open commission`,
        detail: `${job.designer} · check $${job.checkAmount.toLocaleString()} · no pay date`,
        owner: job.designer,
        amount: job.checkAmount,
        action: "Confirm payroll timing",
        todoLabel: `Confirm commission pay date for ${job.client}`,
        todoWhy: "CHECK logged without PAY DATE.",
        defaultAssignee: "",
        notifyMessage: `${job.designer} has open commission $${job.checkAmount.toLocaleString()} on ${job.client} (no pay date).`,
        context: job.notes || `Tab ${job.tab}.`,
      });
    }

    if (signals.includes("gavin_discount")) {
      items.push({
        id: `att-discount-${job.id}`,
        severity: "info",
        title: `${job.client} · Gavin-approved discount`,
        detail: truncate(`${job.designer} · ${job.notes}`),
        owner: "Gavin",
        amount: job.contract || null,
        action: "Confirm margin still healthy",
        todoLabel: `Confirm ${job.client} discount still clears gate`,
        todoWhy: "Discount noted as approved — verify final margin.",
        defaultAssignee: "",
        notifyMessage: `${job.client} has a Gavin-approved discount note: ${truncate(job.notes, 160)}`,
        context: `Tab ${job.tab}.`,
      });
    }

    if (job.dateMs != null && job.dateMs >= recentMs && job.contract > 0) {
      items.push({
        id: `att-recent-${job.id}`,
        severity: "info",
        title: `New sale · ${job.client}`,
        detail: `${job.designer} · $${job.contract.toLocaleString()} · ${job.date}`,
        owner: job.designer,
        amount: job.contract,
        action: "Review new sale",
        todoLabel: `Review new ${job.client} entry on ${job.tab}`,
        todoWhy: "Recently dated sold job on the workbook.",
        defaultAssignee: "",
        notifyMessage: `New workbook sale: ${job.client} · $${job.contract.toLocaleString()} · ${job.designer}.`,
        context: job.notes || `Logged ${job.date}.`,
      });
    }
  }

  const severityRank: Record<AttentionSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  // De-dupe by title+designer, keep highest severity
  const deduped = new Map<string, WorkbookAttentionItem>();
  for (const item of items) {
    const key = `${item.title}|${item.owner}`;
    const existing = deduped.get(key);
    if (!existing || severityRank[item.severity] < severityRank[existing.severity]) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, MAX_ATTENTION);
}

export function buildDesignerSummaries(jobs: PayrollJob[]): DesignerSummary[] {
  const byDesigner = new Map<string, PayrollJob[]>();
  for (const job of jobs) {
    if (job.rowType !== "job") continue;
    const list = byDesigner.get(job.designer) ?? [];
    list.push(job);
    byDesigner.set(job.designer, list);
  }

  return [...byDesigner.entries()]
    .map(([designer, list]) => {
      const starting = list
        .map((job) => job.marginStarting)
        .filter((value): value is number => value != null);
      const finals = list
        .map((job) => job.marginFinal ?? job.marginAfterSpiff ?? job.marginStarting)
        .filter((value): value is number => value != null);

      return {
        designer,
        tab: list[0]?.tab ?? designer,
        jobCount: list.length,
        sales: list.reduce((sum, job) => sum + job.contract, 0),
        deposits: list.reduce((sum, job) => sum + job.collected, 0),
        outstanding: list.reduce((sum, job) => sum + job.outstanding, 0),
        avgMarginStarting: average(starting),
        avgMarginFinal: average(finals),
        belowGateCount: list.filter((job) => job.belowGate).length,
        commissionsOpen: list
          .filter((job) => job.commissionOpen)
          .reduce((sum, job) => sum + job.checkAmount, 0),
        commissionsPaid: list
          .filter((job) => job.checkAmount > 0 && job.payDate)
          .reduce((sum, job) => sum + job.checkAmount, 0),
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

export function buildWorkbookHub(
  snapshot: OperationsSnapshot,
  period: GavinPeriod,
): WorkbookHub {
  const jobs = parsePayrollJobsFromSnapshot(snapshot);
  return {
    source: "payroll_workbook",
    syncedAt: snapshot.syncedAt,
    period,
    tabCount: snapshot.tabs.length,
    jobCount: jobs.filter((job) => job.rowType === "job").length,
    pulse: buildWorkbookPulse(jobs, period, snapshot.syncedAt),
    attentionItems: buildWorkbookAttention(jobs),
    designers: buildDesignerSummaries(jobs),
  };
}

export function buildCubbyWorkbookContext(
  snapshot: OperationsSnapshot,
  period: GavinPeriod,
  question: string,
) {
  const jobs = parsePayrollJobsFromSnapshot(snapshot);
  const hub = buildWorkbookHub(snapshot, period);
  const normalized = question.toLowerCase();

  const designerHit = hub.designers.find((designer) =>
    normalized.includes(designer.designer.toLowerCase()) ||
    normalized.includes(designer.tab.toLowerCase()),
  );

  let scopedJobs = jobs.filter((job) => job.rowType === "job");
  const notes: string[] = [
    "Payroll Workbook = red 2026 designer tabs (source of truth for sales, deposits, margins, commissions).",
    `Synced ${snapshot.syncedAt}.`,
  ];

  if (designerHit) {
    scopedJobs = scopedJobs.filter((job) => job.designer === designerHit.designer);
    notes.push(`Focused on ${designerHit.designer} (${designerHit.tab}).`);
  } else {
    const tokens = normalized
      .split(/[^a-z0-9']+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4);

    const stop = new Set([
      "what",
      "when",
      "where",
      "this",
      "week",
      "month",
      "margin",
      "sales",
      "deposit",
      "commission",
      "outstanding",
      "show",
      "tell",
      "about",
      "workbook",
      "sheet",
      "gavin",
    ]);
    const needles = tokens.filter((token) => !stop.has(token));
    if (needles.length > 0) {
      const matched = scopedJobs.filter((job) =>
        needles.some(
          (needle) =>
            job.client.toLowerCase().includes(needle) ||
            job.notes.toLowerCase().includes(needle) ||
            job.designer.toLowerCase().includes(needle),
        ),
      );
      if (matched.length > 0) {
        scopedJobs = matched;
        notes.push(`Matched jobs for: ${needles.join(", ")}`);
      }
    }
  }

  if (/\b(below|under|gate|thin)\b/.test(normalized)) {
    scopedJobs = scopedJobs.filter((job) => job.belowGate);
    notes.push("Filtered to below-gate margin jobs.");
  }
  if (/\b(commission|unpaid check|open check)\b/.test(normalized)) {
    scopedJobs = scopedJobs.filter((job) => job.commissionOpen);
    notes.push("Filtered to open commissions.");
  }
  if (/\b(owed|outstanding|retention|collect)\b/.test(normalized)) {
    scopedJobs = scopedJobs.filter(
      (job) => job.outstanding > 0 || /owed|retention|collect/i.test(job.notes),
    );
    notes.push("Filtered to outstanding / collection notes.");
  }

  return {
    source: "payroll_workbook" as const,
    syncedAt: snapshot.syncedAt,
    period,
    pulse: hub.pulse,
    attentionItems: hub.attentionItems.slice(0, 12),
    designers: hub.designers.slice(0, 20),
    jobs: scopedJobs.slice(0, MAX_CUBBY_JOBS).map((job) => ({
      designer: job.designer,
      tab: job.tab,
      client: job.client,
      date: job.date,
      contract: job.contract,
      deposit: job.deposit,
      collected: job.collected,
      outstanding: job.outstanding,
      marginStarting: job.marginStarting,
      marginAfterSpiff: job.marginAfterSpiff,
      marginFinal: job.marginFinal,
      belowGate: job.belowGate,
      checkAmount: job.checkAmount,
      payDate: job.payDate,
      commissionOpen: job.commissionOpen,
      notes: truncate(job.notes),
    })),
    notes,
  };
}
