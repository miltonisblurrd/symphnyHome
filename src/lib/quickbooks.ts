import { cookies } from "next/headers";

export type QuickBooksEnvironment = "sandbox" | "production";

export const QB_REALM_ID_COOKIE = "ic-qb-realm-id";
export const QB_REFRESH_TOKEN_COOKIE = "ic-qb-refresh-token";
export const QB_OAUTH_STATE_COOKIE = "ic-qb-oauth-state";

const SCOPES = ["com.intuit.quickbooks.accounting"].join(" ");

export type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QuickBooksEnvironment;
};

export type QuickBooksTokens = {
  realmId: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
};

export type QuickBooksFinancialPulse = {
  sales: number;
  cashCollected: number;
  outstandingBalances: number;
  avgMargin: number;
  unverifiedCosts: number;
  jobsBelowMarginGate: number;
  bankBalance: number;
  spiffsPending: number;
  source: "quickbooks" | "demo";
  companyName?: string;
};

export function getQuickBooksConfig(): QuickBooksConfig | null {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.QUICKBOOKS_REDIRECT_URI?.trim() ||
    `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/integrations/quickbooks/callback`;
  const environment =
    process.env.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox";

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret, redirectUri, environment };
}

export async function getQuickBooksTokens(): Promise<QuickBooksTokens | null> {
  const envRealmId = process.env.QUICKBOOKS_REALM_ID?.trim();
  const envRefreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN?.trim();
  if (envRealmId && envRefreshToken) {
    return { realmId: envRealmId, refreshToken: envRefreshToken };
  }

  const jar = await cookies();
  const realmId = jar.get(QB_REALM_ID_COOKIE)?.value;
  const refreshToken = jar.get(QB_REFRESH_TOKEN_COOKIE)?.value;
  if (!realmId || !refreshToken) return null;

  return { realmId, refreshToken };
}

export function getQuickBooksApiBase(environment: QuickBooksEnvironment): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function buildQuickBooksAuthorizeUrl(config: QuickBooksConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

async function quickBooksTokenRequest(
  config: QuickBooksConfig,
  body: URLSearchParams,
): Promise<{ access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in?: number }> {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`QuickBooks token exchange failed: ${response.status} ${detail}`);
  }

  return response.json();
}

export async function exchangeQuickBooksCode(
  config: QuickBooksConfig,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const payload = await quickBooksTokenRequest(config, body);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
  };
}

export async function refreshQuickBooksAccessToken(
  config: QuickBooksConfig,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const payload = await quickBooksTokenRequest(config, body);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
  };
}

export async function getQuickBooksAccessToken(): Promise<{
  accessToken: string;
  realmId: string;
  refreshToken: string;
  config: QuickBooksConfig;
} | null> {
  const config = getQuickBooksConfig();
  const tokens = await getQuickBooksTokens();
  if (!config || !tokens) return null;

  const refreshed = await refreshQuickBooksAccessToken(config, tokens.refreshToken);
  return {
    accessToken: refreshed.accessToken,
    realmId: tokens.realmId,
    refreshToken: refreshed.refreshToken,
    config,
  };
}

type QboQueryResponse<T> = {
  QueryResponse?: T & { totalCount?: number };
};

async function qboQuery<T>(accessToken: string, config: QuickBooksConfig, realmId: string, sql: string): Promise<T | null> {
  const base = getQuickBooksApiBase(config.environment);
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=70`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`QuickBooks query failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as QboQueryResponse<T>;
  return payload.QueryResponse ?? null;
}

function periodStartDate(period: string): string {
  const now = new Date();
  if (period === "This week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    now.setDate(now.getDate() - diff);
  } else if (period === "This month") {
    now.setDate(1);
  } else if (period === "This quarter") {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3;
    now.setMonth(quarterStart, 1);
  } else {
    now.setMonth(0, 1);
  }
  return now.toISOString().slice(0, 10);
}

