/**
 * Role-based ops access for Inspired Closets OS.
 * Inventory (Frank) is scoped to Inventory + Receiving; other roles keep full access.
 */

export const IC_INVENTORY_HOME = "/inspired-closets/ops/inventory";

/** Page prefixes the inventory role may open. Receiving lives under inventory. */
export const INVENTORY_PAGE_PREFIXES = [
  "/inspired-closets/ops/inventory",
] as const;

/**
 * API path prefixes inventory may call.
 * Jobs + stow-orders are supporting reads used by Inventory/Receiving screens.
 */
export const INVENTORY_API_PREFIXES = [
  "/api/inspired-closets/ops/inventory",
  "/api/inspired-closets/ops/receiving",
  "/api/inspired-closets/ops/jobs",
  "/api/inspired-closets/ops/stow-orders",
  "/api/inspired-closets/ops/session",
] as const;

/** Nav hrefs visible to inventory (exact match against OpsShell items). */
export const INVENTORY_NAV_HREFS = new Set([
  "/inspired-closets/ops/inventory",
  "/inspired-closets/ops/inventory/receiving",
]);

export function isInventoryRole(role: string | null | undefined): boolean {
  return role === "inventory";
}

export function roleHomePath(role: string | null | undefined): string {
  if (isInventoryRole(role)) return IC_INVENTORY_HOME;
  return "/inspired-closets/gavin";
}

export function canAccessOpsPage(
  role: string | null | undefined,
  pathname: string,
): boolean {
  if (!isInventoryRole(role)) return true;
  return INVENTORY_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function canAccessOpsApi(
  role: string | null | undefined,
  pathname: string,
): boolean {
  if (!isInventoryRole(role)) return true;
  return INVENTORY_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function filterNavHrefForRole(
  role: string | null | undefined,
  href: string,
): boolean {
  if (!isInventoryRole(role)) return true;
  return INVENTORY_NAV_HREFS.has(href);
}

/** Normalize office login identifier (email, username, or name). */
export function normalizeOfficeLoginId(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Match staff by email, email local-part, or full name.
 * Username "frank" matches email "frank@…" or name "Frank".
 */
export function staffMatchesLoginId(
  staff: { name: string; email?: string | null },
  loginId: string,
): boolean {
  const id = normalizeOfficeLoginId(loginId);
  if (!id) return false;

  const email = (staff.email ?? "").trim().toLowerCase();
  if (email && email === id) return true;
  if (email) {
    const local = email.split("@")[0] ?? "";
    if (local && local === id) return true;
  }

  const name = staff.name.trim().toLowerCase();
  if (name && name === id) return true;
  // Single-token username against first name
  const first = name.split(/\s+/)[0] ?? "";
  if (first && first === id) return true;

  return false;
}
