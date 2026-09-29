import crypto from "node:crypto";
import { readMetaAdsCredentials } from "@/lib/meta-ads/env";

/**
 * Read-only Graph client. Marketing API v26.0 is the current version
 * as of Meta's July 29, 2026 changelog. No write endpoints exist here.
 */

type GraphPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string };
};

export async function graphGetAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const creds = readMetaAdsCredentials();
  if (!creds.ok) throw new Error(creds.reason);

  const proof = crypto.createHmac("sha256", creds.appSecret).update(creds.token).digest("hex");
  const url = new URL(`https://graph.facebook.com/${creds.graphVersion}/${path}`);
  url.searchParams.set("access_token", creds.token);
  url.searchParams.set("appsecret_proof", proof);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const rows: T[] = [];
  let next: string | null = url.toString();
  while (next) {
    const response = await fetch(next);
    const body = (await response.json()) as GraphPage<T>;
    if (body.error?.message) throw new Error(body.error.message);
    rows.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return rows;
}

export async function graphGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const creds = readMetaAdsCredentials();
  if (!creds.ok) throw new Error(creds.reason);
  const proof = crypto.createHmac("sha256", creds.appSecret).update(creds.token).digest("hex");
  const url = new URL(`https://graph.facebook.com/${creds.graphVersion}/${path}`);
  url.searchParams.set("access_token", creds.token);
  url.searchParams.set("appsecret_proof", proof);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (body.error?.message) throw new Error(body.error.message);
  return body;
}
