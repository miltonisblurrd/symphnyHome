import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { missingReceivingTable } from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const shipmentId = new URL(request.url).searchParams.get("shipmentId");
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_shipment_claims")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (shipmentId) query = query.eq("shipment_id", shipmentId);
  const { data, error } = await query;
  if (error) {
    if (missingReceivingTable(error.message)) {
      return NextResponse.json({ ok: true, claims: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, claims: data ?? [] });
}

export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_shipment_claims")
    .update({
      status: typeof body.status === "string" ? body.status : "submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, claim: data });
}
