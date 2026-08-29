import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/db/client";
import {
  IC_FIELD_SESSION_COOKIE,
  readFieldSessionToken,
  type FieldInstaller,
} from "@/lib/inspired-closets-field-auth";

export async function getFieldInstaller(): Promise<FieldInstaller | null> {
  const jar = await cookies();
  const staffId = readFieldSessionToken(jar.get(IC_FIELD_SESSION_COOKIE)?.value);
  if (!staffId) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ic_staff")
    .select("id, name, role, phone, title, active")
    .eq("id", staffId)
    .maybeSingle();
  if (!data || !data.active || data.role !== "installer") return null;
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    phone: data.phone,
    title: data.title,
  };
}

export async function requireFieldInstaller(): Promise<
  { ok: true; installer: FieldInstaller } | { ok: false; response: NextResponse }
> {
  const installer = await getFieldInstaller();
  if (!installer) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Sign in to Field first." }, { status: 401 }),
    };
  }
  return { ok: true, installer };
}
