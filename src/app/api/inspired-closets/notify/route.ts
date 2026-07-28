import { NextResponse } from "next/server";
import { postInspiredClosetsSlackNotification } from "@/lib/inspired-closets-slack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: {
    assignee?: string;
    title?: string;
    severity?: string;
    todoLabel?: string;
    notifyMessage?: string;
    requestedBy?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const assignee = body.assignee?.trim();
  const title = body.title?.trim();
  const todoLabel = body.todoLabel?.trim();
  const notifyMessage = body.notifyMessage?.trim();
  const severity = body.severity?.trim() ?? "info";

  if (!assignee || !title || !todoLabel || !notifyMessage) {
    return NextResponse.json({ error: "Missing notification fields." }, { status: 400 });
  }

  try {
    const result = await postInspiredClosetsSlackNotification({
      assignee,
      title,
      severity,
      todoLabel,
      notifyMessage,
      requestedBy: body.requestedBy?.trim() || "Gavin",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      assignee,
      channel: result.channel,
      mention: result.mention,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
