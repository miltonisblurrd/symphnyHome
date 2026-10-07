import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  INSPIRED_CLOSETS_ACCESS_COOKIE,
  createInspiredClosetsAccessToken,
  getExpectedInspiredClosetsAccessToken,
  isInspiredClosetsAccessEnabled,
} from "@/lib/inspired-closets-access";
import {
  applyFieldSession,
  clearFieldSession,
  normalizePhone,
  phonesMatch,
  verifyPassword,
} from "@/lib/inspired-closets-field-auth";
import { isFieldTestInstaller } from "@/lib/inspired-closets-field-test-seed";
import {
  IC_STAFF_ID_COOKIE,
  IC_STAFF_NAME_COOKIE,
  IC_STAFF_ROLE_COOKIE,
} from "@/lib/inspired-closets-ops-field";
import { IC_OPS_HOME, roleHomePath, staffMatchesLoginId } from "@/lib/inspired-closets-ops-roles";
import { applyDesignerSession, clearDesignerSession } from "@/lib/inspired-closets-designer-auth";

export const runtime = "nodejs";

const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
};

const STAFF_COOKIE_OPTS = {
  httpOnly: false, // client needs role for nav filtering (same as ops session)
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

function clearStaffCookies(response: NextResponse) {
  const gone = { ...STAFF_COOKIE_OPTS, maxAge: 0 };
  response.cookies.set(IC_STAFF_ID_COOKIE, "", gone);
  response.cookies.set(IC_STAFF_ROLE_COOKIE, "", gone);
  response.cookies.set(IC_STAFF_NAME_COOKIE, "", gone);
  clearDesignerSession(response);
  clearFieldSession(response);
}

type StaffLoginRow = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  workbook_tab: string | null;
  phone: string | null;
  title: string | null;
  password_hash: string | null;
};

function matchInstaller(rows: StaffLoginRow[], login: string): { match: StaffLoginRow | null; error?: string } {
  const phone = normalizePhone(login);
  const phoneOnly = phone.length >= 10 && !/[a-z]/i.test(login);
  const installers = rows.filter((row) => row.role === "installer" && !isFieldTestInstaller(row));
  if (phoneOnly) {
    const hits = installers.filter((row) => phonesMatch(row.phone, phone));
    if (hits.length > 1) {
      return { match: null, error: "More than one installer matches. Sign in with your full name." };
    }
    return { match: hits[0] ?? null };
  }
  const nameHits = installers.filter((row) => {
    const full = row.name.trim().toLowerCase();
    const id = login.toLowerCase();
    if (full === id) return true;
    return (full.split(/\s+/)[0] ?? "") === id;
  });
  const exact = nameHits.filter((row) => row.name.trim().toLowerCase() === login.toLowerCase());
  if (nameHits.length > 1 && exact.length !== 1) {
    return { match: null, error: "More than one installer matches. Sign in with your full name." };
  }
  return { match: exact[0] ?? nameHits[0] ?? null };
}

function setStaffCookies(
  response: NextResponse,
  staff: { id: string; name: string; role: string },
) {
  response.cookies.set(IC_STAFF_ID_COOKIE, staff.id, STAFF_COOKIE_OPTS);
  response.cookies.set(IC_STAFF_ROLE_COOKIE, staff.role, STAFF_COOKIE_OPTS);
  response.cookies.set(IC_STAFF_NAME_COOKIE, staff.name, STAFF_COOKIE_OPTS);
}

async function applyAccessCookie(response: NextResponse) {
  if (!isInspiredClosetsAccessEnabled()) return;
  const token = await getExpectedInspiredClosetsAccessToken();
  if (!token) return;
  response.cookies.set({
    name: INSPIRED_CLOSETS_ACCESS_COOKIE,
    value: token,
    ...ACCESS_COOKIE_OPTS,
  });
}

export async function POST(request: Request) {
  let body: { password?: string; username?: string; login?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const password = body.password?.trim() ?? "";
  const username = (body.username ?? body.login ?? "").trim();

  if (!password) {
    return NextResponse.json({ error: "Enter a password." }, { status: 400 });
  }

  // Office staff login (Frank, Craig, later Des/Lulu)
  if (username && isDbConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: staffRows, error } = await supabase
      .from("ic_staff")
      .select("id, name, role, email, workbook_tab, phone, title, active, password_hash")
      .eq("active", true)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (staffRows ?? []) as StaffLoginRow[];
    const officeMatch = rows.find((row) => row.role !== "installer" && staffMatchesLoginId(row, username));
    const installerHit = officeMatch ? null : matchInstaller(rows, username);
    if (installerHit?.error) {
      return NextResponse.json({ error: installerHit.error }, { status: 401 });
    }
    const match = officeMatch ?? installerHit?.match ?? null;
    if (match) {
      if (!match.password_hash) {
        return NextResponse.json(
          { error: "Ask the office to set your password first." },
          { status: 403 },
        );
      }
      const ok = await verifyPassword(password, match.password_hash);
      if (!ok) {
        return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
      }

      const home = roleHomePath(match.role, match);
      const response = NextResponse.json({
        ok: true,
        mode: "staff",
        staff: { id: match.id, name: match.name, role: match.role },
        redirectTo: home,
      });
      if (match.role === "installer") {
        clearStaffCookies(response);
        applyFieldSession(response, {
          id: match.id,
          name: match.name,
          role: match.role,
          phone: match.phone,
          title: match.title,
        });
        return response;
      }
      await applyAccessCookie(response);
      setStaffCookies(response, match);
      clearFieldSession(response);
      if (match.role === "designer") applyDesignerSession(response, match);
      return response;
    }
    // Fall through: maybe password is the shared access code
  }

  // Shared prototype access code → full OS (clear any leftover staff session)
  if (!isInspiredClosetsAccessEnabled()) {
    const response = NextResponse.json({
      ok: true,
      mode: "prototype",
      redirectTo: IC_OPS_HOME,
    });
    clearStaffCookies(response);
    return response;
  }

  const token = await createInspiredClosetsAccessToken(password);
  if (!token) {
    return NextResponse.json(
      {
        error: username ? "Incorrect username or password." : "Incorrect password.",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    mode: "prototype",
    redirectTo: IC_OPS_HOME,
  });
  response.cookies.set({
    name: INSPIRED_CLOSETS_ACCESS_COOKIE,
    value: token,
    ...ACCESS_COOKIE_OPTS,
  });
  clearStaffCookies(response);
  return response;
}

export async function GET(request: Request) {
  if (!isInspiredClosetsAccessEnabled()) {
    return NextResponse.json({ enabled: false, authorized: true });
  }

  const cookie = request.headers.get("cookie") ?? "";
  const token = await getExpectedInspiredClosetsAccessToken();
  const authorized = Boolean(token && cookie.includes(`${INSPIRED_CLOSETS_ACCESS_COOKIE}=${token}`));
  return NextResponse.json({ enabled: true, authorized });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: INSPIRED_CLOSETS_ACCESS_COOKIE,
    value: "",
    ...ACCESS_COOKIE_OPTS,
    maxAge: 0,
  });
  clearStaffCookies(response);
  return response;
}
