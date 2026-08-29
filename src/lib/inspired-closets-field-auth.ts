import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { NextResponse } from "next/server";

const scrypt = promisify(scryptCb);

export const IC_FIELD_SESSION_COOKIE = "ic-field-session";

export type FieldInstaller = {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  title: string | null;
};

const SESSION_DAYS = 30;

function sessionSecret(): string {
  return (
    process.env.IC_FIELD_SESSION_SECRET?.trim() ||
    process.env.INSPIRED_CLOSETS_PROTOTYPE_PASSWORD?.trim() ||
    "inspired-closets-field-dev"
  );
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length > 10 && digits.startsWith("1")) return digits.slice(-10);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhone(a ?? "");
  const right = normalizePhone(b ?? "");
  if (!left || !right) return false;
  if (left === right) return true;
  return left.slice(-10) === right.slice(-10) && left.slice(-10).length === 10;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored?.startsWith("scrypt:")) return false;
  const [, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const key = (await scrypt(password, salt, 32)) as Buffer;
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createFieldSessionToken(staffId: string): string {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ sid: staffId, exp }), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function readFieldSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = signPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sid?: string;
      exp?: number;
    };
    if (!data.sid || !data.exp || data.exp < Date.now()) return null;
    return data.sid;
  } catch {
    return null;
  }
}

export function createActionToken(kind: string, id: string, decision: string): string {
  const exp = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ kind, id, decision, exp }), "utf8").toString(
    "base64url",
  );
  return `${payload}.${signPayload(payload)}`;
}

export function readActionToken(token: string | undefined): {
  kind: string;
  id: string;
  decision: string;
} | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = signPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      kind?: string;
      id?: string;
      decision?: string;
      exp?: number;
    };
    if (!data.kind || !data.id || !data.decision || !data.exp || data.exp < Date.now()) return null;
    return { kind: data.kind, id: data.id, decision: data.decision };
  } catch {
    return null;
  }
}

const COOKIE_BASE = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export function applyFieldSession(
  response: NextResponse,
  installer: FieldInstaller,
): NextResponse {
  response.cookies.set(IC_FIELD_SESSION_COOKIE, createFieldSessionToken(installer.id), {
    ...COOKIE_BASE,
    httpOnly: true,
  });
  return response;
}

export function clearFieldSession(response: NextResponse): NextResponse {
  const gone = { ...COOKIE_BASE, maxAge: 0 };
  response.cookies.set(IC_FIELD_SESSION_COOKIE, "", { ...gone, httpOnly: true });
  return response;
}
