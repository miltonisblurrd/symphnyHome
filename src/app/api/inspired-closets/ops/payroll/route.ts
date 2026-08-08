import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { gavinDemoMeta } from "@/data/inspired-closets-gavin-demo";

export const runtime = "nodejs";

const MARGIN_GATE_BP = Math.round(gavinDemoMeta.marginGate * 100);

const EDITABLE_FIELDS = new Set([
  "client_name",
  "entry_date",
  "contract_cents",
  "deposit_cents",
  "margin_starting_bp",
  "contract_after_spiff_cents",
  "margin_after_spiff_bp",
  "deposit_after_spiff_cents",
  "margin_final_bp",
  "commission_pct_bp",
  "check_cents",
  "pay_date",
  "status",
  "notes",
  "gate_override_reason",
]);

function bestMarginBp(row: {
  margin_final_bp: number | null;
  margin_after_spiff_bp: number | null;
  margin_starting_bp: number | null;
}): number | null {
  return row.margin_final_bp ?? row.margin_after_spiff_bp ?? row.margin_starting_bp ?? null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const designerId = searchParams.get("designerId");

  const supabase = getSupabaseAdmin();

  const [{ data: staff, error: staffError }, entriesResult] = await Promise.all([
    supabase
      .from("ic_staff")
      .select("id, name, role, workbook_tab, active")
      .is("deleted_at", null)
      .order("name"),
    (designerId
      ? supabase
          .from("ic_payroll_entries")
          .select("*")
          .eq("designer_id", designerId)
      : supabase.from("ic_payroll_entries").select("*")
    )
      .is("deleted_at", null)
      .order("entry_date", { ascending: false, nullsFirst: false })
      .limit(2000),
  ]);

  if (staffError) {
    return NextResponse.json({ ok: false, error: staffError.message }, { status: 500 });
  }
  if (entriesResult.error) {
    return NextResponse.json(
      { ok: false, error: entriesResult.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    marginGateBp: MARGIN_GATE_BP,
    staff: staff ?? [],
    entries: entriesResult.data ?? [],
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

  const designerId = typeof body.designer_id === "string" ? body.designer_id : null;
  const clientName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  if (!designerId || !clientName) {
    return NextResponse.json(
      { ok: false, error: "designer_id and client_name are required." },
      { status: 400 },
    );
  }

  const insert: Record<string, unknown> = { designer_id: designerId, client_name: clientName };
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_FIELDS.has(key)) insert[key] = value;
  }
  // App-created rows are marked as manually maintained so imports never clobber them.
  const actorId = typeof body.actor_id === "string" ? body.actor_id : null;
  if (actorId) {
    insert.created_by = actorId;
    insert.updated_by = actorId;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_payroll_entries")
    .insert(insert)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "payroll_entry",
    entity_id: data.id,
    action: "created",
    actor_id: actorId,
    actor_label: actorId ? null : "ops-app",
    changes: { client_name: clientName },
  });

  return NextResponse.json({ ok: true, entry: data });
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
  const { data: current, error: findError } = await supabase
    .from("ic_payroll_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ ok: false, error: "Entry not found." }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    if (current[key] === value) continue;
    update[key] = value;
    changes[key] = { from: current[key], to: value };
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, entry: current, unchanged: true });
  }

  // Enforce the 45% spiff gate: below-gate entries cannot become payable/paid
  // without an owner override reason.
  const merged = { ...current, ...update };
  const margin = bestMarginBp(merged);
  const targetStatus = merged.status as string;
  const belowGate = margin != null && margin < MARGIN_GATE_BP;
  if (
    belowGate &&
    (targetStatus === "payable" || targetStatus === "paid") &&
    !merged.gate_override_reason
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `Margin ${(margin / 100).toFixed(2)}% is below the ${MARGIN_GATE_BP / 100}% gate. An override reason is required to mark this payable or paid.`,
        requiresOverride: true,
      },
      { status: 422 },
    );
  }

  const actorId = typeof body.actor_id === "string" ? body.actor_id : null;
  update.updated_at = new Date().toISOString();
  if (actorId) update.updated_by = actorId;
  if (belowGate && merged.gate_override_reason && actorId) {
    update.gate_override_by = actorId;
  }

  const { data: updated, error: updateError } = await supabase
    .from("ic_payroll_entries")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "payroll_entry",
    entity_id: id,
    action: changes.status ? "status_changed" : "updated",
    actor_id: actorId,
    actor_label: actorId ? null : "ops-app",
    changes,
  });

  return NextResponse.json({ ok: true, entry: updated });
}
