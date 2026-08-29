import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";
import { insertFieldNotice, notifyPtoRequest } from "@/lib/inspired-closets-field-home";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_time_off")
    .select("id, kind, start_date, end_date, note, status, created_at, decided_at")
    .eq("installer_id", auth.installer.id)
    .order("start_date", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, timeOff: data ?? [] });
}

export async function POST(request: Request) {
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

  const kind = body.kind === "sick" ? "sick" : "pto";
  const startDate = typeof body.start_date === "string" ? body.start_date.slice(0, 10) : "";
  const endDate = typeof body.end_date === "string" ? body.end_date.slice(0, 10) : startDate;
  const note = typeof body.note === "string" ? body.note.trim() : null;
  if (!startDate || !endDate) {
    return NextResponse.json({ ok: false, error: "Pick a start and end date." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ ok: false, error: "End date is before start date." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_time_off")
    .insert({
      installer_id: auth.installer.id,
      kind,
      start_date: startDate,
      end_date: endDate,
      note,
      status: "requested",
    })
    .select("id, kind, start_date, end_date, note, status, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Could not save request." }, { status: 500 });
  }

  await insertFieldNotice({
    installerId: auth.installer.id,
    kind: "pto",
    title: `${kind === "sick" ? "Sick" : "PTO"} requested`,
    body: `${startDate === endDate ? startDate : `${startDate} → ${endDate}`}. Sent to Gavin.`,
    relatedId: data.id,
  });
  await notifyPtoRequest({
    installerName: auth.installer.name,
    kind,
    startDate,
    endDate,
    note,
    requestId: data.id,
  });

  return NextResponse.json({ ok: true, timeOff: data });
}
