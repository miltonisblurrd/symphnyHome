import { createSign } from "crypto";
import {
  filterDefaultSyncTabs,
  reparseTabWithDetectedHeaders,
} from "@/lib/inspired-closets-payroll-workbook";

export type GoogleSheetsConfig = {
  spreadsheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
  tabNames: string[];
};

export type OperationsSheetRow = Record<string, string>;

export type OperationsSnapshot = {
  source: "google_sheets";
  spreadsheetId: string;
  tabs: Array<{
    name: string;
    headers: string[];
    rowCount: number;
    rows: OperationsSheetRow[];
  }>;
  syncedAt: string;
};

type CachedSnapshot = {
  snapshot: OperationsSnapshot;
  fetchedAt: number;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ROWS_PER_TAB = 1000;

let snapshotCache: CachedSnapshot | null = null;

function base64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64url");
}

function normalizeSpreadsheetId(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? trimmed;
}

function normalizePrivateKey(value: string): string {
  let key = value.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

export function getGoogleSheetsConfig(): GoogleSheetsConfig | null {
  const spreadsheetIdRaw = process.env.INSPIRED_CLOSETS_GOOGLE_SHEETS_ID?.trim();
  const serviceAccountEmail = process.env.INSPIRED_CLOSETS_GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyRaw = process.env.INSPIRED_CLOSETS_GOOGLE_PRIVATE_KEY?.trim();

  if (!spreadsheetIdRaw || !serviceAccountEmail || !privateKeyRaw) return null;

  const tabNames =
    process.env.INSPIRED_CLOSETS_GOOGLE_SHEET_TABS?.split(",")
      .map((tab) => tab.trim())
      .filter(Boolean) ?? [];

  return {
    spreadsheetId: normalizeSpreadsheetId(spreadsheetIdRaw),
    serviceAccountEmail,
    privateKey: normalizePrivateKey(privateKeyRaw),
    tabNames,
  };
}

export type OperationsSnapshotProbe = {
  configured: boolean;
  spreadsheetId: string | null;
  serviceAccountEmail: string | null;
  availableTabs: string[];
  ok: boolean;
  syncedAt: string | null;
  tabCount: number;
  rowCount: number;
  error: string | null;
};

async function getGoogleAccessToken(config: GoogleSheetsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: config.serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(config.privateKey, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google token exchange failed: ${detail}`);
  }

  const payloadJson = (await response.json()) as { access_token?: string };
  if (!payloadJson.access_token) {
    throw new Error("Google token exchange returned no access token.");
  }

  return payloadJson.access_token;
}

async function listSheetTabNames(
  spreadsheetId: string,
  accessToken: string,
): Promise<string[]> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets metadata failed: ${detail}`);
  }

  const payload = (await response.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };

  return (payload.sheets ?? [])
    .map((sheet) => sheet.properties?.title?.trim())
    .filter((title): title is string => Boolean(title));
}

