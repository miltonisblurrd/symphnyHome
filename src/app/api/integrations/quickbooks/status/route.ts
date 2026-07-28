import { NextResponse } from "next/server";
import { fetchQuickBooksFinancialPulse, getQuickBooksConfig, getQuickBooksTokens } from "@/lib/quickbooks";

export async function GET() {
  const config = getQuickBooksConfig();
  const tokens = await getQuickBooksTokens();

  return NextResponse.json({
    configured: Boolean(config),
    connected: Boolean(tokens),
    environment: config?.environment ?? null,
    realmId: tokens?.realmId ?? null,
    connectUrl: "/api/integrations/quickbooks/connect",
  });
}

export async function POST(request: Request) {
  let period = "This week";
  try {
    const body = (await request.json()) as { period?: string };
    if (body.period) period = body.period;
  } catch {
    // use default period
  }

  try {
    const pulse = await fetchQuickBooksFinancialPulse(period);
    if (!pulse) {
      return NextResponse.json(
        {
          connected: false,
          connectUrl: "/api/integrations/quickbooks/connect",
          error: "QuickBooks is not connected. Visit the connect URL first.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ connected: true, pulse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QuickBooks sync failed";
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
