import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/db/client";
import {
  createFieldSessionToken,
  readFieldSessionToken,
} from "@/lib/inspired-closets-field-auth";
import { IC_STAFF_ID_COOKIE, IC_STAFF_ROLE_COOKIE } from "@/lib/inspired-closets-ops-field";

export const IC_DESIGNER_SESSION_COOKIE = "ic-designer-session";

export type DesignerSession = {
  id: string;
  name: string;
  role: string;
};

const SESSION_DAYS = 30;

const COOKIE_BASE = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export function applyDesignerSession(
  response: NextResponse,
  designer: { id: string },
): NextResponse {
  response.cookies.set(IC_DESIGNER_SESSION_COOKIE, createFieldSessionToken(designer.id), {
    ...COOKIE_BASE,
    httpOnly: true,
  });
  return response;
}

export function clearDesignerSession(response: NextResponse): NextResponse {
  response.cookies.set(IC_DESIGNER_SESSION_COOKIE, "", {
    ...COOKIE_BASE,
    httpOnly: true,
    maxAge: 0,
  });
  return response;
}

export async function getDesigner(): Promise<DesignerSession | null> {
  const jar = await cookies();
  const fromSession = readFieldSessionToken(jar.get(IC_DESIGNER_SESSION_COOKIE)?.value);
  const role = jar.get(IC_STAFF_ROLE_COOKIE)?.value;
  const staffId =
    fromSession || (role === "designer" ? jar.get(IC_STAFF_ID_COOKIE)?.value ?? null : null);
  if (!staffId) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ic_staff")
    .select("id, name, role, active")
    .eq("id", staffId)
    .maybeSingle();
  if (!data?.active || data.role !== "designer") return null;
  return { id: data.id, name: data.name, role: data.role };
}
