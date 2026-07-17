export const INSPIRED_CLOSETS_ACCESS_COOKIE = "ic-prototype-access";
export const INSPIRED_CLOSETS_PROTECTED_PREFIX = "/inspired-closets";
export const INSPIRED_CLOSETS_ACCESS_PATH = "/inspired-closets/access";

export function isInspiredClosetsProtectedPath(pathname: string): boolean {
  if (!pathname.startsWith(INSPIRED_CLOSETS_PROTECTED_PREFIX)) return false;
  if (pathname === INSPIRED_CLOSETS_ACCESS_PATH) return false;
  if (pathname.startsWith("/api/inspired-closets/access")) return false;
  return true;
}

export function getInspiredClosetsPassword(): string | undefined {
  return process.env.INSPIRED_CLOSETS_PROTOTYPE_PASSWORD?.trim() || undefined;
}

export async function getExpectedInspiredClosetsAccessToken(): Promise<string | null> {
  const password = getInspiredClosetsPassword();
  if (!password) return null;

  const data = new TextEncoder().encode(`inspired-closets:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createInspiredClosetsAccessToken(
  password: string,
): Promise<string | null> {
  const expected = getInspiredClosetsPassword();
  if (!expected || password !== expected) return null;
  return getExpectedInspiredClosetsAccessToken();
}

export function isInspiredClosetsAccessEnabled(): boolean {
  return Boolean(getInspiredClosetsPassword());
}
