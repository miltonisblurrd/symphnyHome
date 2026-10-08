import { NextResponse } from "next/server";
import { z } from "zod";
import { saveMetaAdsTargets } from "@/lib/meta-ads/meta/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  targetCpl: z.number().positive().max(10_000).nullable(),
  targetQualifiedCpl: z.number().positive().max(10_000).nullable(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send the target as JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a dollar amount, or leave a field blank to clear it." }, { status: 400 });
  }
  const result = await saveMetaAdsTargets(parsed.data);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ ok: true });
}
