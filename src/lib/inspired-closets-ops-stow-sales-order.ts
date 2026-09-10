/**
 * Stow sales-order emails from inspiredclosetslv@gmail.com.
 * Check document only — does not write Receiving or replace Frank's summary upload.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/db/client";
import { clientHintFromSlip } from "@/lib/inspired-closets-ops-receiving";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";

export const STOW_SENDER = "noreply@thestowcompany.com";

export type StowSalesOrderRow = {
  id: string;
  job_id: string | null;
  gmail_message_id: string | null;
  from_email: string | null;
  subject: string | null;
  so_number: string | null;
  order_name: string | null;
  ship_date: string | null;
  item_count: number;
  total_cents: number;
  source_filename: string | null;
  public_url: string | null;
  status: string;
  ignore_reason: string | null;
  parse_error: string | null;
  created_at: string;
};

export type StowSalesOrderLine = {
  id?: string;
  line_no: number | null;
  item_code: string;
  description: string | null;
  qty: number;
  total_cents: number;
};

export type StowCheckLine = {
  key: string;
  item_code: string;
  description: string | null;
  so_qty: number;
  summary_qty: number;
  slip_qty: number;
  result: "match" | "missing" | "extra" | "qty";
};

export type StowCheck = {
  waiting: boolean;
  lines: StowCheckLine[];
  missing: number;
  extra: number;
  qty: number;
  matched: number;
};

const OPEN_STAGES = new Set([
  "ordered",
  "job_check",
  "deposit_received",
  "install_scheduled",
  "quoted",
  "sold",
]);

const PARSE_SYSTEM = `You extract a Stow SALES ORDER confirmation (Order ######.pdf), not a packing slip.
Header usually has Sales Order / Order number (7 digits), customer / PO / order name (often LAST-MMDDYY), requested ship date, order total.
Lines have item / part number, description, quantity, and sometimes a dollar total.
Catalog SKUs are long digits (8+). Cut / studio parts may look like "16 - VT".
Return ONLY JSON:
{
  "so_number": string|null,
  "order_name": string|null,
  "ship_date": "YYYY-MM-DD"|null,
  "total_cents": number,
  "lines": [{ "line_no": number|null, "item_code": string, "description": string, "qty": number, "total_cents": number }]
}
Do not invent SKUs. Qty defaults to 1. Dollars become cents (31.89 → 3189). Extract every real line.`;

function normalizeEmail(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  const angled = raw.match(/<([^>]+)>/);
  return (angled?.[1] ?? raw).replace(/^mailto:/, "");
}

export function isStowSender(from: string | null | undefined): boolean {
  const email = normalizeEmail(from);
  return email === STOW_SENDER || email.endsWith("@thestowcompany.com");
}

export function extractSoNumber(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const match = String(value ?? "").match(/(?:order|so)[^\d]{0,10}(\d{6,8})/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function isStowSalesOrderMail(input: {
  from: string | null | undefined;
  subject: string | null | undefined;
  filename: string | null | undefined;
}): { ok: true } | { ok: false; reason: string } {
  if (!isStowSender(input.from)) return { ok: false, reason: "not_stow_sender" };
  const hay = `${input.subject ?? ""} ${input.filename ?? ""}`;
  const lower = hay.toLowerCase();
  if (/correspondence|credit memo/.test(lower)) return { ok: false, reason: "credit_memo" };
  if (/packing (list|slip)/.test(lower)) return { ok: false, reason: "packing_slip" };
  if (!/\border\s+\d{6,}\b/i.test(hay)) return { ok: false, reason: "not_sales_order" };
  return { ok: true };
}

export function itemMatchKey(code: string | null | undefined): string {
  const raw = String(code ?? "").trim();
  const digits = raw.replace(/\s+/g, "").match(/(\d{8,})/);
  if (digits) return digits[1];
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function missingStowSalesOrderTable(message: string): boolean {
  return /ic_stow_sales_order|schema cache|does not exist/i.test(message);
}

function moneyToCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value < 200000 && value % 1 !== 0 ? value * 100 : value);
  }
  const raw = String(value ?? "").replace(/[$,\s]/g, "");
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, mm, dd, yyyy] = slash;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function safeIlike(value: string): string {
  return value.replace(/[%_,]/g, " ").trim();
}

export async function parseStowSalesOrder(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{
  so_number: string | null;
  order_name: string | null;
  ship_date: string | null;
  total_cents: number;
  lines: StowSalesOrderLine[];
  parse_quality: Record<string, unknown>;
}> {
  const apiKey =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Sales-order parse needs INSPIRED_CLOSETS_ANTHROPIC_API_KEY.");
  }

  const client = new Anthropic({ apiKey });
  const model =
    process.env.INSPIRED_CLOSETS_ANTHROPIC_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-5";
  const message = await client.messages.create({
    model,
    max_tokens: 16000,
    system: PARSE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: input.bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: `Extract every line from this Stow sales order (${input.filename}). JSON only.`,
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(jsonText) as {
    so_number?: string | null;
    order_name?: string | null;
    ship_date?: string | null;
    total_cents?: unknown;
    total?: unknown;
    lines?: Array<Record<string, unknown>>;
  };

  const lines = (parsed.lines ?? [])
    .map((row, index): StowSalesOrderLine => ({
      line_no: Number(row.line_no ?? row.line ?? index + 1) || index + 1,
      item_code: String(row.item_code ?? row.item_number ?? "").trim(),
      description: String(row.description ?? "").trim() || null,
      qty: Math.max(1, Math.round(Number(row.qty) || 1)),
      total_cents: moneyToCents(row.total_cents ?? row.total),
    }))
    .filter((line) => line.item_code || line.description);

  return {
    so_number: parsed.so_number?.trim() || extractSoNumber(input.filename) || null,
    order_name: parsed.order_name?.trim() || null,
    ship_date: toIsoDate(parsed.ship_date),
    total_cents: moneyToCents(parsed.total_cents ?? parsed.total),
    lines,
    parse_quality: { line_count: lines.length, filename: input.filename },
  };
}

async function matchJobForSalesOrder(input: {
  soNumber: string | null;
  orderName: string | null;
}): Promise<{ jobId: string; reason: string } | { jobId: null; reason: string }> {
  const supabase = getSupabaseAdmin();

  if (input.soNumber) {
    const { data: summary } = await supabase
      .from("ic_job_summaries")
      .select("job_id")
      .eq("so_number", input.soNumber)
      .limit(1)
      .maybeSingle();
    if (summary?.job_id) return { jobId: summary.job_id, reason: "summary_so" };

    const { data: slip } = await supabase
      .from("ic_shipment_items")
      .select("job_id")
      .eq("so_number", input.soNumber)
      .not("job_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (slip?.job_id) return { jobId: slip.job_id, reason: "slip_so" };
  }

  if (input.orderName) {
    const name = safeIlike(input.orderName);
    const { data: byRef } = await supabase
      .from("ic_jobs")
      .select("id, studio_ref")
      .is("deleted_at", null)
      .is("archived_at", null)
      .ilike("studio_ref", name)
      .limit(8);
    const exact = (byRef ?? []).filter(
      (job) => String(job.studio_ref ?? "").toLowerCase() === name.toLowerCase(),
    );
    if (exact.length === 1) return { jobId: exact[0].id, reason: "studio_ref" };
    if ((byRef ?? []).length === 1) return { jobId: byRef![0].id, reason: "studio_ref" };
  }

  const hint = clientHintFromSlip(input.orderName, input.orderName);
  if (!hint) return { jobId: null, reason: "no_name_hint" };

  const { data: clients } = await supabase
    .from("ic_clients")
    .select("id, name")
    .is("deleted_at", null)
    .ilike("name", `%${safeIlike(hint)}%`)
    .limit(40);
  const needle = hint.toLowerCase();
  const client = (clients ?? []).find((row) => {
    const tokens = String(row.name ?? "")
      .toLowerCase()
      .split(/[\s,/]+/)
      .filter(Boolean);
    return tokens.includes(needle) || String(row.name ?? "").toLowerCase() === needle;
  });
  if (!client?.id) return { jobId: null, reason: "no_client" };

  const { data: jobs } = await supabase
    .from("ic_jobs")
    .select("id, stage, ready_to_order, sold_date")
    .eq("client_id", client.id)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("sold_date", { ascending: false, nullsFirst: false })
    .limit(12);
  const open = (jobs ?? []).filter((job) => !["closed", "cancelled"].includes(String(job.stage)));
  const preferred = open.filter(
    (job) => job.ready_to_order || OPEN_STAGES.has(String(job.stage)),
  );
  const pool = preferred.length === 1 ? preferred : open.length === 1 ? open : [];
  if (pool.length !== 1) return { jobId: null, reason: "ambiguous_job" };
  return { jobId: pool[0].id, reason: "client_name" };
}

function addQty(map: Map<string, { item_code: string; description: string | null; qty: number }>, key: string, item: string, description: string | null, qty: number) {
  if (!key) return;
  const current = map.get(key) ?? { item_code: item, description, qty: 0 };
  current.qty += qty;
  if (!current.description && description) current.description = description;
  map.set(key, current);
}

export function compareSalesOrderToFrank(input: {
  soLines: Array<{ item_code: string | null; description: string | null; qty: number }>;
  summaryLines: Array<{ item_code: string | null; description: string | null; qty: number }>;
  slipLines: Array<{ item_number?: string | null; item_code?: string | null; description: string | null; qty: number }>;
}): StowCheck {
  const so = new Map<string, { item_code: string; description: string | null; qty: number }>();
  const summary = new Map<string, { item_code: string; description: string | null; qty: number }>();
  const slip = new Map<string, { item_code: string; description: string | null; qty: number }>();

  for (const line of input.soLines) {
    addQty(so, itemMatchKey(line.item_code), line.item_code ?? "", line.description, line.qty);
  }
  for (const line of input.summaryLines) {
    addQty(summary, itemMatchKey(line.item_code), line.item_code ?? "", line.description, line.qty);
  }
  for (const line of input.slipLines) {
    const code = line.item_number ?? line.item_code ?? "";
    addQty(slip, itemMatchKey(code), code, line.description, line.qty);
  }

  const frankHasRows = summary.size + slip.size > 0;
  const keys = new Set([...so.keys(), ...summary.keys(), ...slip.keys()]);
  const lines: StowCheckLine[] = [];

  for (const key of keys) {
    if (!key) continue;
    const soRow = so.get(key);
    const summaryRow = summary.get(key);
    const slipRow = slip.get(key);
    const soQty = soRow?.qty ?? 0;
    const summaryQty = summaryRow?.qty ?? 0;
    const slipQty = slipRow?.qty ?? 0;
    const frankQty = Math.max(summaryQty, slipQty);
    let result: StowCheckLine["result"] = "match";
    if (soQty > 0 && frankQty === 0) result = "missing";
    else if (soQty === 0 && frankQty > 0) result = "extra";
    else if (soQty > 0 && frankQty > 0 && soQty !== frankQty) result = "qty";
    lines.push({
      key,
      item_code: soRow?.item_code || summaryRow?.item_code || slipRow?.item_code || key,
      description: soRow?.description ?? summaryRow?.description ?? slipRow?.description ?? null,
      so_qty: soQty,
      summary_qty: summaryQty,
      slip_qty: slipQty,
      result,
    });
  }

  lines.sort((a, b) => a.item_code.localeCompare(b.item_code));
  return {
    waiting: !frankHasRows,
    lines,
    missing: lines.filter((line) => line.result === "missing").length,
    extra: lines.filter((line) => line.result === "extra").length,
    qty: lines.filter((line) => line.result === "qty").length,
    matched: lines.filter((line) => line.result === "match").length,
  };
}

export async function loadSalesOrderCheck(input: {
  jobId: string;
  soNumber?: string | null;
  soLines: Array<{ item_code: string | null; description: string | null; qty: number }>;
}): Promise<StowCheck> {
  const supabase = getSupabaseAdmin();
  const { data: summaries } = await supabase
    .from("ic_job_summaries")
    .select("id")
    .eq("job_id", input.jobId);
  const summaryIds = (summaries ?? []).map((row) => row.id);
  const { data: summaryLines } = summaryIds.length
    ? await supabase
        .from("ic_job_summary_lines")
        .select("item_code, description, qty")
        .in("summary_id", summaryIds)
    : { data: [] };

  const { data: slipByJob } = await supabase
    .from("ic_shipment_items")
    .select("item_number, description, qty, so_number, job_id")
    .eq("job_id", input.jobId);
  let slipLines = slipByJob ?? [];
  if (input.soNumber) {
    const { data: slipBySo } = await supabase
      .from("ic_shipment_items")
      .select("item_number, description, qty, so_number, job_id")
      .eq("so_number", input.soNumber);
    const seen = new Set(slipLines.map((row) => `${row.item_number}-${row.qty}`));
    for (const row of slipBySo ?? []) {
      const key = `${row.item_number}-${row.qty}`;
      if (!seen.has(key)) {
        slipLines.push(row);
        seen.add(key);
      }
    }
  }

  return compareSalesOrderToFrank({
    soLines: input.soLines,
    summaryLines: (summaryLines ?? []).map((row) => ({
      item_code: row.item_code,
      description: row.description,
      qty: Number(row.qty) || 0,
    })),
    slipLines: slipLines.map((row) => ({
      item_number: row.item_number,
      description: row.description,
      qty: Number(row.qty) || 0,
    })),
  });
}

async function notifyFrank(title: string, todo: string, message: string, severity = "info") {
  await postInspiredClosetsSlackNotification({
    assignee: "Frank",
    title,
    severity,
    todoLabel: todo,
    notifyMessage: message,
    requestedBy: "Stow sales order",
  }).catch(() => null);
}

async function saveLines(salesOrderId: string, lines: StowSalesOrderLine[]) {
  const supabase = getSupabaseAdmin();
  await supabase.from("ic_stow_sales_order_lines").delete().eq("sales_order_id", salesOrderId);
  if (lines.length === 0) return;
  const rows = lines.map((line) => ({
    sales_order_id: salesOrderId,
    line_no: line.line_no,
    item_code: line.item_code,
    description: line.description,
    qty: line.qty,
    total_cents: line.total_cents,
  }));
  const chunk = 80;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from("ic_stow_sales_order_lines").insert(rows.slice(i, i + chunk));
    if (error) throw new Error(error.message);
  }
}

export async function ingestStowSalesOrder(input: {
  from: string;
  subject: string;
  filename: string;
  mimeType?: string;
  bytes: Buffer;
  messageId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; order: StowSalesOrderRow | null; error?: string }> {
  const supabase = getSupabaseAdmin();
  const messageId = input.messageId?.trim() || null;
  const gate = isStowSalesOrderMail(input);
  if (!gate.ok) {
    return { ok: true, skipped: true, order: null, error: gate.reason };
  }

  if (messageId) {
    const { data: existing } = await supabase
      .from("ic_stow_sales_orders")
      .select("*")
      .eq("gmail_message_id", messageId)
      .maybeSingle();
    if (existing) return { ok: true, skipped: true, order: existing as StowSalesOrderRow };
  }

  const ext = input.filename.split(".").pop()?.toLowerCase() || "pdf";
  const path = `stow-orders/${Date.now()}-${input.filename.replace(/[^\w.-]+/g, "_").slice(0, 80) || `order.${ext}`}`;
  const { error: uploadError } = await supabase.storage.from("ic-field-media").upload(path, input.bytes, {
    contentType: input.mimeType || "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}. Confirm storage bucket ic-field-media exists.`);
  }
  const { data: pub } = supabase.storage.from("ic-field-media").getPublicUrl(path);

  let parsed;
  try {
    parsed = await parseStowSalesOrder({
      filename: input.filename,
      mimeType: input.mimeType || "application/pdf",
      bytes: input.bytes,
    });
  } catch (error) {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("ic_stow_sales_orders")
      .insert({
        gmail_message_id: messageId,
        from_email: normalizeEmail(input.from),
        subject: input.subject,
        so_number: extractSoNumber(input.subject, input.filename),
        source_filename: input.filename,
        storage_path: path,
        public_url: pub.publicUrl,
        status: "error",
        parse_error: error instanceof Error ? error.message : "Parse failed.",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    return { ok: false, order: (data as StowSalesOrderRow) ?? null, error: "parse_failed" };
  }

  const soNumber = parsed.so_number || extractSoNumber(input.subject, input.filename);
  if (soNumber) {
    const { data: dup } = await supabase
      .from("ic_stow_sales_orders")
      .select("*")
      .eq("so_number", soNumber)
      .neq("status", "ignored")
      .limit(1)
      .maybeSingle();
    if (dup) return { ok: true, skipped: true, order: dup as StowSalesOrderRow };
  }

  const match = await matchJobForSalesOrder({ soNumber, orderName: parsed.order_name });
  const now = new Date().toISOString();
  const { data: order, error } = await supabase
    .from("ic_stow_sales_orders")
    .insert({
      job_id: match.jobId,
      gmail_message_id: messageId,
      from_email: normalizeEmail(input.from),
      subject: input.subject,
      so_number: soNumber,
      order_name: parsed.order_name,
      ship_date: parsed.ship_date,
      item_count: parsed.lines.length,
      total_cents: parsed.total_cents,
      source_filename: input.filename,
      storage_path: path,
      public_url: pub.publicUrl,
      status: match.jobId ? "attached" : "unmatched",
      ignore_reason: match.jobId ? null : match.reason,
      parse_quality: parsed.parse_quality,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !order) throw new Error(error?.message ?? "Could not save sales order.");

  await saveLines(order.id, parsed.lines);

  if (match.jobId && soNumber) {
    await supabase
      .from("ic_jobs")
      .update({ studio_ref: parsed.order_name ?? soNumber, updated_at: now })
      .eq("id", match.jobId)
      .is("studio_ref", null);
    await supabase.from("ic_activity_log").insert({
      entity_type: "job",
      entity_id: match.jobId,
      action: "stow_sales_order",
      actor_label: "stow-email-ingest",
      changes: { so_number: soNumber, filename: input.filename },
    });
  }

  if (match.jobId) {
    await notifyFrank(
      `Stow SO ${soNumber ?? ""} on the job`.trim(),
      "Sales order is the check. Upload / confirm Frank's summary as usual.",
      `${parsed.order_name ?? input.filename} · ${parsed.lines.length} lines.`,
    );
  } else {
    await notifyFrank(
      `Stow SO ${soNumber ?? ""} needs a job`.trim(),
      "Inventory: attach this sales order to the project.",
      `${input.filename} · ${match.reason}`,
      "warn",
    );
  }

  return { ok: true, order: order as StowSalesOrderRow };
}

export async function attachStowSalesOrder(input: {
  orderId: string;
  jobId: string;
}): Promise<StowSalesOrderRow> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ic_stow_sales_orders")
    .update({
      job_id: input.jobId,
      status: "attached",
      ignore_reason: null,
      updated_at: now,
    })
    .eq("id", input.orderId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not attach sales order.");
  await supabase.from("ic_activity_log").insert({
    entity_type: "job",
    entity_id: input.jobId,
    action: "stow_sales_order",
    actor_label: "stow-email-ingest",
    changes: { so_number: data.so_number, attached: true },
  });
  return data as StowSalesOrderRow;
}

export async function getJobSalesOrders(jobId: string): Promise<
  Array<StowSalesOrderRow & { lines: StowSalesOrderLine[]; check: StowCheck }>
> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_stow_sales_orders")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as StowSalesOrderRow[];
  const ids = orders.map((row) => row.id);
  const { data: lines } = ids.length
    ? await supabase.from("ic_stow_sales_order_lines").select("*").in("sales_order_id", ids)
    : { data: [] };
  const byOrder = new Map<string, StowSalesOrderLine[]>();
  for (const line of lines ?? []) {
    const row = line as StowSalesOrderLine & { sales_order_id: string };
    const list = byOrder.get(row.sales_order_id) ?? [];
    list.push(row);
    byOrder.set(row.sales_order_id, list);
  }
  const result = [];
  for (const order of orders) {
    const orderLines = byOrder.get(order.id) ?? [];
    const check = await loadSalesOrderCheck({
      jobId,
      soNumber: order.so_number,
      soLines: orderLines,
    });
    result.push({ ...order, lines: orderLines, check });
  }
  return result;
}
