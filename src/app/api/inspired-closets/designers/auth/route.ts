import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { verifyPassword } from "@/lib/inspired-closets-field-auth";
import {
  applyDesignerSession,
  clearDesignerSession,
  getDesigner,
} from "@/lib/inspired-closets-designer-auth";
import { staffMatchesLoginId } from "@/lib/inspired-closets-ops-roles";

export const runtime = "nodejs";

export async function GET() {
  const designer = await getDesigner();
  return NextResponse.json({ ok: true, designer });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Enter your name and password." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: staff, error } = await supabase
    .from("ic_staff")
    .select("id, name, role, email, active, password_hash")
    .eq("role", "designer")
    .eq("active", true)
    .is("deleted_at", null);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const match = (staff ?? []).find((row) => staffMatchesLoginId(row, username));
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "No designer login matches that name." },
      { status: 401 },
    );
  }
  if (!match.password_hash) {
    return NextResponse.json(
      { ok: false, error: "Ask the office to set your password first." },
      { status: 403 },
    );
  }
  const ok = await verifyPassword(password, match.password_hash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "That password doesn’t match." }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    designer: { id: match.id, name: match.name, role: match.role },
  });
  return applyDesignerSession(response, match);
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  return clearDesignerSession(response);
}
