import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const [{ data: timeOff, error }, { data: staff }] = await Promise.all([
    supabase
      .from("ic_time_off")
      .select("id, installer_id, kind, start_date, end_date, note, status, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("ic_staff").select("id, name").eq("role", "installer"),
  ]);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const names = new Map((staff ?? []).map((s) => [s.id, s.name]));
  return NextResponse.json({
    ok: true,
    timeOff: (timeOff ?? []).map((row) => ({
      ...row,
      installerName: names.get(row.installer_id) ?? "Installer",
    })),
  });
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
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "denied" ? "denied" : body.decision === "approved" ? "approved" : "";
  if (!id || !decision) {
    return NextResponse.json({ ok: false, error: "id and decision are required." }, { status: 400 });
  }
  const origin = new URL(request.url).origin;
  const { createActionToken } = await import("@/lib/inspired-closets-field-auth");
  const token = createActionToken("pto", id, decision);
  const target = `${origin}/api/inspired-closets/ops/field-decide?token=${encodeURIComponent(token)}`;
  const res = await fetch(target);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Could not update request." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, decision });
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
  const id = typeof body.id === "string" ? body.id : "";
  const lastPayCents =
    typeof body.last_pay_cents === "number"
      ? body.last_pay_cents
      : typeof body.last_pay_dollars === "string"
        ? Math.round(Number(body.last_pay_dollars.replace(/[$,]/g, "")) * 100)
        : undefined;
  const lastPayDate = typeof body.last_pay_date === "string" ? body.last_pay_date : undefined;
  const nextPayDate = typeof body.next_pay_date === "string" ? body.next_pay_date : undefined;
  const classification = typeof body.classification === "string" ? body.classification : undefined;
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from("ic_staff_pay").select("*").eq("staff_id", id).maybeSingle();
  const row = {
    staff_id: id,
    updated_at: new Date().toISOString(),
    last_pay_cents: lastPayCents ?? existing?.last_pay_cents ?? 0,
    last_pay_date: lastPayDate ?? existing?.last_pay_date ?? null,
    next_pay_date: nextPayDate ?? existing?.next_pay_date ?? null,
    classification: classification ?? existing?.classification ?? null,
    bank_last4: existing?.bank_last4 ?? null,
    routing_last4: existing?.routing_last4 ?? null,
    bank_status: existing?.bank_status ?? "none",
    bank_updated_at: existing?.bank_updated_at ?? null,
    home_address: existing?.home_address ?? null,
    emergency_name: existing?.emergency_name ?? null,
    emergency_phone: existing?.emergency_phone ?? null,
    emergency_relation: existing?.emergency_relation ?? null,
    truck_label: existing?.truck_label ?? null,
  };
  const { data, error } = await supabase.from("ic_staff_pay").upsert(row, { onConflict: "staff_id" }).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pay: data });
}
