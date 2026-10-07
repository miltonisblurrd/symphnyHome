/**
 * Role-based ops access for Inspired Closets OS.
 * Inventory (Frank) is scoped to Inventory + Receiving; other roles keep full access.
 */

export const IC_INVENTORY_HOME = "/ops/inventory";
export const IC_WAREHOUSE_HOME = "/ops/warehouse";
export const IC_OPS_HOME = "/ops/projects";

/** Page prefixes the inventory role may open. Receiving lives under inventory. */
export const INVENTORY_PAGE_PREFIXES = [
  "/ops/inventory",
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
  "/ops/inventory",
  "/ops/inventory/receiving",
]);

/** Bryant: staging queue plus the receiving scanner. Not Frank's inventory ledger. */
export const WAREHOUSE_PAGE_PREFIXES = [
  "/ops/warehouse",
  "/ops/inventory/receiving",
] as const;

/**
 * Receiving's document panel reads jobs, Stow orders, and uploaded documents.
 * Parts and stock routes stay off this list.
 */
export const WAREHOUSE_API_PREFIXES = [
  "/api/inspired-closets/ops/warehouse",
  "/api/inspired-closets/ops/receiving",
  "/api/inspired-closets/ops/jobs",
  "/api/inspired-closets/ops/stow-orders",
  "/api/inspired-closets/ops/inventory/documents",
  "/api/inspired-closets/ops/session",
] as const;

export function isInventoryRole(role: string | null | undefined): boolean {
  return role === "inventory";
}

export function isWarehouseRole(role: string | null | undefined): boolean {
  return role === "warehouse";
}

export function scopedOpsHome(role: string | null | undefined): string | null {
  if (isInventoryRole(role)) return IC_INVENTORY_HOME;
  if (isWarehouseRole(role)) return IC_WAREHOUSE_HOME;
  return null;
}

/** Designers, plus Craig (operations), who still owns jobs, payroll, and the sheet. */
export function isDesignDeskRole(role: string | null | undefined): boolean {
  return role === "designer" || role === "operations";
}

/**
 * Craig's sales dashboard is not ready. His office login opens the OS
 * (Projects), where he can also cover Receiving uploads.
 */
export function opensOsHome(staff?: {
  name?: string | null;
  workbook_tab?: string | null;
} | null): boolean {
  if (!staff) return false;
  const name = (staff.name ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (name === "craig") return true;
  const tab = (staff.workbook_tab ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
  return tab === "craig";
}

export function roleHomePath(
  role: string | null | undefined,
  staff?: { name?: string | null; workbook_tab?: string | null } | null,
): string {
  if (isInventoryRole(role)) return IC_INVENTORY_HOME;
  if (isWarehouseRole(role)) return IC_WAREHOUSE_HOME;
  if (role === "installer") return "/installers";
  if (opensOsHome(staff)) return IC_OPS_HOME;
  if (role === "designer") return "/designers";
  return IC_OPS_HOME;
}

export function canAccessOpsPage(
  role: string | null | undefined,
  pathname: string,
): boolean {
  if (isInventoryRole(role)) {
    return INVENTORY_PAGE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  if (isWarehouseRole(role)) {
    return WAREHOUSE_PAGE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return true;
}

export function canAccessOpsApi(
  role: string | null | undefined,
  pathname: string,
): boolean {
  if (isInventoryRole(role)) {
    return INVENTORY_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  if (isWarehouseRole(role)) {
    return WAREHOUSE_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return true;
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
  staff: { name: string; email?: string | null; workbook_tab?: string | null },
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

  const tab = (staff.workbook_tab ?? "").trim().toLowerCase();
  const tabToken = tab.split(/\s+/)[0] ?? "";
  if (tabToken && tabToken === id) return true;

  return false;
}
