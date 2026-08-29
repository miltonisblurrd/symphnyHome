import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE, IC_STAFF_NAME_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_company_updates")
    .select("id, title, body, author_name, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updates: data ?? [] });
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
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!title || !text) {
    return NextResponse.json({ ok: false, error: "Title and message are required." }, { status: 400 });
  }
  const jar = await cookies();
  const authorName = jar.get(IC_STAFF_NAME_COOKIE)?.value?.trim() || "Office";
  const rawAuthorId = jar.get(IC_STAFF_ID_COOKIE)?.value ?? "";
  const authorId = /^[0-9a-f-]{36}$/i.test(rawAuthorId) ? rawAuthorId : null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_company_updates")
    .insert({ title, body: text, author_name: authorName, author_id: authorId })
    .select("id, title, body, author_name, created_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, update: data });
}
