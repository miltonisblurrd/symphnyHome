export const INSPIRED_CLOSETS_ACCESS_COOKIE = "ic-prototype-access";
export const INSPIRED_CLOSETS_ACCESS_PATH = "/";

const PROTECTED_PAGE_PREFIXES = ["/ops", "/designers", "/gavin"] as const;

/** Installer app pages. These use phone + password, not the office access page. */
export function isInstallerAppPath(pathname: string): boolean {
  return (
    pathname === "/installers" ||
    pathname.startsWith("/installers/") ||
    pathname === "/field" ||
    pathname.startsWith("/field/")
  );
}

function isInstallerFieldApiPath(pathname: string): boolean {
  return pathname === "/api/inspired-closets/field" || pathname.startsWith("/api/inspired-closets/field/");
}

/**
 * If an installer link was rewritten to the office access page, send them back
 * to the installer app. Rejects anything that is not that app path.
 */
export function installerAppReturnPath(returnTo: string | null | undefined): string | null {
  if (
    !returnTo ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\") ||
    returnTo.includes("..")
  ) {
    return null;
  }
  const path = returnTo.split("?")[0]?.split("#")[0] ?? "";
  if (!isInstallerAppPath(path)) return null;
  return returnTo;
}

export function isInspiredClosetsProtectedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/access") return false;
  if (pathname === "/site" || pathname.startsWith("/site/")) return false;
  if (
    pathname === "/opengraph-image" ||
    pathname.startsWith("/opengraph-image") ||
    pathname === "/twitter-image" ||
    pathname.startsWith("/twitter-image")
  ) {
    return false;
  }
  if (
    PROTECTED_PAGE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  if (pathname.startsWith("/api/inspired-closets/")) {
    if (pathname === "/api/inspired-closets/ops/cron/meta-ads") return false;
    if (pathname.startsWith("/api/inspired-closets/access")) return false;
    if (pathname.startsWith("/api/inspired-closets/site")) return false;
    if (pathname.startsWith("/api/inspired-closets/inbound")) return false;
    if (isInstallerFieldApiPath(pathname)) return false;
    return true;
  }

  if (pathname.startsWith("/api/integrations/quickbooks/")) {
    if (pathname === "/api/integrations/quickbooks/callback") return false;
    return true;
  }

  return false;
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
