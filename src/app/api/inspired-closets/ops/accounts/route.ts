import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  ACCOUNT_KINDS,
  PARTNER_TYPES,
  isMissingRelationError,
  type IcAccountKind,
} from "@/lib/inspired-closets-ops-accounts";
import { IC_STAFF_ID_COOKIE, IC_STAFF_NAME_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

const VALID_KIND = new Set<string>(ACCOUNT_KINDS.map((k) => k.id));
const VALID_PARTNER = new Set<string>(PARTNER_TYPES.map((t) => t.id));

async function actor(): Promise<{ id: string | null; name: string | null }> {
  const cookieStore = await cookies();
  return {
    id: cookieStore.get(IC_STAFF_ID_COOKIE)?.value ?? null,
    name: cookieStore.get(IC_STAFF_NAME_COOKIE)?.value ?? null,
  };
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("ic_accounts")
    .select("*")
    .is("deleted_at", null)
    .order("name");

  if (kind && VALID_KIND.has(kind)) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) {
      return NextResponse.json({
        ok: true,
        accounts: [],
        kinds: ACCOUNT_KINDS,
        partnerTypes: PARTNER_TYPES,
        missingTable: true,
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    accounts: data ?? [],
    kinds: ACCOUNT_KINDS,
    partnerTypes: PARTNER_TYPES,
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "Account name is required." }, { status: 400 });
  }

  const kind: IcAccountKind =
    typeof body.kind === "string" && VALID_KIND.has(body.kind)
      ? (body.kind as IcAccountKind)
      : "partner";
  const partnerType =
    typeof body.partner_type === "string" && VALID_PARTNER.has(body.partner_type)
      ? body.partner_type
      : null;

  const supabase = getSupabaseAdmin();
  const { id: actorId, name: actorName } = await actor();

  const { data, error } = await supabase
    .from("ic_accounts")
    .insert({
      name,
      kind,
      partner_type: kind === "partner" ? partnerType : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Could not save account. Run drizzle/0016_ic_accounts.sql in Supabase.",
      },
      { status: 500 },
    );
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "account",
    entity_id: data.id,
    action: "created",
    actor_id: actorId,
    actor_label: actorName,
    changes: { name, kind, partner_type: partnerType },
  });

  return NextResponse.json({ ok: true, account: data });
}

export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { id: actorId } = await actor();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  };

  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.kind === "string" && VALID_KIND.has(body.kind)) updates.kind = body.kind;
  if (typeof body.partner_type === "string" || body.partner_type === null) {
    updates.partner_type =
      body.partner_type === null || VALID_PARTNER.has(String(body.partner_type))
        ? body.partner_type
        : undefined;
  }
  if (typeof body.phone === "string" || body.phone === null) {
    updates.phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  }
  if (typeof body.email === "string" || body.email === null) {
    updates.email = typeof body.email === "string" ? body.email.trim() || null : null;
  }
  if (typeof body.notes === "string" || body.notes === null) {
    updates.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if (body.deleted === true) updates.deleted_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("ic_accounts")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Could not update account." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, account: data });
}
