import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { applyStockMovement } from "@/lib/inspired-closets-ops-inventory";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import { stampJobFirst } from "@/lib/inspired-closets-ops-job-spine";
import { missingSummaryTable } from "@/lib/inspired-closets-ops-product-summary";

export const runtime = "nodejs";

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data: summary, error } = await supabase
    .from("ic_job_summaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!summary) {
    return NextResponse.json({ ok: false, error: "Summary not found." }, { status: 404 });
  }
  const { data: lines } = await supabase
    .from("ic_job_summary_lines")
    .select("*")
    .eq("summary_id", id)
    .order("line_no", { ascending: true });
  return NextResponse.json({ ok: true, summary: { ...summary, lines: lines ?? [] } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const action = typeof body.action === "string" ? body.action : "confirm";
  const actor = await actorId();
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: summary, error: findError } = await supabase
    .from("ic_job_summaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findError) {
    if (missingSummaryTable(findError.message)) {
      return NextResponse.json(
        { ok: false, error: "Run drizzle/0023_ic_job_summaries.sql in Supabase." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!summary) {
    return NextResponse.json({ ok: false, error: "Summary not found." }, { status: 404 });
  }

  const { data: lines } = await supabase
    .from("ic_job_summary_lines")
    .select("*")
    .eq("summary_id", id)
    .order("line_no", { ascending: true });

  if (action === "confirm") {
    if (summary.status === "confirmed") {
      return NextResponse.json({ ok: true, summary: { ...summary, lines: lines ?? [] } });
    }
    const overrides = Array.isArray(body.lines)
      ? (body.lines as Array<{ id: string; reserve_qty?: number; order_qty?: number }>)
      : [];
    const byId = new Map(overrides.map((row) => [row.id, row]));
    let reserved = 0;
    for (const line of lines ?? []) {
      const override = byId.get(line.id);
      const reserveQty = Math.max(
        0,
        Math.round(Number(override?.reserve_qty ?? line.reserve_qty) || 0),
      );
      const orderQty = Math.max(0, Math.round(Number(override?.order_qty ?? line.order_qty) || 0));
      if (override) {
        await supabase
          .from("ic_job_summary_lines")
          .update({
            reserve_qty: reserveQty,
            order_qty: orderQty,
            updated_at: now,
          })
          .eq("id", line.id);
      }
      if (!line.part_id || reserveQty <= 0) continue;
      await applyStockMovement({
        partId: line.part_id,
        movementType: "reserve",
        qty: reserveQty,
        jobId: summary.job_id,
        note: `Product summary ${summary.order_name ?? summary.so_number ?? ""}`.trim(),
        actorId: actor,
      });
      await supabase.from("ic_job_materials").insert({
        job_id: summary.job_id,
        part_id: line.part_id,
        qty: reserveQty,
        status: "reserved",
        note: line.description ?? line.item_code,
        created_by: actor,
      });
      reserved += reserveQty;
    }

    const { data: updated, error: updateError } = await supabase
      .from("ic_job_summaries")
      .update({ status: "confirmed", confirmed_at: now, updated_at: now })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    await supabase.from("ic_activity_log").insert({
      entity_type: "job",
      entity_id: summary.job_id,
      action: "summary_confirmed",
      actor_id: actor,
      changes: { reserved, summary_id: id },
    });
    await stampJobFirst(summary.job_id, "ordered_at");

    const { data: nextLines } = await supabase
      .from("ic_job_summary_lines")
      .select("*")
      .eq("summary_id", id)
      .order("line_no", { ascending: true });
    return NextResponse.json({ ok: true, reserved, summary: { ...updated, lines: nextLines ?? [] } });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
