import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_notifications")
    .select("id, job_id, kind, title, body, severity, created_at, read_at")
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (/ic_notifications|schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: true, notifications: [], hint: "Run drizzle/0030_ic_job_scheduling_readiness.sql." });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, notifications: data ?? [] });
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
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  if (body.all_read === true) {
    const { error } = await supabase
      .from("ic_notifications")
      .update({ read_at: now })
      .is("read_at", null)
      .is("dismissed_at", null);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  const { error } = await supabase
    .from("ic_notifications")
    .update(body.read === false ? { read_at: null } : { read_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
