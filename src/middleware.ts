import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  INSPIRED_CLOSETS_ACCESS_COOKIE,
  INSPIRED_CLOSETS_ACCESS_PATH,
  getExpectedInspiredClosetsAccessToken,
  isInspiredClosetsAccessEnabled,
  isInspiredClosetsProtectedPath,
  isInstallerAppPath,
} from "@/lib/inspired-closets-access";
import { IC_STAFF_ROLE_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  canAccessOpsApi,
  canAccessOpsPage,
  isWarehouseRole,
  scopedOpsHome,
} from "@/lib/inspired-closets-ops-roles";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isInstallerAppPath(pathname)) {
    const field = request.cookies.get("ic-field-session")?.value;
    if (!field) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (!isInspiredClosetsProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!isInspiredClosetsAccessEnabled()) {
    return enforceScopedOps(request, pathname);
  }

  const expected = await getExpectedInspiredClosetsAccessToken();
  const cookie = request.cookies.get(INSPIRED_CLOSETS_ACCESS_COOKIE)?.value;
  if (!expected || cookie !== expected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = INSPIRED_CLOSETS_ACCESS_PATH;
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return enforceScopedOps(request, pathname);
}

function enforceScopedOps(request: NextRequest, pathname: string) {
  const role = request.cookies.get(IC_STAFF_ROLE_COOKIE)?.value ?? null;
  const homePath = scopedOpsHome(role);
  if (!homePath) {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/api/")) {
    if (!canAccessOpsPage(role, pathname)) {
      const home = request.nextUrl.clone();
      home.pathname = homePath;
      home.search = "";
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  if (!canAccessOpsApi(role, pathname)) {
    const error = isWarehouseRole(role)
      ? "Your login is limited to Staging and Receiving."
      : "Your login is limited to Inventory and Receiving.";
    return NextResponse.json({ ok: false, error }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
