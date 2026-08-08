import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  IC_STAFF_ID_COOKIE,
  IC_STAFF_NAME_COOKIE,
  IC_STAFF_ROLE_COOKIE,
} from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

const COOKIE_OPTS = {
  httpOnly: false, // client needs role for redirects; prototype only
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_staff")
    .select("id, name, role, active, phone")
    .is("deleted_at", null)
    .eq("active", true)
    .order("name");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    staff: data ?? [],
    installers: (data ?? []).filter((member) => member.role === "installer"),
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

  const supabase = getSupabaseAdmin();
  let staffId = typeof body.staff_id === "string" ? body.staff_id : null;
  const createName = typeof body.create_name === "string" ? body.create_name.trim() : "";
  const createRole = typeof body.role === "string" ? body.role : "installer";

  if (!staffId && createName) {
    const { data: created, error } = await supabase
      .from("ic_staff")
      .insert({ name: createName, role: createRole === "installer" ? "installer" : createRole })
      .select("id, name, role")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    staffId = created.id;
    const response = NextResponse.json({ ok: true, staff: created });
    response.cookies.set(IC_STAFF_ID_COOKIE, created.id, COOKIE_OPTS);
    response.cookies.set(IC_STAFF_ROLE_COOKIE, created.role, COOKIE_OPTS);
    response.cookies.set(IC_STAFF_NAME_COOKIE, created.name, COOKIE_OPTS);
    return response;
  }

  if (!staffId) {
    return NextResponse.json({ ok: false, error: "staff_id or create_name required." }, { status: 400 });
  }

  const { data: staff, error } = await supabase
    .from("ic_staff")
    .select("id, name, role, active")
    .eq("id", staffId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!staff || !staff.active) {
    return NextResponse.json({ ok: false, error: "Staff not found." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, staff });
  response.cookies.set(IC_STAFF_ID_COOKIE, staff.id, COOKIE_OPTS);
  response.cookies.set(IC_STAFF_ROLE_COOKIE, staff.role, COOKIE_OPTS);
  response.cookies.set(IC_STAFF_NAME_COOKIE, staff.name, COOKIE_OPTS);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(IC_STAFF_ID_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  response.cookies.set(IC_STAFF_ROLE_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  response.cookies.set(IC_STAFF_NAME_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  return response;
}
