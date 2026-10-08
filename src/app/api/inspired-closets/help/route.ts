import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { getDesigner } from "@/lib/inspired-closets-designer-auth";
import { getFieldInstaller } from "@/lib/inspired-closets-field-auth-server";
import {
  HELP_BUCKET,
  helpPriorityLabel,
  isHelpPriority,
  type HelpAttachment,
} from "@/lib/inspired-closets-help";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";
export const maxDuration = 60;

const HELP_TO = process.env.HELP_REQUEST_TO || "milton@blurrdstudio.com";
const HELP_FROM = process.env.HELP_REQUEST_FROM || "Inspired Closets Help <onboarding@resend.dev>";
const LINK_TTL_SECONDS = 60 * 60 * 24 * 30;
const PATH_PATTERN = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,6}$/;

type Submitter = { id: string | null; name: string | null; role: string | null };

async function resolveSubmitter(): Promise<Submitter> {
  const designer = await getDesigner().catch(() => null);
  if (designer) return { id: designer.id, name: designer.name, role: designer.role };
  const installer = await getFieldInstaller().catch(() => null);
  if (installer) return { id: installer.id, name: installer.name, role: installer.role };

  const staffId = (await cookies()).get(IC_STAFF_ID_COOKIE)?.value;
  if (staffId) {
    const { data } = await getSupabaseAdmin()
      .from("ic_staff")
      .select("id, name, role")
      .eq("id", staffId)
      .maybeSingle();
    if (data) return { id: data.id, name: data.name, role: data.role };
  }
  return { id: null, name: null, role: null };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseAttachments(value: unknown): HelpAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.path === "string" && PATH_PATTERN.test(row.path))
    .map((row) => ({
      path: row.path as string,
      name: text(row.name, 200) || (row.path as string),
      mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
      bytes: typeof row.bytes === "number" ? row.bytes : null,
    }));
}

async function sendHelpEmail(input: {
  id: string;
  submitter: Submitter;
  subject: string;
  message: string;
  priority: string;
  portal: string;
  pageUrl: string;
  userAgent: string;
  attachments: HelpAttachment[];
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const supabase = getSupabaseAdmin();
  const links = await Promise.all(
    input.attachments.map(async (file) => {
      const { data } = await supabase.storage.from(HELP_BUCKET).createSignedUrl(file.path, LINK_TTL_SECONDS);
      return { ...file, url: data?.signedUrl ?? null };
    }),
  );

  const who = input.submitter.name
    ? `${input.submitter.name}${input.submitter.role ? ` (${input.submitter.role})` : ""}`
    : "Unknown user";
  const priority = helpPriorityLabel(input.priority);
  const rows: [string, string][] = [
    ["Priority", priority],
    ["From", who],
    ["Portal", input.portal || "Unknown"],
    ["Page", input.pageUrl || "Unknown"],
    ["Device", input.userAgent || "Unknown"],
    ["Request ID", input.id],
  ];

  const html = `
    <h2 style="margin:0 0 12px">${escapeHtml(input.subject)}</h2>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}
    </table>
    <p style="white-space:pre-wrap;font-size:14px">${escapeHtml(input.message || "(No message)")}</p>
    ${
      links.length
        ? `<h3 style="margin:20px 0 8px">Attachments (links expire in 30 days)</h3><ul>${links
            .map((file) =>
              file.url
                ? `<li><a href="${escapeHtml(file.url)}">${escapeHtml(file.name)}</a></li>`
                : `<li>${escapeHtml(file.name)} (link unavailable)</li>`,
            )
            .join("")}</ul>`
        : ""
    }`;

  const { error } = await new Resend(apiKey).emails.send({
    from: HELP_FROM,
    to: HELP_TO,
    subject: `[Help · ${input.priority.toUpperCase()}] ${input.subject}`,
    html,
  });
  return !error;
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

  const supabase = getSupabaseAdmin();

  if (body.action === "prepare") {
    const ext =
      typeof body.ext === "string" && /^[a-z0-9]{1,6}$/i.test(body.ext) ? body.ext.toLowerCase() : "bin";
    const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from(HELP_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? `Could not start upload. Confirm bucket ${HELP_BUCKET} exists.` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, path, signedUrl: data.signedUrl });
  }

  if (body.action !== "submit") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const subject = text(body.subject, 200);
  if (!subject) {
    return NextResponse.json({ ok: false, error: "Add a subject." }, { status: 400 });
  }
  const message = text(body.message, 10000);
  const priority = isHelpPriority(body.priority) ? body.priority : "medium";
  const portal = text(body.portal, 50);
  const pageUrl = text(body.page_url, 1000);
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";
  const attachments = parseAttachments(body.attachments);
  const submitter = await resolveSubmitter();

  const { data, error } = await supabase
    .from("ic_help_requests")
    .insert({
      staff_id: submitter.id,
      submitter_name: submitter.name,
      submitter_role: submitter.role,
      portal: portal || null,
      page_url: pageUrl || null,
      user_agent: userAgent || null,
      subject,
      message: message || null,
      priority,
      attachments,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let emailed = false;
  try {
    emailed = await sendHelpEmail({
      id: data.id,
      submitter,
      subject,
      message,
      priority,
      portal,
      pageUrl,
      userAgent,
      attachments,
    });
  } catch (sendError) {
    console.error("Help request email failed", sendError);
  }
  if (emailed) {
    await supabase
      .from("ic_help_requests")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", data.id);
  }

  return NextResponse.json({ ok: true, id: data.id, emailed });
}
