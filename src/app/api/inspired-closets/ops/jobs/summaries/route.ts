import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import { syncDropshipReceivingFromSummary } from "@/lib/inspired-closets-ops-dropship-receiving";
import {
  missingSummaryTable,
  parsedProductSummaryFromUnknown,
  parseProductSummary,
  persistJobProductSummary,
} from "@/lib/inspired-closets-ops-product-summary";

export const runtime = "nodejs";
export const maxDuration = 300;

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_job_summaries")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) {
    if (missingSummaryTable(error.message)) {
      return NextResponse.json({
        ok: true,
        summaries: [],
        hint: "Run drizzle/0023_ic_job_summaries.sql in Supabase.",
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((row) => row.id);
  const { data: lines } = ids.length
    ? await supabase.from("ic_job_summary_lines").select("*").in("summary_id", ids)
    : { data: [] };
  const bySummary = new Map<string, typeof lines>();
  for (const line of lines ?? []) {
    const list = bySummary.get(line.summary_id) ?? [];
    list.push(line);
    bySummary.set(line.summary_id, list);
  }

  return NextResponse.json({
    ok: true,
    summaries: (data ?? []).map((row) => ({
      ...row,
      lines: bySummary.get(row.id) ?? [],
    })),
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const form = await request.formData();
  const jobId = String(form.get("job_id") ?? "");
  const file = form.get("file");
  if (!jobId || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "job_id and file are required." }, { status: 400 });
  }

  const actor = await actorId();
  const supabase = getSupabaseAdmin();
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `summaries/${jobId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, buffer, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Upload failed: ${uploadError.message}. Confirm storage bucket ic-field-media exists.`,
      },
      { status: 500 },
    );
  }
  const { data: pub } = supabase.storage.from("ic-field-media").getPublicUrl(path);

  let parsed;
  const parsedField = form.get("parsed");
  try {
    if (typeof parsedField === "string" && parsedField.trim()) {
      parsed = parsedProductSummaryFromUnknown(JSON.parse(parsedField), file.name);
    } else {
      parsed = await parseProductSummary({
        filename: file.name,
        mimeType: file.type || "application/pdf",
        bytes: buffer,
      });
    }
  } catch (error) {
    await supabase.storage.from("ic-field-media").remove([path]);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not read product summary.",
      },
      { status: 500 },
    );
  }

  let saved;
  try {
    saved = await persistJobProductSummary({
      jobId,
      filename: file.name,
      storagePath: path,
      publicUrl: pub.publicUrl,
      parsed,
      actorId: actor,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save summary.";
    if (missingSummaryTable(message)) {
      return NextResponse.json(
        { ok: false, error: "Run drizzle/0023_ic_job_summaries.sql in Supabase." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const summary = saved.summary;
  const matched = saved.lines;

  let dropship: Awaited<ReturnType<typeof syncDropshipReceivingFromSummary>> | null = null;
  let dropship_error: string | null = null;
  try {
    dropship = await syncDropshipReceivingFromSummary({
      jobId,
      summaryId: String(summary.id),
      orderName: parsed.order_name,
      soNumber: parsed.so_number,
      shipDate: parsed.ship_date,
      lines: matched.map((line) => ({
        item_code: line.item_code,
        description: line.description,
        product_type: line.product_type,
        qty: line.qty,
      })),
      actorId: actor,
    });
  } catch (error) {
    dropship_error = error instanceof Error ? error.message : "Could not add catalog lines to Receiving.";
  }

  return NextResponse.json({
    ok: true,
    summary: { ...summary, lines: matched },
    dropship,
    dropship_error,
  });
}
