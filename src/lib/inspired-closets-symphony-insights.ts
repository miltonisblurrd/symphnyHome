import type { AttentionSeverity } from "@/data/inspired-closets-gavin-demo";

export type InsightCategory = "critical" | "warning" | "info" | "finance" | "projection";

export type SymphonyInsight = {
  id: string;
  prompt: string;
  category: InsightCategory;
  reason: string;
  answer: string;
};

type BuildInsightsInput = {
  attentionItems: Array<{
    id: string;
    severity: AttentionSeverity;
    title: string;
    detail: string;
    amount: number | null;
    todoLabel: string;
  }>;
  financialPulse: {
    sales: number;
    cashCollected: number;
    outstandingBalances: number;
    avgMargin: number;
    unverifiedCosts: number;
    jobsBelowMarginGate: number;
    spiffsPending: number;
  };
  financeExceptions: Array<{ type: string; customer: string; detail: string }>;
  jobs: Array<{ customer: string; margin: number | null; balanceOwed: number; risk: string }>;
  schedule: {
    installs: Array<{ customer: string; when: string; note: string }>;
  };
  period: string;
  marginGate: number;
  formatCurrency: (value: number) => string;
};

const severityRank: Record<InsightCategory, number> = {
  critical: 0,
  warning: 1,
  finance: 2,
  projection: 3,
  info: 4,
};

export function buildSymphonyInsights(input: BuildInsightsInput): SymphonyInsight[] {
  const {
    attentionItems,
    financialPulse,
    financeExceptions,
    jobs,
    schedule,
    period,
    marginGate,
    formatCurrency,
  } = input;

  const insights: SymphonyInsight[] = [];
  const critical = attentionItems.filter((item) => item.severity === "critical");
  const warnings = attentionItems.filter((item) => item.severity === "warning");
  const overdueJobs = jobs.filter((job) => job.risk.toLowerCase().includes("overdue"));
  const belowMarginJobs = jobs.filter(
    (job) => job.margin != null && job.margin < marginGate,
  );
  const installRisks = schedule.installs.filter((item) =>
    item.note.toLowerCase().includes("confirm") || item.note.toLowerCase().includes("risk"),
  );
  const collectionRate = Math.round(
    (financialPulse.cashCollected / Math.max(financialPulse.sales, 1)) * 100,
  );
  const projectionMultiplier =
    period === "This week"
      ? 4.3
      : period === "This month"
        ? 1
        : period === "This quarter"
          ? 0.33
          : period === "YtD"
            ? 12 / 6.5
            : 12 / 6.5;
  const projectedMonthCash = Math.round(financialPulse.cashCollected * projectionMultiplier);
  const periodLabel = period.toLowerCase();

  if (critical.length > 0) {
    insights.push({
      id: "attention-critical",
      prompt: "What needs my attention today?",
      category: "critical",
      reason: `${critical.length} critical item${critical.length > 1 ? "s" : ""} open`,
      answer: `Start here: ${critical.map((item) => item.title).join("; ")}. Highest urgency is ${critical[0]?.todoLabel ?? "clearing stalled jobs and overdue balances"}.`,
    });
  }

  if (financialPulse.jobsBelowMarginGate > 0 || belowMarginJobs.length > 0) {
    const names = belowMarginJobs.map((job) => `${job.customer} (${job.margin}%)`).join(", ");
    insights.push({
      id: "margin-gate",
      prompt: `Which jobs are below ${marginGate}% margin?`,
      category: "warning",
      reason: `${financialPulse.jobsBelowMarginGate} below gate`,
      answer: `${financialPulse.jobsBelowMarginGate} jobs are below the ${marginGate}% spiff gate${names ? `: ${names}` : ""}. Spiffs pending total ${formatCurrency(financialPulse.spiffsPending)} until approved or declined.`,
    });
  }

  if (financialPulse.outstandingBalances > 0 || overdueJobs.length > 0) {
    insights.push({
      id: "outstanding",
      prompt: "Who still owes money?",
      category: "finance",
      reason: `${formatCurrency(financialPulse.outstandingBalances)} outstanding`,
      answer: `Outstanding balances total ${formatCurrency(financialPulse.outstandingBalances)}.${overdueJobs.length > 0 ? ` Most urgent: ${overdueJobs.map((job) => `${job.customer} (${formatCurrency(job.balanceOwed)})`).join(", ")}.` : ""}`,
    });
  }

  if (financialPulse.unverifiedCosts > 0) {
    insights.push({
      id: "unverified-stow",
      prompt: "What Stow costs are unverified?",
      category: "warning",
      reason: `${formatCurrency(financialPulse.unverifiedCosts)} unverified`,
      answer: `About ${formatCurrency(financialPulse.unverifiedCosts)} in vendor costs still need itemized invoices. Morales is the largest open item — hold payment until pallet/freight lines are explicit.`,
    });
  }

  if (installRisks.length > 0 || warnings.some((item) => item.title.includes("install"))) {
    insights.push({
      id: "install-risk",
      prompt: "Which installs are at risk this week?",
      category: "info",
      reason: `${installRisks.length || 1} schedule risk${installRisks.length === 1 ? "" : "s"}`,
      answer: `Thursday Brooks install needs flooring/site-prep confirmation.${installRisks.length > 0 ? ` Flagged: ${installRisks.map((item) => `${item.customer} (${item.when})`).join(", ")}.` : ""}`,
    });
  }

  if (financeExceptions.some((item) => item.type.includes("Duplicate"))) {
    insights.push({
      id: "duplicate-risk",
      prompt: "Any duplicate payment risks?",
      category: "critical",
      reason: "Duplicate payout flagged",
      answer: "One duplicate-payment risk is open on a Dixon vendor payout. Lulu should confirm before release so the same amount is not paid twice.",
    });
  }

  insights.push({
    id: "cash-projection",
    prompt:
      period === "YoY"
        ? "How does this year compare to last year?"
        : period === "YtD"
          ? "Are we on pace for the full year?"
          : `Will we collect enough cash ${periodLabel}?`,
    category: "projection",
    reason: `${collectionRate}% collected so far`,
    answer:
      period === "YoY"
        ? `YtD sales are ${formatCurrency(financialPulse.sales)} (+18.4% vs the same point last year). Cash collected is ${formatCurrency(financialPulse.cashCollected)} (+15.2% YoY) at a ${collectionRate}% collection rate. Margin is ${financialPulse.avgMargin}% (+1.3 pts vs LY) and open AR is down 22%.`
        : period === "YtD"
          ? `YtD you have ${formatCurrency(financialPulse.sales)} in sales and ${formatCurrency(financialPulse.cashCollected)} collected (${collectionRate}%). At the current pace, full-year collections could land near ${formatCurrency(projectedMonthCash)} — watch ${formatCurrency(financialPulse.outstandingBalances)} still outstanding.`
          : `You have collected ${formatCurrency(financialPulse.cashCollected)} against ${formatCurrency(financialPulse.sales)} in sales (${collectionRate}%). At this pace, projected collections land near ${formatCurrency(projectedMonthCash)}${period === "This week" ? " this month" : ""} — but ${formatCurrency(financialPulse.outstandingBalances)} still outstanding could widen the gap.`,
  });

  insights.push({
    id: "margin-projection",
    prompt: "Are margins strong enough after spiffs?",
    category: "projection",
    reason: `Avg margin ${financialPulse.avgMargin}%`,
    answer: `Portfolio average margin is ${financialPulse.avgMargin}% vs the ${marginGate}% gate. If pending spiffs of ${formatCurrency(financialPulse.spiffsPending)} are approved without margin recovery, net margin pressure increases on ${financialPulse.jobsBelowMarginGate} job(s).`,
  });

  if (warnings.length > 0) {
    insights.push({
      id: "warning-summary",
      prompt: "What warnings should I review first?",
      category: "warning",
      reason: `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`,
      answer: warnings
        .slice(0, 3)
        .map((item) => `${item.title}: ${item.todoLabel}`)
        .join(" · "),
    });
  }

  return insights
    .sort((a, b) => severityRank[a.category] - severityRank[b.category])
    .slice(0, 6);
}

