import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  QB_OAUTH_STATE_COOKIE,
  QB_REALM_ID_COOKIE,
  QB_REFRESH_TOKEN_COOKIE,
  exchangeQuickBooksCode,
  getQuickBooksConfig,
  renderQuickBooksCallbackPage,
  renderQuickBooksConnectedPage,
} from "@/lib/quickbooks";

function htmlError(title: string, message: string) {
  const html = renderQuickBooksCallbackPage({
    title,
    message,
    linkHref: "/api/integrations/quickbooks/connect",
    linkLabel: "Try Connect QuickBooks again",
  });
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const config = getQuickBooksConfig();
  if (!config) {
    return htmlError(
      "QuickBooks not configured",
      "Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in your environment first.",
    );
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return htmlError("QuickBooks authorization failed", `Intuit returned: ${error}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");

  const jar = await cookies();
  const expectedState = jar.get(QB_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !realmId) {
    return htmlError(
      "Missing OAuth parameters",
      "Start from the dashboard Connect QuickBooks link instead of opening this URL directly.",
    );
  }

  if (!expectedState || state !== expectedState) {
    return htmlError(
      "OAuth session expired",
      "The security state cookie did not match. Go back to the Gavin dashboard, click <strong>Connect QuickBooks sandbox</strong> again, and complete the flow in one sitting without refreshing.",
    );
  }

  try {
    const tokens = await exchangeQuickBooksCode(config, code);

    const html = renderQuickBooksConnectedPage({
      realmId,
      refreshToken: tokens.refreshToken,
      environment: config.environment,
    });

    const response = new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    response.cookies.set(QB_REALM_ID_COOKIE, realmId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    response.cookies.set(QB_REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    response.cookies.delete(QB_OAUTH_STATE_COOKIE);
    return response;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "QuickBooks connection failed";
    return htmlError(
      "Token exchange failed",
      `${message}<br/><br/>OAuth codes are one-time use. Click Connect again to get a fresh authorization.`,
    );
  }
}
