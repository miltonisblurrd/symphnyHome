import { reviewDemoAccount, reviewFromSnapshot, type DemoAccountReview } from "@/lib/meta-ads/analytics/review";
import { readOpenAiAnalystConfig } from "@/lib/meta-ads/env";
import { META_ADS_SYNC_MAX_AGE_MS, readLiveSnapshot } from "@/lib/meta-ads/meta/load";

export type AnalystTurn = { role: "user" | "assistant"; content: string };

const INSTRUCTIONS = `You are the Meta Ads performance analyst for this account.

You help the person who makes the ads understand performance and decide what to make next. You never change campaigns, budgets, or ads. Humans do that in Ads Manager.

Use only the evidence JSON in the conversation. Do not invent metrics, dates, or ad names. If a number is missing, say so. A small sample is a reason to wait, not a reason to force a change.

Reason from the evidence: what changed, which ads drove it, and whether the sample is large enough. Creative fatigue is possible, not proven, unless the evidence is direct. Correlation is not causation. "No change yet" is a valid answer.

Write for a social media person, not a data scientist. Lead with the finding, then the evidence, then what to make or leave alone. Keep it short.`;

export async function askAdsAnalyst(input: {
  range: 7 | 30 | 60;
  messages: AnalystTurn[];
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const config = readOpenAiAnalystConfig();
  if (!config.ok) return { ok: false, error: config.reason };

  const evidence = await evidenceForRange(input.range);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      instructions: INSTRUCTIONS,
      max_output_tokens: 2000,
      input: [
        {
          role: "user",
          content: `Evidence for the selected range. Answer later questions from this, and say when it does not contain the answer.\n\n${JSON.stringify(evidence)}`,
        },
        ...input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }),
  });

  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    return { ok: false, error: body.error?.message ?? "The analyst could not answer." };
  }
  const reply = readReply(body);
  if (!reply) return { ok: false, error: "The analyst returned an empty answer." };
  return { ok: true, reply };
}

function readReply(body: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (body.output_text?.trim()) return body.output_text.trim();
  const parts: string[] = [];
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const chunk of item.content ?? []) {
      if (chunk.text?.trim()) parts.push(chunk.text.trim());
    }
  }
  return parts.join("\n\n");
}

async function evidenceForRange(range: 7 | 30 | 60) {
  const snapshot = await readLiveSnapshot({ maxAgeMs: META_ADS_SYNC_MAX_AGE_MS });
  const review = snapshot ? reviewFromSnapshot(snapshot, range) : reviewDemoAccount();
  return compactEvidence(review);
}

function compactEvidence(review: DemoAccountReview) {
  const delivering = review.creatives.filter((creative) => creative.spend > 0);
  const idle = review.creatives.filter((creative) => creative.spend <= 0);
  return {
    account: review.company,
    demo: review.isDemo,
    range: `${review.currentLabel} (${review.currentRange})`,
    comparedWith: `${review.previousLabel} (${review.previousRange})`,
    targetCpl: review.targetCpl,
    kpis: review.kpis.map((kpi) => ({
      label: kpi.label,
      value: kpi.value,
      previous: kpi.previous,
      change: kpi.changeLabel,
    })),
    dailyLeads: review.daily.map((point) => ({
      date: point.date,
      period: point.period,
      leads: point.leads,
      spend: point.spend,
    })),
    adsThatDelivered: delivering.map((creative) => ({
      name: creative.name,
      campaign: creative.campaignName,
      format: creative.format,
      spend: creative.spend,
      leads: creative.leads,
      cpl: creative.cplLabel,
      previousCpl: creative.previousCplLabel,
      cplChange: creative.cplChangeLabel,
      ctr: creative.ctrLabel,
      previousCtr: creative.previousCtrLabel,
      ctrChange: creative.ctrChangeLabel,
      frequency: creative.frequency,
      previousFrequency: creative.previousFrequency,
      signals: creative.signals,
      confidence: creative.confidence,
      observation: creative.headline,
      whatToMakeNext: creative.contentDirection,
      reasoning: creative.reasoning,
    })),
    switchedOnWithNoSpend: idle.map((creative) => ({
      name: creative.name,
      campaign: creative.campaignName,
    })),
  };
}
