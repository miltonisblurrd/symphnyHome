import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { hashPassword } from "@/lib/inspired-closets-field-auth";

export const runtime = "nodejs";

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
  const password = typeof body.password === "string" ? body.password : "";
  if (!id || password.length < 6) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: staff, error: findError } = await supabase
    .from("ic_staff")
    .select("id, name, role")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  if (!staff || staff.role !== "designer") {
    return NextResponse.json({ ok: false, error: "That person is not a designer." }, { status: 404 });
  }

  const { error } = await supabase
    .from("ic_staff")
    .update({
      password_hash: await hashPassword(password),
      active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const username = (staff.name.trim().split(/\s+/)[0] ?? staff.name).toLowerCase();
  return NextResponse.json({ ok: true, username });
}
