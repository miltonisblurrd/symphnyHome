import { getSupabaseAdmin } from "@/db/client";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";
import { createActionToken } from "@/lib/inspired-closets-field-auth";

export { datesOverlap, eachDateInclusive, installerOffOn } from "@/lib/inspired-closets-field-dates";

export async function insertFieldNotice(input: {
  installerId: string;
  kind: string;
  title: string;
  body: string;
  relatedId?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("ic_field_notices").insert({
    installer_id: input.installerId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    related_id: input.relatedId ?? null,
  });
}

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.symphny.xyz")
  );
}

export function decideUrl(kind: "pto" | "crew", id: string, decision: "approved" | "denied"): string {
  const token = createActionToken(kind, id, decision);
  return `${appOrigin()}/api/inspired-closets/ops/field-decide?token=${encodeURIComponent(token)}`;
}

export async function notifyPtoRequest(input: {
  installerName: string;
  kind: string;
  startDate: string;
  endDate: string;
  note: string | null;
  requestId: string;
}): Promise<void> {
  const label = input.kind === "sick" ? "Sick" : "PTO";
  const range =
    input.startDate === input.endDate ? input.startDate : `${input.startDate} → ${input.endDate}`;
  try {
    await postInspiredClosetsSlackNotification({
      assignee: "Gavin",
      title: `${label} request — ${input.installerName}`,
      severity: "info",
      todoLabel: range,
      notifyMessage: [
        input.note ? `Note: ${input.note}` : "No note.",
        "",
        `Approve: ${decideUrl("pto", input.requestId, "approved")}`,
        `Deny: ${decideUrl("pto", input.requestId, "denied")}`,
      ].join("\n"),
      requestedBy: input.installerName,
    });
  } catch {
    /* Slack optional */
  }
}

export async function notifyCrewRequest(input: {
  requesterName: string;
  helperName: string;
  clientName: string;
  requestId: string;
}): Promise<void> {
  const message = [
    `${input.requesterName} wants ${input.helperName} on ${input.clientName}.`,
    "",
    `Approve: ${decideUrl("crew", input.requestId, "approved")}`,
    `Deny: ${decideUrl("crew", input.requestId, "denied")}`,
  ].join("\n");
  for (const assignee of ["Craig", "Des", "Gavin"]) {
    try {
      await postInspiredClosetsSlackNotification({
        assignee,
        title: `Crew request — ${input.clientName}`,
        severity: "info",
        todoLabel: `${input.helperName} with ${input.requesterName}`,
        notifyMessage: message,
        requestedBy: input.requesterName,
      });
    } catch {
      /* Slack optional */
    }
  }
}

export async function notifyBankChange(input: {
  installerName: string;
  last4: string;
  routingLast4: string;
}): Promise<void> {
  try {
    await postInspiredClosetsSlackNotification({
      assignee: "Lulu",
      title: `Deposit update — ${input.installerName}`,
      severity: "info",
      todoLabel: `Account last 4 ${input.last4} · routing last 4 ${input.routingLast4}`,
      notifyMessage:
        "Installer changed deposit details in Field. Enter this in QuickBooks. OS only keeps last 4.",
      requestedBy: input.installerName,
    });
  } catch {
    /* Slack optional */
  }
}
