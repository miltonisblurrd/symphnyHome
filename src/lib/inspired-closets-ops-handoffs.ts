/**
 * Slack handoffs that start the next person's work.
 * Transport is postInspiredClosetsSlackNotification — never throw to the caller.
 */
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export async function notifySoldHandoff(input: {
  clientName: string;
  contractCents: number;
  jobId: string;
  depositStatus: string;
  requestedBy?: string | null;
}): Promise<void> {
  const money = dollars(input.contractCents);
  const deposit = input.depositStatus.replace(/_/g, " ");
  const paid = input.depositStatus === "paid";
  try {
    await postInspiredClosetsSlackNotification({
      assignee: "Des",
      title: `Sold — ${input.clientName}`,
      severity: "info",
      todoLabel: `${money} · deposit ${deposit}`,
      notifyMessage: paid
        ? "Sold and 50% is in. Confirm intake, then Frank can job-check / order."
        : "Sold. Chase 50% in Billing. Frank is waiting on deposit before he orders Stow.",
      requestedBy: input.requestedBy ?? "Ops",
    });
  } catch {
    /* Slack optional */
  }
  try {
    await postInspiredClosetsSlackNotification({
      assignee: "Frank",
      title: `Sold — ${input.clientName}`,
      severity: "info",
      todoLabel: `${money} · deposit ${deposit}`,
      notifyMessage: paid
        ? "50% is already in. Job-check this file and place the Stow order."
        : "Sold — you're job-check owner once 50% clears. You'll get another ping when deposit is paid.",
      requestedBy: input.requestedBy ?? "Ops",
    });
  } catch {
    /* Slack optional */
  }
}

export async function notifyDepositCleared(input: {
  clientName: string;
  jobId: string;
  amountCents?: number;
}): Promise<void> {
  try {
    await postInspiredClosetsSlackNotification({
      assignee: "Frank",
      title: `50% in — ${input.clientName}`,
      severity: "info",
      todoLabel:
        input.amountCents != null
          ? `${dollars(input.amountCents)} deposit cleared`
          : "Deposit cleared",
      notifyMessage:
        "Job is orderable. Open Installs → Ready to schedule → Job check, then mark Ordered and set the Stow receive date.",
      requestedBy: "Billing",
    });
  } catch {
    /* Slack optional */
  }
}

export async function notifyConsultComplete(input: {
  clientName: string;
  designerName: string | null;
  outcome: "quote_sent" | "follow_up" | "no_sale";
}): Promise<void> {
  const designer = input.designerName?.trim() || "Designer";
  const copy =
    input.outcome === "quote_sent"
      ? {
          title: `Quote sent — ${input.clientName}`,
          todo: `${designer} finished the consult`,
          message:
            "Design is done and the quote went out. Open the lead → Sold intake when they sign, then chase 50% in Billing.",
        }
      : input.outcome === "follow_up"
        ? {
            title: `Consult done — needs follow-up — ${input.clientName}`,
            todo: `${designer} marked follow-up`,
            message: "Consult happened. They did not sell yet — it's on your Needs follow-up list.",
          }
        : {
            title: `No sale — ${input.clientName}`,
            todo: `${designer} closed the consult`,
            message: "Consult happened, no sale. Lead is in nurturing. No warehouse work.",
          };
  try {
    await postInspiredClosetsSlackNotification({
      assignee: "Des",
      title: copy.title,
      severity: input.outcome === "quote_sent" ? "info" : "warning",
      todoLabel: copy.todo,
      notifyMessage: copy.message,
      requestedBy: designer,
    });
  } catch {
    /* Slack optional */
  }
}
