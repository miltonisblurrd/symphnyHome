/**
 * Public website-form intake. Creates the same lead Des would get from
 * inspiredclosets.com (consultation request or brochure download).
 */
import { getSupabaseAdmin } from "@/db/client";
import { AREAS_OF_HOME } from "@/lib/inspired-closets-ops-leads";

export type WebsiteFormType = "consultation_request" | "brochure_download";

const ALLOWED_AREAS = new Set<string>(AREAS_OF_HOME);

function formatAddress(zip: string): string {
  return zip ? `${zip}` : "";
}

export async function createWebsiteLead(input: {
  formType: WebsiteFormType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zip: string;
  areas?: string[];
  comments?: string | null;
  honeypot?: string | null;
}): Promise<{ ok: true; leadId: string } | { ok: false; error: string; status: number }> {
  if (input.honeypot?.trim()) {
    return { ok: true, leadId: "ignored" };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const zip = input.zip.trim();
  const comments = input.comments?.trim() || null;

  if (!firstName || !lastName) {
    return { ok: false, error: "First and last name are required.", status: 400 };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "A valid email address is required.", status: 400 };
  }
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return { ok: false, error: "A valid phone number is required.", status: 400 };
  }
  if (!zip || !/^\d{5}(-\d{4})?$/.test(zip)) {
    return { ok: false, error: "Enter the 5-digit zip code for the install location.", status: 400 };
  }

  const areas = (input.areas ?? []).filter((area) => ALLOWED_AREAS.has(area));
  const clientName = `${firstName} ${lastName}`;
  const formLabel =
    input.formType === "brochure_download" ? "Brochure download" : "Consultation request";
  const notes = [
    `Website form: ${formLabel}`,
    areas.length ? `Interested in: ${areas.join(", ")}` : null,
    comments ? `Comments: ${comments}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: desRows } = await supabase
    .from("ic_staff")
    .select("id")
    .is("deleted_at", null)
    .eq("active", true)
    .ilike("name", "Des%")
    .limit(1);
  const ownerId = desRows?.[0]?.id ?? null;

  const { data: client, error: clientError } = await supabase
    .from("ic_clients")
    .insert({
      name: clientName,
      phone,
      email,
      address: formatAddress(zip) || null,
    })
    .select("id")
    .single();
  if (clientError || !client) {
    return { ok: false, error: clientError?.message ?? "Could not save contact.", status: 500 };
  }

  const { data: lead, error: leadError } = await supabase
    .from("ic_leads")
    .insert({
      client_id: client.id,
      source: "website",
      stage: "new",
      owner_id: ownerId,
      notes,
      project_area: areas[0] ?? null,
      areas_of_home: areas,
      lead_type: "consumer",
      form_type: input.formType,
      first_name: firstName,
      last_name: lastName,
      zip,
      state: "NV",
      country: "United States",
      showroom_visit: false,
      show_room: "Las Vegas Showroom",
      contact_preference: "phone",
      next_action_at: nowIso,
      next_action_note: "Call from website form",
    })
    .select("id")
    .single();
  if (leadError || !lead) {
    if (leadError && /first_name|last_name|column|schema cache/i.test(leadError.message)) {
      const retry = await supabase
        .from("ic_leads")
        .insert({
          client_id: client.id,
          source: "website",
          stage: "new",
          owner_id: ownerId,
          notes,
          project_area: areas[0] ?? null,
          areas_of_home: areas,
          lead_type: "consumer",
          form_type: input.formType,
          zip,
          state: "NV",
          country: "United States",
          showroom_visit: false,
          show_room: "Las Vegas Showroom",
          contact_preference: "phone",
          next_action_at: nowIso,
          next_action_note: "Call from website form",
        })
        .select("id")
        .single();
      if (retry.error || !retry.data) {
        return { ok: false, error: retry.error?.message ?? "Could not save lead.", status: 500 };
      }
      await supabase.from("ic_activity_log").insert({
        entity_type: "lead",
        entity_id: retry.data.id,
        action: "created",
        actor_label: "Website",
        changes: {
          source: "website",
          form_type: input.formType,
          Lead_Status: { from: null, to: "new" },
        },
      });
      return { ok: true, leadId: retry.data.id };
    }
    return { ok: false, error: leadError?.message ?? "Could not save lead.", status: 500 };
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "lead",
    entity_id: lead.id,
    action: "created",
    actor_label: "Website",
    changes: {
      source: "website",
      form_type: input.formType,
      Lead_Status: { from: null, to: "new" },
    },
  });

  return { ok: true, leadId: lead.id };
}
