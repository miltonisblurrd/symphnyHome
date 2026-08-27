import { getSupabaseAdmin } from "@/db/client";
import { formatLeadAddress } from "@/lib/inspired-closets-ops-leads";
import {
  importedLeadColumns,
  matchStaffId,
  normalizePhoneKey,
  type ImportedLeadRow,
} from "@/lib/inspired-closets-ops-lead-import";

export type ImportLeadResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

const NEW_COLUMN_HINT =
  /source_raw|stage_raw|lead_owner_name|address_raw|last_activity_at|last_modified_at|community_created_by|column|schema cache/i;

export async function saveImportedLeadRows(input: {
  rows: ImportedLeadRow[];
  actorId: string | null;
  actorName: string | null;
}): Promise<ImportLeadResult> {
  const { rows, actorId, actorName } = input;
  const supabase = getSupabaseAdmin();

  const [{ data: staff }, { data: clients }, { data: existingLeads }] = await Promise.all([
    supabase.from("ic_staff").select("id, name").is("deleted_at", null).eq("active", true),
    supabase.from("ic_clients").select("id, name, phone, email").is("deleted_at", null).limit(5000),
    supabase
      .from("ic_leads")
      .select("id, client_id, community_ref")
      .is("deleted_at", null)
      .limit(5000),
  ]);

  const staffList = (staff ?? []) as Array<{ id: string; name: string }>;
  const phoneToClient = new Map<string, string>();
  const emailToClient = new Map<string, string>();
  for (const client of clients ?? []) {
    const phone = normalizePhoneKey(client.phone);
    if (phone.length >= 7) phoneToClient.set(phone, client.id);
    const email = client.email?.trim().toLowerCase();
    if (email) emailToClient.set(email, client.id);
  }
  const leadByClientId = new Map<string, string>();
  const leadByRef = new Map<string, string>();
  for (const lead of existingLeads ?? []) {
    if (lead.client_id) leadByClientId.set(lead.client_id, lead.id as string);
    const ref = lead.community_ref?.trim();
    if (ref) leadByRef.set(ref, lead.id as string);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  let warnedMissingColumns = false;

  for (const row of rows) {
    const phoneKey = normalizePhoneKey(row.phone);
    const emailKey = row.email?.trim().toLowerCase() ?? "";
    const existingClientId =
      (phoneKey.length >= 7 ? phoneToClient.get(phoneKey) : undefined) ??
      (emailKey ? emailToClient.get(emailKey) : undefined);
    const existingLeadId =
      (row.community_ref ? leadByRef.get(row.community_ref) : undefined) ??
      (existingClientId ? leadByClientId.get(existingClientId) : undefined) ??
      null;

    try {
      let clientId = existingClientId ?? null;
      const address = row.address_raw || formatLeadAddress(row);
      const designerId = matchStaffId(row.designer_name, staffList);

      if (!clientId) {
        const { data: createdClient, error: clientError } = await supabase
          .from("ic_clients")
          .insert({
            name: row.client_name,
            phone: row.phone,
            email: row.email,
            address,
            created_by: actorId,
          })
          .select("id")
          .single();
        if (clientError || !createdClient?.id) {
          errors.push(`${row.client_name}: ${clientError?.message ?? "could not save contact"}`);
          continue;
        }
        clientId = createdClient.id;
        if (phoneKey.length >= 7) phoneToClient.set(phoneKey, createdClient.id);
        if (emailKey) emailToClient.set(emailKey, createdClient.id);
      } else {
        await supabase
          .from("ic_clients")
          .update({
            name: row.client_name,
            phone: row.phone || undefined,
            email: row.email || undefined,
            address,
            updated_by: actorId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      }
      if (!clientId) continue;

      const columns = importedLeadColumns(row, {
        designerId,
        actorId,
        isNew: !existingLeadId,
      });
      columns.client_id = clientId;

      if (existingLeadId) {
        const { error } = await supabase.from("ic_leads").update(columns).eq("id", existingLeadId);
        if (error) {
          if (NEW_COLUMN_HINT.test(error.message) && !warnedMissingColumns) {
            errors.push("Run drizzle/0017_ic_community_lead_fields.sql in Supabase, then import again.");
            warnedMissingColumns = true;
          }
          errors.push(`${row.client_name}: ${error.message}`);
          continue;
        }
        updated += 1;
        continue;
      }

      let { data: lead, error } = await supabase.from("ic_leads").insert(columns).select("id").single();
      if (error && /first_name|last_name|referral_name|column|schema cache/i.test(error.message)) {
        if (NEW_COLUMN_HINT.test(error.message) && !warnedMissingColumns) {
          errors.push("Run drizzle/0017_ic_community_lead_fields.sql in Supabase, then import again.");
          warnedMissingColumns = true;
        }
        delete columns.first_name;
        delete columns.last_name;
        delete columns.referral_name;
        const retry = await supabase.from("ic_leads").insert(columns).select("id").single();
        lead = retry.data;
        error = retry.error;
      }
      if (error || !lead) {
        errors.push(`${row.client_name}: ${error?.message ?? "could not save lead"}`);
        skipped += 1;
        continue;
      }

      await supabase.from("ic_activity_log").insert({
        entity_type: "lead",
        entity_id: lead.id,
        action: "imported",
        actor_id: actorId,
        actor_label: actorName,
        changes: { source: row.source, from: "community_export" },
      });

      leadByClientId.set(clientId, lead.id);
      if (row.community_ref) leadByRef.set(row.community_ref, lead.id);
      created += 1;
    } catch (error) {
      errors.push(`${row.client_name}: ${error instanceof Error ? error.message : "import failed"}`);
    }
  }

  return { created, updated, skipped, errors };
}
