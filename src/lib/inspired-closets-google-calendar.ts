/**
 * Google Calendar push for IC appointments.
 *
 * Office setup (no OAuth dance required if using the existing Sheets SA):
 * 1. GCP project → enable Google Calendar API
 * 2. Create (or pick) a shared calendar, e.g. "IC Ops — Designers"
 * 3. Share that calendar with INSPIRED_CLOSETS_GOOGLE_SERVICE_ACCOUNT_EMAIL
 *    as "Make changes to events"
 * 4. Copy Calendar ID (Calendar settings → Integrate calendar) into
 *    INSPIRED_CLOSETS_GOOGLE_CALENDAR_ID on Vercel
 * 5. Redeploy; Schedule page status flips to Connected
 *
 * Until calendar id + SA are set, sync is a no-op (appointments still save in-app).
 */
import { createSign } from "crypto";
import { getSupabaseAdmin } from "@/db/client";

export type GoogleCalendarConfig = {
  calendarId: string;
  serviceAccountEmail: string;
  privateKey: string;
};

export type CalendarSyncResult =
  | { ok: true; eventId: string; action: "created" | "updated" | "deleted" }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

function base64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64url");
}

function normalizePrivateKey(value: string): string {
  let key = value.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

export function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const calendarId = process.env.INSPIRED_CLOSETS_GOOGLE_CALENDAR_ID?.trim();
  const serviceAccountEmail = process.env.INSPIRED_CLOSETS_GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyRaw = process.env.INSPIRED_CLOSETS_GOOGLE_PRIVATE_KEY?.trim();
  if (!calendarId || !serviceAccountEmail || !privateKeyRaw) return null;
  return {
    calendarId,
    serviceAccountEmail,
    privateKey: normalizePrivateKey(privateKeyRaw),
  };
}

export function getGoogleCalendarStatus(): {
  configured: boolean;
  calendarId: string | null;
  serviceAccountEmail: string | null;
  officeChecklist: string[];
} {
  const config = getGoogleCalendarConfig();
  return {
    configured: Boolean(config),
    calendarId: config?.calendarId ?? null,
    serviceAccountEmail:
      config?.serviceAccountEmail ??
      process.env.INSPIRED_CLOSETS_GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ??
      null,
    officeChecklist: [
      "Enable Google Calendar API on the Symphony/IC GCP project",
      "Create or pick the shared designer calendar",
      "Share calendar with the service account (Make changes to events)",
      "Set INSPIRED_CLOSETS_GOOGLE_CALENDAR_ID in Vercel + redeploy",
      "Save a test appointment and confirm it appears on Google",
    ],
  };
}

async function getCalendarAccessToken(config: GoogleCalendarConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: config.serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(config.privateKey, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Calendar token exchange failed: ${detail}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google Calendar token exchange returned no access token.");
  return json.access_token;
}

export type AppointmentCalendarInput = {
  id: string;
  kind: string;
  scheduled_at: string;
  location_type: string | null;
  status: string;
  notes: string | null;
  community_ref: string | null;
  google_event_id: string | null;
  subject?: string | null;
  location_text?: string | null;
  clientName?: string | null;
  designerName?: string | null;
  address?: string | null;
};

function eventBody(appt: AppointmentCalendarInput) {
  const start = new Date(appt.scheduled_at);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  const fallbackTitle = [
    appt.kind.replace(/_/g, " "),
    appt.clientName ?? "Client",
    appt.designerName ? `· ${appt.designerName}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  const description = [
    `Inspired Closets OS appointment`,
    `Kind: ${appt.kind}`,
    appt.designerName ? `Designer: ${appt.designerName}` : null,
    appt.community_ref ? `Community: ${appt.community_ref}` : null,
    appt.notes ? `Notes: ${appt.notes}` : null,
    `App id: ${appt.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summary: appt.subject?.trim() || fallbackTitle,
    description,
    location:
      appt.location_text?.trim() ||
      appt.address ||
      appt.location_type?.replace(/_/g, " ") ||
      undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    status: appt.status === "cancelled" ? "cancelled" : "confirmed",
  };
}

export async function syncAppointmentToGoogleCalendar(
  appt: AppointmentCalendarInput,
): Promise<CalendarSyncResult> {
  const config = getGoogleCalendarConfig();
  if (!config) {
    return {
      ok: false,
      skipped: true,
      reason: "Google Calendar not configured (set INSPIRED_CLOSETS_GOOGLE_CALENDAR_ID).",
    };
  }

  try {
    const token = await getCalendarAccessToken(config);
    const calId = encodeURIComponent(config.calendarId);
    const body = eventBody(appt);

    if (appt.status === "cancelled" && appt.google_event_id) {
      const del = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(appt.google_event_id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!del.ok && del.status !== 404) {
        throw new Error(await del.text());
      }
      const supabase = getSupabaseAdmin();
      await supabase
        .from("ic_appointments")
        .update({ google_event_id: null, updated_at: new Date().toISOString() })
        .eq("id", appt.id);
      return { ok: true, eventId: appt.google_event_id, action: "deleted" };
    }

    if (appt.google_event_id) {
      const patch = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(appt.google_event_id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!patch.ok) throw new Error(await patch.text());
      return { ok: true, eventId: appt.google_event_id, action: "updated" };
    }

    const create = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!create.ok) throw new Error(await create.text());
    const created = (await create.json()) as { id?: string };
    if (!created.id) throw new Error("Calendar create returned no event id.");

    const supabase = getSupabaseAdmin();
    await supabase
      .from("ic_appointments")
      .update({ google_event_id: created.id, updated_at: new Date().toISOString() })
      .eq("id", appt.id);

    return { ok: true, eventId: created.id, action: "created" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Calendar sync failed.",
    };
  }
}

/** Enrich appointment row with names for event title, then sync. */
export async function pushAppointmentById(appointmentId: string): Promise<CalendarSyncResult> {
  const supabase = getSupabaseAdmin();
  const { data: appt } = await supabase
    .from("ic_appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { ok: false, error: "Appointment not found." };

  let clientName: string | null = null;
  let address: string | null = null;
  let designerName: string | null = null;

  if (appt.client_id) {
    const { data: client } = await supabase
      .from("ic_clients")
      .select("name, address")
      .eq("id", appt.client_id)
      .maybeSingle();
    clientName = client?.name ?? null;
    address = client?.address ?? null;
  }
  if (appt.designer_id) {
    const { data: designer } = await supabase
      .from("ic_staff")
      .select("name")
      .eq("id", appt.designer_id)
      .maybeSingle();
    designerName = designer?.name ?? null;
  }

  return syncAppointmentToGoogleCalendar({
    id: appt.id,
    kind: appt.kind,
    scheduled_at: appt.scheduled_at,
    location_type: appt.location_type,
    status: appt.status,
    notes: appt.notes,
    community_ref: appt.community_ref,
    google_event_id: appt.google_event_id,
    subject: appt.subject ?? null,
    location_text: appt.location_text ?? address,
    clientName,
    designerName,
    address,
  });
}
