import { z } from "zod";

/**
 * Server-only configuration for the Meta Ads tab.
 * Missing values mean the feature is not connected. They must not crash the OS.
 * Never import this module from a client component.
 */

const optionalText = z.string().min(1).optional();

export const metaAdsEnvSchema = z.object({
  META_APP_ID: optionalText,
  META_APP_SECRET: optionalText,
  META_AD_ACCOUNT_ID: optionalText,
  META_SYSTEM_USER_TOKEN: optionalText,
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  /** Set when the Meta integration phase confirms the current Graph version. */
  META_GRAPH_API_VERSION: optionalText,
  OPENAI_API_KEY: optionalText,
  OPENAI_MODEL: optionalText,
  /** Used later to encrypt Meta tokens at rest. Tokens are never sent to the browser. */
  META_TOKEN_ENCRYPTION_KEY: optionalText,
});

export type MetaAdsEnv = z.infer<typeof metaAdsEnvSchema>;

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readMetaAdsEnv():
  | { ok: true; env: MetaAdsEnv }
  | { ok: false; issues: string[] } {
  const parsed = metaAdsEnvSchema.safeParse({
    META_APP_ID: blankToUndefined(process.env.META_APP_ID),
    META_APP_SECRET: blankToUndefined(process.env.META_APP_SECRET),
    META_AD_ACCOUNT_ID: blankToUndefined(process.env.META_AD_ACCOUNT_ID),
    META_SYSTEM_USER_TOKEN: blankToUndefined(process.env.META_SYSTEM_USER_TOKEN),
    META_OAUTH_REDIRECT_URI: blankToUndefined(process.env.META_OAUTH_REDIRECT_URI),
    META_GRAPH_API_VERSION: blankToUndefined(process.env.META_GRAPH_API_VERSION),
    OPENAI_API_KEY: blankToUndefined(process.env.OPENAI_API_KEY),
    OPENAI_MODEL: blankToUndefined(process.env.OPENAI_MODEL),
    META_TOKEN_ENCRYPTION_KEY: blankToUndefined(process.env.META_TOKEN_ENCRYPTION_KEY),
  });

  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }

  return { ok: true, env: parsed.data };
}

export function isMetaAdsOauthConfigured(): boolean {
  const result = readMetaAdsEnv();
  if (!result.ok) return false;
  return Boolean(
    result.env.META_APP_ID &&
      result.env.META_APP_SECRET &&
      result.env.META_OAUTH_REDIRECT_URI,
  );
}

/** Read-only Marketing API access. Graph version was checked against Meta's changelog: v26.0. */
export function readMetaAdsCredentials():
  | {
      ok: true;
      accountId: string;
      token: string;
      appSecret: string;
      graphVersion: string;
    }
  | { ok: false; reason: string } {
  const result = readMetaAdsEnv();
  if (!result.ok) return { ok: false, reason: result.issues.join("; ") };
  const { META_AD_ACCOUNT_ID, META_SYSTEM_USER_TOKEN, META_APP_SECRET, META_GRAPH_API_VERSION } = result.env;
  if (!META_AD_ACCOUNT_ID || !META_SYSTEM_USER_TOKEN || !META_APP_SECRET) {
    return { ok: false, reason: "Meta account id, system user token, and app secret are required." };
  }
  const accountId = META_AD_ACCOUNT_ID.startsWith("act_")
    ? META_AD_ACCOUNT_ID
    : `act_${META_AD_ACCOUNT_ID}`;
  return {
    ok: true,
    accountId,
    token: META_SYSTEM_USER_TOKEN,
    appSecret: META_APP_SECRET,
    graphVersion: META_GRAPH_API_VERSION ?? "v26.0",
  };
}

export function isMetaAdsAnalystConfigured(): boolean {
  return readOpenAiAnalystConfig().ok;
}

export function readOpenAiAnalystConfig():
  | { ok: true; apiKey: string; model: string }
  | { ok: false; reason: string } {
  const result = readMetaAdsEnv();
  if (!result.ok) return { ok: false, reason: result.issues.join("; ") };
  if (!result.env.OPENAI_API_KEY) return { ok: false, reason: "OpenAI key is missing." };
  return {
    ok: true,
    apiKey: result.env.OPENAI_API_KEY,
    model: result.env.OPENAI_MODEL ?? "gpt-5.6-luna",
  };
}
