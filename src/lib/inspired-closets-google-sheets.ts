import { createSign } from "crypto";

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
const MAX_ROWS_PER_TAB = 500;

let snapshotCache: CachedSnapshot | null = null;

function base64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64url");
}

export function getGoogleSheetsConfig(): GoogleSheetsConfig | null {
  const spreadsheetId = process.env.INSPIRED_CLOSETS_GOOGLE_SHEETS_ID?.trim();
  const serviceAccountEmail = process.env.INSPIRED_CLOSETS_GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyRaw = process.env.INSPIRED_CLOSETS_GOOGLE_PRIVATE_KEY?.trim();

  if (!spreadsheetId || !serviceAccountEmail || !privateKeyRaw) return null;

  const tabNames =
    process.env.INSPIRED_CLOSETS_GOOGLE_SHEET_TABS?.split(",")
      .map((tab) => tab.trim())
      .filter(Boolean) ?? [];

  return {
    spreadsheetId,
    serviceAccountEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    tabNames,
  };
}

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

function normalizeHeader(value: string, index: number): string {
  const trimmed = value.trim();
  return trimmed || `column_${index + 1}`;
}

function parseSheetValues(values: string[][]): { headers: string[]; rows: OperationsSheetRow[] } {
  if (values.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = values[0].map(normalizeHeader);
  const rows: OperationsSheetRow[] = [];

  for (const rawRow of values.slice(1, MAX_ROWS_PER_TAB + 1)) {
    if (!rawRow.some((cell) => cell.trim())) continue;

    const row: OperationsSheetRow = {};
    headers.forEach((header, index) => {
      row[header] = rawRow[index]?.trim() ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

async function fetchTabValues(
  spreadsheetId: string,
  tabName: string,
  accessToken: string,
): Promise<string[][]> {
  const range = encodeURIComponent(tabName);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
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
    config.tabNames.length > 0 ? config.tabNames : await listSheetTabNames(config.spreadsheetId, accessToken);

  if (tabNames.length === 0) {
    throw new Error("No Google Sheet tabs found to sync.");
  }

  const tabs = await Promise.all(
    tabNames.map(async (name) => {
      const values = await fetchTabValues(config.spreadsheetId, name, accessToken);
      const parsed = parseSheetValues(values);
      return {
        name,
        headers: parsed.headers,
        rowCount: parsed.rows.length,
        rows: parsed.rows,
      };
    }),
  );

  const snapshot: OperationsSnapshot = {
    source: "google_sheets",
    spreadsheetId: config.spreadsheetId,
    tabs,
    syncedAt: new Date().toISOString(),
  };

  snapshotCache = { snapshot, fetchedAt: Date.now() };
  return snapshot;
}
