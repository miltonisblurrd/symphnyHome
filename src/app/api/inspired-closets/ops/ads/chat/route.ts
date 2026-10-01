import { NextResponse } from "next/server";
import { z } from "zod";
import { askAdsAnalyst } from "@/lib/meta-ads/ai/analyst";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  range: z.union([z.literal(7), z.literal(30), z.literal(60)]).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(12),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON message." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "That message could not be read." }, { status: 400 });
  }
  const last = parsed.data.messages[parsed.data.messages.length - 1];
  if (last?.role !== "user") {
    return NextResponse.json({ ok: false, error: "Ask a question to continue." }, { status: 400 });
  }

  const result = await askAdsAnalyst({
    range: parsed.data.range ?? 7,
    messages: parsed.data.messages,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, reply: result.reply });
}
