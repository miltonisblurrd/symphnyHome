import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  financeExceptions,
  formatCurrency,
  gavinDemoMeta,
  getFinancialPulseForPeriod,
  jobs,
  schedule,
  type GavinPeriod,
} from "@/data/inspired-closets-gavin-demo";
import { buildSymphonyInsights, resolveSymphonyAnswer } from "@/lib/inspired-closets-symphony-insights";
import { fetchOperationsSnapshot } from "@/lib/inspired-closets-google-sheets";
import {
  buildCubbyWorkbookContext,
  buildWorkbookHub,
} from "@/lib/inspired-closets-payroll-workbook";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-5";

export type CubbyResponseSource =
  | "demo"
  | "claude+demo"
  | "claude+sheets"
  | "demo-fallback";

function resolveCubbySource(input: {
  hasSheets: boolean;
  fallback?: boolean;
}): CubbyResponseSource {
  if (input.fallback) return "demo-fallback";
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

  let workbookContext = null;
  let hubAttention = null;
  let workbookPulse = null;

  try {
    const snapshot = await fetchOperationsSnapshot();
    if (snapshot) {
      const hub = buildWorkbookHub(snapshot, period);
      workbookPulse = hub.pulse;
      hubAttention = hub.attentionItems;
      workbookContext = buildCubbyWorkbookContext(snapshot, period, question);
    }
  } catch (error) {
    console.error(
      "[cubby] Payroll workbook sync failed:",
      error instanceof Error ? error.message : error,
    );
  }

  const demoPulse = getFinancialPulseForPeriod(period);
  const pulseForInsights = workbookPulse
    ? {
        sales: workbookPulse.sales,
        cashCollected: workbookPulse.cashCollected,
        outstandingBalances: workbookPulse.outstandingBalances,
        avgMargin: workbookPulse.avgMarginFinal || workbookPulse.avgMarginStarting,
        unverifiedCosts: 0,
        jobsBelowMarginGate: workbookPulse.jobsBelowMarginGate,
        spiffsPending: workbookPulse.commissionsOpen,
      }
    : demoPulse;

  const attentionForInsights = hubAttention ?? [];

  const insights = buildSymphonyInsights({
    attentionItems: attentionForInsights.length
      ? attentionForInsights
      : [
          {
            id: "demo",
            severity: "info" as const,
            title: "Workbook not connected",
            detail: "Connect Google Sheets to load live attention.",
            owner: "Gavin",
            amount: null,
            action: "Connect sheet",
            todoLabel: "Connect payroll workbook",
            todoWhy: "Live numbers require the shared Google Sheet.",
            defaultAssignee: "Gavin",
            notifyMessage: "Payroll workbook is not connected.",
            context: "Demo fallback.",
          },
        ],
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
    financialPulseSource: workbookPulse ? "payroll_workbook" : "demo",
    workbook: workbookContext,
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
      max_tokens: 700,
      system: `You are Cubby, the Inspired Closets Las Vegas executive ops assistant inside Gavin's dashboard.
Answer in plain, confident language for a busy executive.
Use ONLY the provided Ops Hub context.
The Payroll Workbook (red 2026 designer tabs) is the source of truth for sales, deposits, outstanding balances, margins (starting / after spiff / final), commissions, and notes.
Prefer workbook.pulse for company totals and workbook.jobs / workbook.designers / workbook.attentionItems for specifics.
When using sheet data, mention it reflects the last syncedAt timestamp when timing matters.
If something is not in context, say what is missing instead of inventing numbers.
Keep answers concise — usually 2-5 sentences unless listing urgent items.`,
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
        hasSheets: Boolean(workbookContext),
      }),
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cubby request failed";
    return NextResponse.json({
      answer: resolveSymphonyAnswer(question, insights),
      source: resolveCubbySource({
        hasSheets: Boolean(workbookContext),
        fallback: true,
      }),
      model,
      error: message,
    });
  }
}
