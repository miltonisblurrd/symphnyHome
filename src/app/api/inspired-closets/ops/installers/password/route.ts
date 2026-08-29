import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { hashPassword, normalizePhone } from "@/lib/inspired-closets-field-auth";

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
  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  if (!id || password.length < 6) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }
  if (phone.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Save a 10-digit phone with the password. Field uses that number to sign in." },
      { status: 400 },
    );
  }
  const passwordHash = await hashPassword(password);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ic_staff")
    .update({
      password_hash: passwordHash,
      phone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, phone });
}
