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
import { ensureFieldTestWorld, FIELD_TEST_PHONE, isFieldTestInstaller } from "@/lib/inspired-closets-field-test-seed";

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

  const loginRaw =
    (typeof body.login === "string" ? body.login : "") ||
    (typeof body.phone === "string" ? body.phone : "");
  const login = loginRaw.trim();
  const phone = normalizePhone(login);
  const password = typeof body.password === "string" ? body.password : "";
  const phoneOnly = phone.length >= 10 && !/[a-z]/i.test(login);
  if ((!phoneOnly && login.length < 3) || !password) {
    return NextResponse.json(
      { ok: false, error: "Enter your name or phone and a password." },
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

  const rows = staff ?? [];
  const phoneHits = phoneOnly ? rows.filter((row) => phonesMatch(row.phone, phone)) : [];
  const nameHits = phoneOnly
    ? []
    : rows.filter((row) => {
        if (row.role !== "installer" || isFieldTestInstaller(row)) return false;
        const full = row.name.trim().toLowerCase();
        const id = login.toLowerCase();
        if (full === id) return true;
        const first = full.split(/\s+/)[0] ?? "";
        return first === id;
      });
  const exactName = nameHits.filter((row) => row.name.trim().toLowerCase() === login.toLowerCase());
  const match = phoneHits[0] ?? (exactName.length === 1 ? exactName[0] : nameHits.length === 1 ? nameHits[0] : null);

  if (phoneHits.length > 1 || (!phoneOnly && nameHits.length > 1 && exactName.length !== 1)) {
    return NextResponse.json(
      { ok: false, error: "More than one installer matches. Sign in with your full name." },
      { status: 401 },
    );
  }
  if (!match) {
    return NextResponse.json(
      {
        ok: false,
        error: phoneOnly
          ? "No installer has that phone. Open Install Workers → their file → app login, save this number and a password, then use the same pair here."
          : "No installer matches that name. Use the name on your file, or the phone saved under app login.",
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
    return NextResponse.json({ ok: false, error: "That password doesn’t match." }, { status: 401 });
  }

  return signInAs(match);
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  return clearFieldSession(response);
}
