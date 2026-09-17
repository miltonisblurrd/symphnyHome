import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  INSPIRED_CLOSETS_ACCESS_COOKIE,
  INSPIRED_CLOSETS_ACCESS_PATH,
  getExpectedInspiredClosetsAccessToken,
  isInspiredClosetsAccessEnabled,
  isInspiredClosetsProtectedPath,
} from "@/lib/inspired-closets-access";
import { IC_STAFF_ROLE_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  canAccessOpsApi,
  canAccessOpsPage,
  IC_INVENTORY_HOME,
  isInventoryRole,
} from "@/lib/inspired-closets-ops-roles";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isInspiredClosetsProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!isInspiredClosetsAccessEnabled()) {
    return enforceInventoryScope(request, pathname);
  }

  const expected = await getExpectedInspiredClosetsAccessToken();
  const cookie = request.cookies.get(INSPIRED_CLOSETS_ACCESS_COOKIE)?.value;
  if (!expected || cookie !== expected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = INSPIRED_CLOSETS_ACCESS_PATH;
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return enforceInventoryScope(request, pathname);
}

function enforceInventoryScope(request: NextRequest, pathname: string) {
  const role = request.cookies.get(IC_STAFF_ROLE_COOKIE)?.value ?? null;
  if (!isInventoryRole(role)) {
    return NextResponse.next();
  }

  // Page routes outside Inventory/Receiving → redirect home
  if (!pathname.startsWith("/api/")) {
    // Allow the access page itself (already excluded from protected paths)
    if (!canAccessOpsPage(role, pathname)) {
      const home = request.nextUrl.clone();
      home.pathname = IC_INVENTORY_HOME;
      home.search = "";
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  // API allowlist for inventory role
  if (!canAccessOpsApi(role, pathname)) {
    return NextResponse.json(
      { ok: false, error: "Your login is limited to Inventory and Receiving." },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
