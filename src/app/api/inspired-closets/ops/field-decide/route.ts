import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { readActionToken } from "@/lib/inspired-closets-field-auth";
import { insertFieldNotice } from "@/lib/inspired-closets-field-home";

export const runtime = "nodejs";

function html(title: string, body: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:Lato,system-ui,sans-serif;background:#efe9e5;color:#111;padding:2rem 1.25rem;max-width:28rem;margin:0 auto}
  h1{font-size:1.35rem;margin:0 0 .5rem}
  p{color:rgba(0,0,0,.6);line-height:1.45}
</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return new NextResponse(html("Not ready", "Database is not configured."), {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const parsed = readActionToken(token);
  if (!parsed || (parsed.decision !== "approved" && parsed.decision !== "denied")) {
    return new NextResponse(html("Link expired", "This approve/deny link is invalid or expired."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const approved = parsed.decision === "approved";

  if (parsed.kind === "pto") {
    const { data: row, error } = await supabase
      .from("ic_time_off")
      .select("id, installer_id, kind, start_date, end_date, status")
      .eq("id", parsed.id)
      .maybeSingle();
    if (error || !row) {
      return new NextResponse(html("Not found", "That time-off request is gone."), {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }
    if (row.status !== "requested") {
      return new NextResponse(
        html("Already decided", `This request is already ${row.status}.`),
        { headers: { "Content-Type": "text/html" } },
      );
    }
    await supabase
      .from("ic_time_off")
      .update({ status: parsed.decision, decided_at: now })
      .eq("id", row.id);
    const label = row.kind === "sick" ? "Sick day" : "PTO";
    const range =
      row.start_date === row.end_date ? row.start_date : `${row.start_date} → ${row.end_date}`;
    await insertFieldNotice({
      installerId: row.installer_id,
      kind: "pto",
      title: approved ? `${label} approved` : `${label} denied`,
      body: approved
        ? `${range} is on the calendar. You won’t be booked those days.`
        : `${range} was denied. Check with Gavin if you need another date.`,
      relatedId: row.id,
    });
    return new NextResponse(
      html(
        approved ? "Approved" : "Denied",
        `${label} for ${range} is ${parsed.decision}. The installer will see it on their bell and thread.`,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (parsed.kind === "crew") {
    const { data: row, error } = await supabase
      .from("ic_job_crew")
      .select("id, job_id, installer_id, requested_by, status")
      .eq("id", parsed.id)
      .maybeSingle();
    if (error || !row) {
      return new NextResponse(html("Not found", "That crew request is gone."), {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }
    await supabase
      .from("ic_job_crew")
      .update({ status: parsed.decision, decided_at: now })
      .eq("id", row.id);
    const [{ data: helper }, { data: job }] = await Promise.all([
      supabase.from("ic_staff").select("name").eq("id", row.installer_id).maybeSingle(),
      supabase.from("ic_jobs").select("client_id").eq("id", row.job_id).maybeSingle(),
    ]);
    const { data: client } = job?.client_id
      ? await supabase.from("ic_clients").select("name").eq("id", job.client_id).maybeSingle()
      : { data: null };
    const helperName = helper?.name ?? "Installer";
    const clientName = client?.name ?? "the job";
    if (row.requested_by) {
      await insertFieldNotice({
        installerId: row.requested_by,
        kind: "crew",
        title: approved ? `${helperName} is on the job` : `${helperName} was not added`,
        body: approved
          ? `${helperName} is approved for ${clientName}. Calendar is updated.`
          : `The request for ${helperName} on ${clientName} was denied.`,
        relatedId: row.id,
      });
    }
    await insertFieldNotice({
      installerId: row.installer_id,
      kind: "crew",
      title: approved ? `You’re on ${clientName}` : `Not added to ${clientName}`,
      body: approved
        ? "Office approved you on this crew."
        : "Office did not add you to that job.",
      relatedId: row.id,
    });
    return new NextResponse(
      html(
        approved ? "Crew approved" : "Crew denied",
        `${helperName} ${approved ? "is" : "is not"} on ${clientName}.`,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  return new NextResponse(html("Unknown", "That link type is not supported."), {
    status: 400,
    headers: { "Content-Type": "text/html" },
  });
}