export function resolveSymphonyAnswer(
  question: string,
  insights: SymphonyInsight[],
): string {
  const normalized = question.trim().toLowerCase();
  if (!normalized) {
    return "Ask me about margins, cash, outstanding balances, attention items, installs, or projections.";
  }

  const exact = insights.find((item) => item.prompt.toLowerCase() === normalized);
  if (exact) return exact.answer;

  const partial = insights.find(
    (item) =>
      normalized.includes(item.prompt.toLowerCase().slice(0, 12)) ||
      item.prompt.toLowerCase().includes(normalized.slice(0, 12)),
  );
  if (partial) return partial.answer;

  const keywordRules: Array<{ match: RegExp; answer: string | ((items: SymphonyInsight[]) => string) }> = [
    {
      match: /attention|priority|urgent|critical|today/,
      answer: (items) =>
        items.find((item) => item.id === "attention-critical")?.answer ??
        "Review open critical and warning items in Today's attention first.",
    },
    {
      match: /margin|45%|spiff|profit/,
      answer: (items) =>
        items.find((item) => item.id === "margin-gate")?.answer ??
        items.find((item) => item.id === "margin-projection")?.answer ??
        "Margin data is available in Financial Pulse and job pipeline.",
    },
    {
      match: /owe|outstanding|balance|collect|cash/,
      answer: (items) =>
        items.find((item) => item.id === "outstanding")?.answer ??
        items.find((item) => item.id === "cash-projection")?.answer ??
        "Outstanding balances are tracked in Financial Pulse.",
    },
    {
      match: /stow|unverified|invoice|vendor/,
      answer: (items) =>
        items.find((item) => item.id === "unverified-stow")?.answer ??
        "Unverified vendor costs should be reviewed before payment.",
    },
    {
      match: /install|schedule|thursday|brooks/,
      answer: (items) =>
        items.find((item) => item.id === "install-risk")?.answer ??
        "Check the schedule snapshot for install risks this week.",
    },
    {
      match: /duplicate|payment risk/,
      answer: (items) =>
        items.find((item) => item.id === "duplicate-risk")?.answer ??
        "No duplicate-payment risks are flagged right now.",
    },
    {
      match: /yoy|year over|last year|compare|versus|vs ly/,
      answer: (items) =>
        items.find((item) => item.id === "cash-projection")?.answer ??
        "Year-over-year comparisons are available in the YoY financial pulse view.",
    },
    {
      match: /ytd|year to date|full year|annual/,
      answer: (items) =>
        items.find((item) => item.id === "cash-projection")?.answer ??
        items.find((item) => item.id === "margin-projection")?.answer ??
        "Year-to-date totals are in Financial Pulse when YtD is selected.",
    },
    {
      match: /project|forecast|pace|week|month|quarter/,
      answer: (items) =>
        items.find((item) => item.id === "cash-projection")?.answer ??
        items.find((item) => item.id === "margin-projection")?.answer ??
        "Projections are based on current sales, collections, and outstanding balances.",
    },
  ];

  for (const rule of keywordRules) {
    if (rule.match.test(normalized)) {
      return typeof rule.answer === "function" ? rule.answer(insights) : rule.answer;
    }
  }

  return "Hmm — Cubby's not sure on that one yet. Try a suggested bubble, or ask about margins, cash, attention items, installs, or what's overdue.";
}
