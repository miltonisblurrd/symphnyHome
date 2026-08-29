import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  applyFieldSession,
  clearFieldSession,
  normalizePhone,
  phonesMatch,
  verifyPassword,
} from "@/lib/inspired-closets-field-auth";
import { getFieldInstaller } from "@/lib/inspired-closets-field-auth-server";
import { ensureFieldTestWorld, FIELD_TEST_PHONE } from "@/lib/inspired-closets-field-test-seed";

export const runtime = "nodejs";

export async function GET() {
  const installer = await getFieldInstaller();
  if (!installer) {
    return NextResponse.json({ ok: true, installer: null });
  }
  return NextResponse.json({ ok: true, installer });
}

async function signInAs(row: {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  title: string | null;
}) {
  const installer = {
    id: row.id,
    name: row.name,
    role: row.role,
    phone: row.phone,
    title: row.title,
  };
  const response = NextResponse.json({ ok: true, installer, test: row.phone === FIELD_TEST_PHONE });
  return applyFieldSession(response, installer);
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

  if (body.test === true) {
    try {
      const installer = await ensureFieldTestWorld();
      return signInAs(installer);
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Test login failed." },
        { status: 500 },
      );
    }
  }

  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  const password = typeof body.password === "string" ? body.password : "";
  if (phone.length < 10 || !password) {
    return NextResponse.json(
      { ok: false, error: "Enter your phone number and password." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: staff, error } = await supabase
    .from("ic_staff")
    .select("id, name, role, phone, title, active, password_hash")
    .eq("active", true)
    .is("deleted_at", null);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const match = (staff ?? []).find((row) => phonesMatch(row.phone, phone));
  if (!match) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No installer has that phone. Open Install Workers → their file → app login, save this number and a password, then use the same pair here.",
      },
      { status: 401 },
    );
  }
  if (match.role !== "installer") {
    return NextResponse.json(
      { ok: false, error: "That phone belongs to the office, not Field." },
      { status: 403 },
    );
  }
  if (!match.password_hash) {
    return NextResponse.json(
      { ok: false, error: "Ask the office to set your Field password first." },
      { status: 403 },
    );
  }
  const ok = await verifyPassword(password, match.password_hash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "That password doesn’t match this phone." }, { status: 401 });
  }

  return signInAs(match);
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  return clearFieldSession(response);
}
