import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import { createWebsiteLead, type WebsiteFormType } from "@/lib/inspired-closets-ops-site-leads";

export const runtime = "nodejs";

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

  const formTypeRaw = typeof body.form_type === "string" ? body.form_type : "";
  const formType: WebsiteFormType | null =
    formTypeRaw === "consultation_request" || formTypeRaw === "brochure_download"
      ? formTypeRaw
      : null;
  if (!formType) {
    return NextResponse.json({ ok: false, error: "Unknown form." }, { status: 400 });
  }

  const result = await createWebsiteLead({
    formType,
    firstName: typeof body.first_name === "string" ? body.first_name : "",
    lastName: typeof body.last_name === "string" ? body.last_name : "",
    email: typeof body.email === "string" ? body.email : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    zip: typeof body.zip === "string" ? body.zip : "",
    areas: Array.isArray(body.areas_of_home)
      ? body.areas_of_home.filter((item): item is string => typeof item === "string")
      : [],
    comments: typeof body.comments === "string" ? body.comments : null,
    honeypot: typeof body.company === "string" ? body.company : null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
