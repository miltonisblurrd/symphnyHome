import { NextResponse } from "next/server";
import {
  QB_OAUTH_STATE_COOKIE,
  buildQuickBooksAuthorizeUrl,
  getQuickBooksConfig,
} from "@/lib/quickbooks";

export async function GET() {
  const config = getQuickBooksConfig();
  if (!config) {
    return NextResponse.json(
      { error: "QuickBooks is not configured. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET." },
      { status: 503 },
    );
  }

  const state = crypto.randomUUID();
  const authorizeUrl = buildQuickBooksAuthorizeUrl(config, state);
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(QB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
