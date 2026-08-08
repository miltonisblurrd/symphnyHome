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
import { buildCubbyOpsContext } from "@/lib/inspired-closets-ops-finance";
import { isDbConfigured } from "@/db/client";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-5";

export type CubbyResponseSource =
  | "demo"
  | "claude+demo"
  | "claude+sheets"
  | "claude+os"
  | "demo-fallback";

function resolveCubbySource(input: {
  hasOs?: boolean;
  hasSheets: boolean;
  fallback?: boolean;
}): CubbyResponseSource {
  if (input.fallback) return "demo-fallback";
  if (input.hasOs) return "claude+os";
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

  let opsContext: Record<string, unknown> | null = null;
  if (isDbConfigured()) {
    try {
      opsContext = await buildCubbyOpsContext();
    } catch (error) {
      console.error(
        "[cubby] OS finance context failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

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
            title: opsContext ? "OS connected" : "Workbook not connected",
            detail: opsContext
              ? "Answering from Inspired Closets OS jobs, payments, and finance queue."
              : "Connect Google Sheets or OS finance data for live attention.",
            owner: "Gavin",
            amount: null,
            action: "Ask Cubby",
            todoLabel: "Use OS / workbook",
            todoWhy: "Live numbers need OS or the shared Google Sheet.",
            defaultAssignee: "Gavin",
            notifyMessage: "Check finance attention in OS.",
            context: opsContext ? "OS" : "Demo fallback.",
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
    financialPulseSource: opsContext
      ? "inspired_closets_os"
      : workbookPulse
        ? "payroll_workbook"
        : "demo",
    ops: opsContext,
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
      system: `You are Cubby, the Inspired Closets Las Vegas executive ops assistant.
Answer in plain, confident language for a busy executive (Gavin) or finance lead (Lulu).
Use ONLY the provided Ops Hub context.
Prefer ops (Inspired Closets OS) when present — that is the live job, payment, crew, issue, and finance-attention source.
QuickBooks remains accounting books; Podium remains the customer payment rail; the payroll workbook may still backfill designer commission history.
The spiff gate is ${gavinDemoMeta.marginGate}% margin — never invent approvals below the gate.
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
        hasOs: Boolean(opsContext),
        hasSheets: Boolean(workbookContext),
      }),
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cubby request failed";
    return NextResponse.json({
      answer: resolveSymphonyAnswer(question, insights),
      source: resolveCubbySource({
        hasOs: Boolean(opsContext),
        hasSheets: Boolean(workbookContext),
        fallback: true,
      }),
      model,
      error: message,
    });
  }
}
