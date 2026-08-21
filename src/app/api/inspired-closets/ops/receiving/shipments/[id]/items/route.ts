import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  linkItemToOs,
  type ParsedSlipItem,
} from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed: ParsedSlipItem = {
    item_number: String(body.item_number ?? "").trim(),
    so_number: typeof body.so_number === "string" ? body.so_number : null,
    cust_ref: typeof body.cust_ref === "string" ? body.cust_ref : null,
    job_name: typeof body.job_name === "string" ? body.job_name : null,
    description: typeof body.description === "string" ? body.description : null,
    qty: Math.max(1, Math.round(Number(body.qty) || 1)),
    container_id: typeof body.container_id === "string" ? body.container_id : null,
  };
  if (!parsed.item_number) {
    return NextResponse.json({ ok: false, error: "item_number is required." }, { status: 400 });
  }
  const links = await linkItemToOs(parsed);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipment_items")
    .insert({
      shipment_id: id,
      ...parsed,
      received_qty: 0,
      damaged_qty: 0,
      status: "expected",
      job_id: links.job_id,
      part_id: links.part_id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}
