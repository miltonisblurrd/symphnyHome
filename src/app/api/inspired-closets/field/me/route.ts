import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";
import { insertFieldNotice, notifyBankChange } from "@/lib/inspired-closets-field-home";

export const runtime = "nodejs";

function last4(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.slice(-4);
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("ic_staff_pay").select("*").eq("staff_id", auth.installer.id).maybeSingle();
  return NextResponse.json({ ok: true, pay: data ?? null, installer: auth.installer });
}

export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("ic_staff_pay")
    .select("*")
    .eq("staff_id", auth.installer.id)
    .maybeSingle();

  const row: Record<string, unknown> = {
    staff_id: auth.installer.id,
    updated_at: new Date().toISOString(),
    home_address:
      typeof body.home_address === "string" ? body.home_address.trim() : existing?.home_address ?? null,
    emergency_name:
      typeof body.emergency_name === "string" ? body.emergency_name.trim() : existing?.emergency_name ?? null,
    emergency_phone:
      typeof body.emergency_phone === "string" ? body.emergency_phone.trim() : existing?.emergency_phone ?? null,
    emergency_relation:
      typeof body.emergency_relation === "string"
        ? body.emergency_relation.trim()
        : existing?.emergency_relation ?? null,
    truck_label: typeof body.truck_label === "string" ? body.truck_label.trim() : existing?.truck_label ?? null,
    classification: existing?.classification ?? null,
    last_pay_cents: existing?.last_pay_cents ?? 0,
    last_pay_date: existing?.last_pay_date ?? null,
    next_pay_date: existing?.next_pay_date ?? null,
    bank_last4: existing?.bank_last4 ?? null,
    routing_last4: existing?.routing_last4 ?? null,
    bank_status: existing?.bank_status ?? "none",
    bank_updated_at: existing?.bank_updated_at ?? null,
  };

  if (typeof body.account_number === "string" && body.account_number.replace(/\D/g, "").length >= 4) {
    const routing = typeof body.routing_number === "string" ? body.routing_number : "";
    row.bank_last4 = last4(body.account_number);
    row.routing_last4 = last4(routing);
    row.bank_status = "sent_to_lulu";
    row.bank_updated_at = new Date().toISOString();
    await notifyBankChange({
      installerName: auth.installer.name,
      last4: String(row.bank_last4),
      routingLast4: String(row.routing_last4 || "—"),
    });
    await insertFieldNotice({
      installerId: auth.installer.id,
      kind: "pay",
      title: "Deposit details sent to Lulu",
      body: `Account last 4 ${row.bank_last4}. Lulu will enter this in QuickBooks.`,
    });
  }

  const { data, error } = await supabase
    .from("ic_staff_pay")
    .upsert(row, { onConflict: "staff_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pay: data });
}
