import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { missingReceivingTable, notifyReceiving } from "@/lib/inspired-closets-ops-receiving";

const CLAIM_TYPES = new Set(["DAMAGED", "MISSING", "DEFECTIVE", "WRONG", "CREDIT"]);

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const shipmentId = new URL(request.url).searchParams.get("shipmentId");
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ic_shipment_claims")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (shipmentId) query = query.eq("shipment_id", shipmentId);
  const { data, error } = await query;
  if (error) {
    if (missingReceivingTable(error.message)) {
      return NextResponse.json({ ok: true, claims: [], pending: 0 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const claims = data ?? [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const claim of claims) {
    if (claim.status !== "draft") continue;
    if (new Date(String(claim.created_at ?? 0)).getTime() > cutoff) continue;
    await notifyReceiving({
      title: "Claim still open",
      message: `${claim.claim_type ?? "Claim"} has been sitting for a day. ${claim.description ?? ""}`.trim(),
      severity: "warn",
    });
    await supabase
      .from("ic_shipment_claims")
      .update({ status: "draft_notified", updated_at: new Date().toISOString() })
      .eq("id", claim.id);
    claim.status = "draft_notified";
  }
  const pending = claims.filter((claim) =>
    ["draft", "draft_notified"].includes(String(claim.status)),
  ).length;
  const itemIds = [...new Set(claims.map((claim) => claim.item_id).filter(Boolean))];
  const { data: itemRows } = itemIds.length
    ? await supabase.from("ic_shipment_items").select("id, so_number, item_number").in("id", itemIds)
    : { data: [] };
  const itemById = new Map((itemRows ?? []).map((row) => [String(row.id), row]));
  return NextResponse.json({
    ok: true,
    pending,
    claims: claims.map((claim) => ({
      ...claim,
      so_number: itemById.get(String(claim.item_id ?? ""))?.so_number ?? null,
      item_number: itemById.get(String(claim.item_id ?? ""))?.item_number ?? null,
    })),
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const form = await request.formData();
  const shipmentId = String(form.get("shipment_id") ?? "");
  const itemId = String(form.get("item_id") ?? "");
  const claimType = String(form.get("claim_type") ?? "DAMAGED").toUpperCase();
  if (!shipmentId || !CLAIM_TYPES.has(claimType)) {
    return NextResponse.json({ ok: false, error: "shipment_id and a claim type are required." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const urls: string[] = [];
  const files = form.getAll("photos").filter((file): file is File => file instanceof File).slice(0, 5);
  for (const file of files) {
    const path = `claims/${shipmentId}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage.from("ic-field-media").upload(path, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) continue;
    urls.push(supabase.storage.from("ic-field-media").getPublicUrl(path).data.publicUrl);
  }
  const { data, error } = await supabase
    .from("ic_shipment_claims")
    .insert({
      shipment_id: shipmentId,
      item_id: itemId || null,
      claim_type: claimType,
      description: String(form.get("description") ?? "").trim() || claimType,
      damaged_qty: Math.max(1, Number(form.get("qty") ?? 1) || 1),
      photo_url: urls.length ? JSON.stringify(urls) : null,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, claim: data });
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
  const { data, error } = await supabase
    .from("ic_shipment_claims")
    .update({
      status: typeof body.status === "string" ? body.status : "submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, claim: data });
}
