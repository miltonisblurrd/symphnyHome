import type { OperationsSheetRow, OperationsSnapshot } from "@/lib/inspired-closets-google-sheets";

/** Master client list tab — all current clients for Las Vegas ops. */
export const PRIMARY_OPS_TAB = "REB 26";

const MAX_ROWS_IN_CONTEXT = 120;
const MAX_CELL_LENGTH = 160;

export type CubbyOperationsContext = {
  source: "google_sheets";
  syncedAt: string;
  spreadsheetId: string;
  tab: string;
  description: string;
  rowCount: number;
  headers: string[];
  rows: OperationsSheetRow[];
  notes: string[];
};

function truncateCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_CELL_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_CELL_LENGTH - 1)}…`;
}

function sanitizeRow(row: OperationsSheetRow): OperationsSheetRow {
  const sanitized: OperationsSheetRow = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = truncateCell(value);
  }
  return sanitized;
}

function findPrimaryTab(snapshot: OperationsSnapshot) {
  return snapshot.tabs.find((tab) => tab.name.trim().toUpperCase() === PRIMARY_OPS_TAB.toUpperCase());
}

function filterRowsForQuestion(rows: OperationsSheetRow[], question: string): OperationsSheetRow[] {
  const normalized = question.toLowerCase();
  const stopWords = new Set([
    "what",
    "when",
    "where",
    "who",
    "how",
    "this",
    "week",
    "sheet",
    "client",
    "clients",
    "current",
    "list",
    "gavin",
    "craig",
    "reb",
    "rebekah",
    "tell",
    "about",
    "show",
    "many",
    "there",
  ]);

  const tokens = normalized
    .split(/[^a-z0-9']+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token));

  if (tokens.length === 0) return rows;

  const matched = rows.filter((row) =>
    tokens.some((token) =>
      Object.values(row).some((value) => value.toLowerCase().includes(token)),
    ),
  );

  return matched.length > 0 ? matched : rows;
}

export function filterDefaultSyncTabs(tabNames: string[]): string[] {
  const primary = tabNames.find(
    (name) => name.trim().toUpperCase() === PRIMARY_OPS_TAB.toUpperCase(),
  );
  if (primary) return [primary];

  const rebTab = tabNames.find((name) => /^REB\b/i.test(name.trim()));
  return rebTab ? [rebTab] : tabNames.slice(0, 1);
}

export function buildCubbyOperationsContext(
  snapshot: OperationsSnapshot,
  question: string,
): CubbyOperationsContext | null {
  const tab = findPrimaryTab(snapshot);
  if (!tab) {
    return null;
  }

  const filteredRows = filterRowsForQuestion(tab.rows, question);
  const rows = filteredRows.slice(0, MAX_ROWS_IN_CONTEXT).map(sanitizeRow);
  const truncated = filteredRows.length > MAX_ROWS_IN_CONTEXT;

  return {
    source: "google_sheets",
    syncedAt: snapshot.syncedAt,
    spreadsheetId: snapshot.spreadsheetId,
    tab: tab.name,
    description: "Master current client list for Inspired Closets Las Vegas.",
    rowCount: tab.rowCount,
    headers: tab.headers,
    rows,
    notes: [
      truncated
        ? `Showing first ${MAX_ROWS_IN_CONTEXT} of ${filteredRows.length} matching rows from ${tab.name}.`
        : `Showing ${rows.length} rows from ${tab.name}.`,
    ],
  };
}
