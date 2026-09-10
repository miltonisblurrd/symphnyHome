import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  attachStowSalesOrder,
  getJobSalesOrders,
  missingStowSalesOrderTable,
} from "@/lib/inspired-closets-ops-stow-sales-order";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");
  const supabase = getSupabaseAdmin();

  try {
    if (jobId) {
      const orders = await getJobSalesOrders(jobId);
      return NextResponse.json({ ok: true, orders });
    }

    let query = supabase
      .from("ic_stow_sales_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, orders: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sales orders.";
    if (missingStowSalesOrderTable(message)) {
      return NextResponse.json({
        ok: true,
        orders: [],
        hint: "Run drizzle/0024_ic_stow_sales_orders.sql in Supabase.",
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const orderId = typeof body.id === "string" ? body.id : "";
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  if (!orderId || !jobId) {
    return NextResponse.json({ ok: false, error: "id and job_id are required." }, { status: 400 });
  }

  try {
    const order = await attachStowSalesOrder({ orderId, jobId });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not attach.";
    if (missingStowSalesOrderTable(message)) {
      return NextResponse.json(
        { ok: false, error: "Run drizzle/0024_ic_stow_sales_orders.sql in Supabase." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
