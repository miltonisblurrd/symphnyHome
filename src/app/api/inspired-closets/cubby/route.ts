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
import { fetchQuickBooksFinancialPulse } from "@/lib/quickbooks";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-5";

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
      source: livePulse ? "claude+quickbooks" : "claude+demo",
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cubby request failed";
    return NextResponse.json({
      answer: resolveSymphonyAnswer(question, insights),
      source: "demo-fallback",
      model,
      error: message,
    });
  }
}
