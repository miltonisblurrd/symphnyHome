import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  attentionItems,
  financeExceptions,
  formatCurrency,
  gavinDemoMeta,
  getFinancialPulseForPeriod,
  jobs,
  schedule,
  type GavinPeriod,
} from "@/data/inspired-closets-gavin-demo";
import { buildSymphonyInsights, resolveSymphonyAnswer } from "@/lib/inspired-closets-symphony-insights";
import { buildCubbyOperationsContext } from "@/lib/inspired-closets-ops-context";
import { fetchOperationsSnapshot } from "@/lib/inspired-closets-google-sheets";
import { fetchQuickBooksFinancialPulse } from "@/lib/quickbooks";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-5";

export type CubbyResponseSource =
  | "demo"
  | "claude+demo"
  | "claude+quickbooks"
  | "claude+sheets"
  | "claude+quickbooks+sheets"
  | "demo-fallback";

function resolveCubbySource(input: {
  hasQuickBooks: boolean;
  hasSheets: boolean;
  fallback?: boolean;
}): CubbyResponseSource {
  if (input.fallback) return "demo-fallback";
  if (input.hasQuickBooks && input.hasSheets) return "claude+quickbooks+sheets";
  if (input.hasQuickBooks) return "claude+quickbooks";
  if (input.hasSheets) return "claude+sheets";
  return "claude+demo";
}

export async function POST(request: Request) {
  let question = "";
  let period: GavinPeriod = "This week";

  try {
    const body = (await request.json()) as { question?: string; period?: GavinPeriod };
    question = body.question?.trim() ?? "";
    if (body.period) period = body.period;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  const apiKey = process.env.INSPIRED_CLOSETS_ANTHROPIC_API_KEY?.trim();
  const model = process.env.INSPIRED_CLOSETS_ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  const livePulse = await fetchQuickBooksFinancialPulse(period).catch(() => null);
  let operationsSnapshot = null;
  try {
    operationsSnapshot = await fetchOperationsSnapshot();
  } catch (error) {
    console.error(
      "[cubby] Google Sheets sync failed:",
      error instanceof Error ? error.message : error,
    );
  }
  const demoPulse = getFinancialPulseForPeriod(period);
  const pulseForInsights = livePulse
    ? {
        sales: livePulse.sales,
        cashCollected: livePulse.cashCollected,
        outstandingBalances: livePulse.outstandingBalances,
        avgMargin: livePulse.avgMargin || demoPulse.avgMargin,
        unverifiedCosts: livePulse.unverifiedCosts,
        jobsBelowMarginGate: livePulse.jobsBelowMarginGate || demoPulse.jobsBelowMarginGate,
        spiffsPending: livePulse.spiffsPending || demoPulse.spiffsPending,
      }
    : demoPulse;

  const insights = buildSymphonyInsights({
    attentionItems,
    financialPulse: pulseForInsights,
    financeExceptions,
    jobs,
    schedule,
    period,
    marginGate: gavinDemoMeta.marginGate,
    formatCurrency,
  });

  if (!apiKey) {
    return NextResponse.json({
      answer: resolveSymphonyAnswer(question, insights),
      source: "demo",
    });
  }

  const context = {
    period,
    company: gavinDemoMeta.company,
    financialPulse: pulseForInsights,
    financialPulseSource: livePulse ? "quickbooks_sandbox" : "demo",
    quickBooksCompany: livePulse?.companyName ?? null,
    operationsSnapshot: operationsSnapshot
      ? buildCubbyOperationsContext(operationsSnapshot, question)
      : null,
    attentionItems: attentionItems.map((item) => ({
      severity: item.severity,
      title: item.title,
      detail: item.detail,
      amount: item.amount,
      todoLabel: item.todoLabel,
    })),
    suggestedInsights: insights.map((item) => ({
      prompt: item.prompt,
      answer: item.answer,
      category: item.category,
    })),
  };

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      system: `You are Cubby, the Inspired Closets Las Vegas executive ops assistant inside Gavin's dashboard.
Answer in plain, confident language for a busy executive.
Use ONLY the provided Ops Hub context. If QuickBooks sandbox data is present, prefer it for money questions.
If operationsSnapshot is present, it is the REB 26 master client list from Craig's Google Sheet.
Prefer it for current clients, pipeline, job status, installs, and scheduling questions.
When using sheet data, mention it reflects the last syncedAt timestamp when timing matters.
If something is not in context, say what is missing instead of inventing numbers.
Keep answers concise — usually 2-4 sentences unless listing urgent items.`,
      messages: [
        {
          role: "user",
          content: `Ops Hub context (JSON):\n${JSON.stringify(context, null, 2)}\n\nExecutive question: ${question}`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const answer =
      textBlock && textBlock.type === "text"
        ? textBlock.text.trim()
        : resolveSymphonyAnswer(question, insights);

    return NextResponse.json({
      answer,
      source: resolveCubbySource({
        hasQuickBooks: Boolean(livePulse),
        hasSheets: Boolean(operationsSnapshot),
      }),
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cubby request failed";
    return NextResponse.json({
      answer: resolveSymphonyAnswer(question, insights),
      source: resolveCubbySource({
        hasQuickBooks: Boolean(livePulse),
        hasSheets: Boolean(operationsSnapshot),
        fallback: true,
      }),
      model,
      error: message,
    });
  }
}