function sheetDataRange(tabName: string): string {
  const trimmed = tabName.trim();
  const needsQuotes = /[^A-Za-z0-9_]/.test(trimmed);
  const escaped = trimmed.replace(/'/g, "''");
  const sheetRef = needsQuotes ? `'${escaped}'` : escaped;
  return `${sheetRef}!A1:ZZ${MAX_ROWS_PER_TAB}`;
}

async function fetchTabValuesSingle(
  spreadsheetId: string,
  tabName: string,
  accessToken: string,
): Promise<string[][]> {
  const range = encodeURIComponent(sheetDataRange(tabName));
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets read failed for tab "${tabName}": ${detail}`);
  }

  const payload = (await response.json()) as { values?: string[][] };
  return payload.values ?? [];
}

async function fetchTabValuesBatch(
  spreadsheetId: string,
  tabNames: string[],
  accessToken: string,
): Promise<Array<{ name: string; values: string[][] }>> {
  if (tabNames.length === 0) return [];

  const params = new URLSearchParams();
  for (const tabName of tabNames) {
    params.append("ranges", sheetDataRange(tabName));
  }
  params.set("majorDimension", "ROWS");
  params.set("valueRenderOption", "FORMATTED_VALUE");

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    const batchError = await response.text();
    const results: Array<{ name: string; values: string[][] }> = [];
    const errors: string[] = [];

    for (const tabName of tabNames) {
      try {
        const values = await fetchTabValuesSingle(spreadsheetId, tabName, accessToken);
        results.push({ name: tabName, values });
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : `Failed to read tab "${tabName}".`,
        );
      }
    }

    if (results.length === 0) {
      throw new Error(
        errors[0] ?? `Google Sheets batch read failed: ${batchError}`,
      );
    }

    return results;
  }

  const payload = (await response.json()) as {
    valueRanges?: Array<{ range?: string; values?: string[][] }>;
  };

  return (payload.valueRanges ?? []).map((entry, index) => ({
    name: tabNames[index] ?? entry.range ?? `tab_${index + 1}`,
    values: entry.values ?? [],
  }));
}

export async function fetchOperationsSnapshot(
  options: { forceRefresh?: boolean } = {},
): Promise<OperationsSnapshot | null> {
  const config = getGoogleSheetsConfig();
  if (!config) return null;

  if (
    !options.forceRefresh &&
    snapshotCache &&
    Date.now() - snapshotCache.fetchedAt < CACHE_TTL_MS
  ) {
    return snapshotCache.snapshot;
  }

  const accessToken = await getGoogleAccessToken(config);
  const tabNames =
    config.tabNames.length > 0
      ? config.tabNames
      : filterDefaultSyncTabs(await listSheetTabNames(config.spreadsheetId, accessToken));

  if (tabNames.length === 0) {
    throw new Error("No Google Sheet tabs found to sync.");
  }

  // Batch in chunks to stay under Sheets API URL/range limits
  const chunkSize = 8;
  const batchedTabs: Array<{ name: string; values: string[][] }> = [];
  for (let i = 0; i < tabNames.length; i += chunkSize) {
    const chunk = tabNames.slice(i, i + chunkSize);
    const part = await fetchTabValuesBatch(config.spreadsheetId, chunk, accessToken);
    batchedTabs.push(...part);
  }

  const tabs = batchedTabs.map(({ name, values }) => {
    const parsed = reparseTabWithDetectedHeaders(name, values);
    return {
      name,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      rows: parsed.rows,
    };
  });

  const snapshot: OperationsSnapshot = {
    source: "google_sheets",
    spreadsheetId: config.spreadsheetId,
    tabs,
    syncedAt: new Date().toISOString(),
  };

  snapshotCache = { snapshot, fetchedAt: Date.now() };
  return snapshot;
}

export async function probeOperationsSnapshot(): Promise<OperationsSnapshotProbe> {
  const config = getGoogleSheetsConfig();
  if (!config) {
    return {
      configured: false,
      spreadsheetId: null,
      serviceAccountEmail: null,
      availableTabs: [],
      ok: false,
      syncedAt: null,
      tabCount: 0,
      rowCount: 0,
      error: "Missing Google Sheets env vars.",
    };
  }

  let availableTabs: string[] = [];
  try {
    const accessToken = await getGoogleAccessToken(config);
    availableTabs = await listSheetTabNames(config.spreadsheetId, accessToken);
  } catch {
    availableTabs = config.tabNames;
  }

  try {
    const snapshot = await fetchOperationsSnapshot({ forceRefresh: true });
    if (!snapshot) {
      return {
        configured: true,
        spreadsheetId: config.spreadsheetId,
        serviceAccountEmail: config.serviceAccountEmail,
        availableTabs,
        ok: false,
        syncedAt: null,
        tabCount: 0,
        rowCount: 0,
        error: "Snapshot returned empty.",
      };
    }

    return {
      configured: true,
      spreadsheetId: config.spreadsheetId,
      serviceAccountEmail: config.serviceAccountEmail,
      availableTabs,
      ok: true,
      syncedAt: snapshot.syncedAt,
      tabCount: snapshot.tabs.length,
      rowCount: snapshot.tabs.reduce((sum, tab) => sum + tab.rowCount, 0),
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      spreadsheetId: config.spreadsheetId,
      serviceAccountEmail: config.serviceAccountEmail,
      availableTabs,
      ok: false,
      syncedAt: null,
      tabCount: 0,
      rowCount: 0,
      error: error instanceof Error ? error.message : "Google Sheets sync failed.",
    };
  }
}
