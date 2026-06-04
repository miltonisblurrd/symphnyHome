import { contact } from "@/data/studio-data";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { siteConfig } from "@/lib/site-config";

const CONTACT_LIMIT = 8;
const CONTACT_WINDOW_MS = 60 * 60 * 1000;

type ContactBody = {
  name?: string;
  email?: string;
  company?: string;
  message?: string;
};

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`contact:${ip}`, CONTACT_LIMIT, CONTACT_WINDOW_MS);
  if (!rl.ok) {
    return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  let body: ContactBody;
  try {
    body = (await request.json()) as ContactBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const company = body.company?.trim() ?? "";
  const message = body.message?.trim();

  if (!name || !email || !message) {
    return Response.json({ error: "Name, email, and message are required." }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Invalid email address." }, { status: 400 });
  }

  const payload = { name, email, company, message, submittedAt: new Date().toISOString() };

  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("Contact webhook failed", res.status);
      return Response.json({ error: "Unable to send message. Email us directly." }, { status: 502 });
    }
  } else {
    console.info("[contact]", payload);
  }

  return Response.json({
    ok: true,
    message: `Thanks—we received your message. We'll reply to ${email} or reach out at ${contact.email}.`,
    bookingUrl: siteConfig.bookingUrl,
  });
}
