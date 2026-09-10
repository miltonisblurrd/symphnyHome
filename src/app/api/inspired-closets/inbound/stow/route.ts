import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import {
  ingestStowSalesOrder,
  missingStowSalesOrderTable,
} from "@/lib/inspired-closets-ops-stow-sales-order";

export const runtime = "nodejs";
export const maxDuration = 120;

function webhookSecret(): string | null {
  return process.env.INSPIRED_CLOSETS_STOW_WEBHOOK_SECRET?.trim() || null;
}

function authorized(request: Request): boolean {
  const expected = webhookSecret();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = request.headers.get("x-stow-webhook-secret")?.trim() ?? "";
  return bearer === expected || alt === expected;
}

async function readPayload(request: Request): Promise<
  | {
      from: string;
      subject: string;
      filename: string;
      mimeType: string;
      bytes: Buffer;
      messageId: string | null;
    }
  | { error: string }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "file is required." };
    return {
      from: String(form.get("from") ?? ""),
      subject: String(form.get("subject") ?? ""),
      filename: String(form.get("filename") ?? file.name ?? "order.pdf"),
      mimeType: file.type || "application/pdf",
      bytes: Buffer.from(await file.arrayBuffer()),
      messageId: String(form.get("message_id") ?? "") || null,
    };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { error: "Expected JSON or multipart form data." };
  }
  const raw = typeof body.file_base64 === "string" ? body.file_base64 : "";
  const stripped = raw.replace(/^data:application\/pdf;base64,/, "");
  if (!stripped) return { error: "file_base64 is required." };
  return {
    from: String(body.from ?? ""),
    subject: String(body.subject ?? ""),
    filename: String(body.filename ?? "order.pdf"),
    mimeType: String(body.mime_type ?? "application/pdf"),
    bytes: Buffer.from(stripped, "base64"),
    messageId: typeof body.message_id === "string" ? body.message_id : null,
  };
}

export async function POST(request: Request) {
  if (!webhookSecret()) {
    return NextResponse.json(
      { ok: false, error: "INSPIRED_CLOSETS_STOW_WEBHOOK_SECRET is not set." },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const payload = await readPayload(request);
  if ("error" in payload) {
    return NextResponse.json({ ok: false, error: payload.error }, { status: 400 });
  }

  try {
    const result = await ingestStowSalesOrder(payload);
    return NextResponse.json({
      ok: result.ok,
      skipped: result.skipped ?? false,
      order: result.order,
      error: result.error ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed.";
    if (missingStowSalesOrderTable(message)) {
      return NextResponse.json(
        { ok: false, error: "Run drizzle/0024_ic_stow_sales_orders.sql in Supabase." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
