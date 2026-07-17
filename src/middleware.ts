import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  INSPIRED_CLOSETS_ACCESS_COOKIE,
  INSPIRED_CLOSETS_ACCESS_PATH,
  getExpectedInspiredClosetsAccessToken,
  isInspiredClosetsAccessEnabled,
  isInspiredClosetsProtectedPath,
} from "@/lib/inspired-closets-access";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isInspiredClosetsProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!isInspiredClosetsAccessEnabled()) {
    return NextResponse.next();
  }

  const expected = await getExpectedInspiredClosetsAccessToken();
  const cookie = request.cookies.get(INSPIRED_CLOSETS_ACCESS_COOKIE)?.value;
  if (expected && cookie === expected) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = INSPIRED_CLOSETS_ACCESS_PATH;
  loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
