export const INSPIRED_CLOSETS_ACCESS_COOKIE = "ic-prototype-access";
export const INSPIRED_CLOSETS_PROTECTED_PREFIX = "/inspired-closets";
export const INSPIRED_CLOSETS_ACCESS_PATH = "/inspired-closets/access";

/** Installer app pages. These use phone + password, not the office access page. */
export function isInstallerAppPath(pathname: string): boolean {
  return (
    pathname === "/inspired-closets/installers" ||
    pathname.startsWith("/inspired-closets/installers/") ||
    pathname === "/inspired-closets/field" ||
    pathname.startsWith("/inspired-closets/field/")
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
  if (pathname.startsWith(INSPIRED_CLOSETS_PROTECTED_PREFIX)) {
    if (pathname === INSPIRED_CLOSETS_ACCESS_PATH) return false;
    // Customer-site form replicas — public so the walkthrough can start like a real lead.
    if (pathname === "/inspired-closets/site" || pathname.startsWith("/inspired-closets/site/")) {
      return false;
    }
    // Installers sign in on their own screen. The office gate was bouncing that URL.
    if (isInstallerAppPath(pathname)) return false;
    // Link previews fetch these. The office gate was serving the Symphony image instead.
    if (
      pathname === "/inspired-closets/opengraph-image" ||
      pathname.startsWith("/inspired-closets/opengraph-image") ||
      pathname === "/inspired-closets/twitter-image" ||
      pathname.startsWith("/inspired-closets/twitter-image")
    ) {
      return false;
    }
    return true;
  }

  if (pathname.startsWith("/api/inspired-closets/")) {
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
