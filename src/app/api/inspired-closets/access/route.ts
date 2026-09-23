import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  INSPIRED_CLOSETS_ACCESS_COOKIE,
  createInspiredClosetsAccessToken,
  getExpectedInspiredClosetsAccessToken,
  isInspiredClosetsAccessEnabled,
} from "@/lib/inspired-closets-access";
import { verifyPassword } from "@/lib/inspired-closets-field-auth";
import {
  IC_STAFF_ID_COOKIE,
  IC_STAFF_NAME_COOKIE,
  IC_STAFF_ROLE_COOKIE,
} from "@/lib/inspired-closets-ops-field";
import { roleHomePath, staffMatchesLoginId } from "@/lib/inspired-closets-ops-roles";
import { applyDesignerSession } from "@/lib/inspired-closets-designer-auth";

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

  // Office staff login (Frank, later Des/Craig/Lulu)
  if (username && isDbConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: staffRows, error } = await supabase
      .from("ic_staff")
      .select("id, name, role, email, active, password_hash")
      .eq("active", true)
      .is("deleted_at", null)
      .neq("role", "installer");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const match = (staffRows ?? []).find((row) => staffMatchesLoginId(row, username));
    if (match) {
      if (!match.password_hash) {
        return NextResponse.json(
          { error: "Ask Milton to set your office password first." },
          { status: 403 },
        );
      }
      const ok = await verifyPassword(password, match.password_hash);
      if (!ok) {
        return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
      }

      const home = roleHomePath(match.role);
      const response = NextResponse.json({
        ok: true,
        mode: "staff",
        staff: { id: match.id, name: match.name, role: match.role },
        redirectTo: home,
      });
      await applyAccessCookie(response);
      setStaffCookies(response, match);
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
      redirectTo: "/inspired-closets/gavin",
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
    redirectTo: "/inspired-closets/gavin",
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