function sumField<T>(rows: T[] | undefined, field: keyof T): number {
  if (!rows?.length) return 0;
  return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

export async function fetchQuickBooksFinancialPulse(period = "This week"): Promise<QuickBooksFinancialPulse | null> {
  const session = await getQuickBooksAccessToken();
  if (!session) return null;

  const { accessToken, realmId, config } = session;
  const startDate = periodStartDate(period);

  const [companyInfo, openInvoices, periodInvoices, payments, bankAccounts, openBills] =
    await Promise.all([
      qboQuery<{ CompanyInfo?: Array<{ CompanyName?: string }> }>(
        accessToken,
        config,
        realmId,
        "select * from CompanyInfo",
      ),
      qboQuery<{ Invoice?: Array<{ Balance: number }> }>(
        accessToken,
        config,
        realmId,
        "select Balance from Invoice where Balance > '0'",
      ),
      qboQuery<{ Invoice?: Array<{ TotalAmt: number }> }>(
        accessToken,
        config,
        realmId,
        `select TotalAmt from Invoice where TxnDate >= '${startDate}'`,
      ),
      qboQuery<{ Payment?: Array<{ TotalAmt: number }> }>(
        accessToken,
        config,
        realmId,
        `select TotalAmt from Payment where TxnDate >= '${startDate}'`,
      ),
      qboQuery<{ Account?: Array<{ CurrentBalance: number }> }>(
        accessToken,
        config,
        realmId,
        "select CurrentBalance from Account where AccountType = 'Bank'",
      ),
      qboQuery<{ Bill?: Array<{ Balance: number }> }>(
        accessToken,
        config,
        realmId,
        "select Balance from Bill where Balance > '0'",
      ),
    ]);

  const outstandingBalances = sumField(openInvoices?.Invoice, "Balance");
  const sales = sumField(periodInvoices?.Invoice, "TotalAmt");
  const cashCollected = sumField(payments?.Payment, "TotalAmt");
  const bankBalance = sumField(bankAccounts?.Account, "CurrentBalance");
  const unverifiedCosts = sumField(openBills?.Bill, "Balance");

  return {
    sales,
    cashCollected,
    outstandingBalances,
    avgMargin: 0,
    unverifiedCosts,
    jobsBelowMarginGate: 0,
    bankBalance,
    spiffsPending: 0,
    source: "quickbooks",
    companyName: companyInfo?.CompanyInfo?.[0]?.CompanyName,
  };
}

export function renderQuickBooksConnectedPage(input: {
  realmId: string;
  refreshToken: string;
  environment: QuickBooksEnvironment;
}): string {
  return renderQuickBooksCallbackPage({
    title: `QuickBooks connected (${input.environment})`,
    message:
      "Sandbox OAuth succeeded. Paste the values below into your <code>.env</code> (local) or Vercel environment variables, then restart/redeploy.",
    preContent: `QUICKBOOKS_REALM_ID=${input.realmId}\nQUICKBOOKS_REFRESH_TOKEN=${input.refreshToken}\nQUICKBOOKS_ENVIRONMENT=${input.environment}`,
    linkHref: "/inspired-closets/gavin",
    linkLabel: "Back to Gavin dashboard",
  });
}

export function renderQuickBooksCallbackPage(input: {
  title: string;
  message: string;
  preContent?: string;
  linkHref?: string;
  linkLabel?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${input.title}</title>
  <style>
    body { font-family: Lato, system-ui, sans-serif; background: #efe9e5; color: #000000; padding: 1.5rem; }
    .card { max-width: 40rem; margin: 0 auto; background: #ffffff; border: 1px solid rgba(0,0,0,0.1); border-radius: 1rem; padding: 1.5rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
    p { color: rgba(0,0,0,0.55); line-height: 1.5; }
    pre { background: #fdeae6; border: 1px solid rgba(0,0,0,0.1); border-radius: 0.75rem; padding: 1rem; overflow: auto; font-size: 0.82rem; white-space: pre-wrap; }
    a { color: #821f2d; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${input.title}</h1>
    <p>${input.message}</p>
    ${input.preContent ? `<pre>${input.preContent}</pre>` : ""}
    ${input.linkHref ? `<p><a href="${input.linkHref}">${input.linkLabel ?? "Continue"}</a></p>` : ""}
  </div>
</body>
</html>`;
}
