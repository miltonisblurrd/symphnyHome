/**
 * Client identity: one person can have many jobs.
 * Workbook labels like "FRIEDMAN PRIMARY ADD ON" describe the job, not the client.
 */
import { getSupabaseAdmin } from "@/db/client";

/** Tokens that belong on the job title, not the person name. */
export const CLIENT_DESCRIPTOR_TOKENS = new Set([
  "ADD",
  "ON",
  "ADDON",
  "A/O",
  "AO",
  "PRIMARY",
  "SECONDARY",
  "GARAGE",
  "CLOSET",
  "PANTRY",
  "OFFICE",
  "MUDROOM",
  "LAUNDRY",
  "LIST",
  "SVC",
  "SERVICE",
  "GB",
  "G/B",
  "GOBACK",
  "GO",
  "BACK",
  "PUNCH",
  "THE",
  "LOT",
  "AND",
  "NEW",
  "DEMO",
  "CART",
  "A",
]);

export type IcClientRow = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  identity_key?: string | null;
  merged_into_client_id?: string | null;
  deleted_at?: string | null;
};

export type ResolveClientInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  actorId?: string | null;
  /** When set, use this id instead of looking up / creating. */
  clientId?: string | null;
};

export type ResolveClientResult = {
  clientId: string;
  created: boolean;
  identityKey: string;
  displayName: string;
  title: string | null;
  queuedReview?: boolean;
};

export type MergeCandidateReason = "conflicting_contact" | "lot_or_hash_suffix" | "name_match_uncertain";

export type MergeCandidateJob = {
  id: string;
  title: string | null;
  stage: string;
  contract_cents: number;
  sold_date: string | null;
  install_date: string | null;
};

export type MergeCandidateClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  jobs: MergeCandidateJob[];
};

export type MergeCandidate = {
  id: string;
  identity_key: string;
  reason: string;
  status: string;
  client_ids: string[];
  clients: MergeCandidateClient[];
};

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Uppercase normalized name with light punctuation cleanup. */
export function normalizeClientLabel(name: string): string {
  return collapseSpaces(name)
    .toUpperCase()
    .replace(/[#$.,'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(name: string): string[] {
  return normalizeClientLabel(name)
    .replace(/\bADD\s+ON\b/g, "ADDON")
    .replace(/\bA\s*\/\s*O\b/g, "A/O")
    .replace(/\bGO[\s-]?BACK\b/g, "GOBACK")
    .replace(/\bG\s*\/\s*B\b/g, "GB")
    .split(/[\s,/_\-–—]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isDescriptorToken(token: string): boolean {
  if (CLIENT_DESCRIPTOR_TOKENS.has(token)) return true;
  if (/^\d+$/.test(token)) return true;
  if (/^#\d+$/.test(token)) return true;
  if (/^\d+#?$/.test(token)) return true;
  return false;
}

/**
 * Person key for matching. Strips job descriptors so
 * "FRIEDMAN PRIMARY ADD ON" and "FRIEDMAN" share the same key.
 */
export function clientIdentityKey(name: string): string {
  const tokens = tokenize(name);
  const person = tokens.filter((token) => !isDescriptorToken(token));
  if (person.length === 0) {
    return normalizeClientLabel(name) || "UNKNOWN";
  }
  // Prefer last token when we have a first + last (or last alone).
  if (person.length === 1) return person[0]!;
  return person.join(" ");
}

/**
 * The part of the workbook label that belongs on the job (e.g. "PRIMARY ADD ON").
 * Returns null when the whole label is just the person name.
 */
export function jobDescriptorFromName(name: string): string | null {
  const tokens = tokenize(name);
  const descriptors: string[] = [];
  let sawPerson = false;
  for (const token of tokens) {
    if (isDescriptorToken(token)) {
      if (sawPerson || descriptors.length > 0 || token !== "THE") {
        descriptors.push(token === "ADDON" ? "ADD ON" : token === "GOBACK" ? "GO-BACK" : token);
      }
    } else {
      sawPerson = true;
    }
  }
  if (descriptors.length === 0) return null;
  return collapseSpaces(descriptors.join(" "));
}

/** Short display name for the client row (no descriptors). */
export function clientDisplayName(name: string): string {
  const tokens = tokenize(name).filter((token) => !isDescriptorToken(token));
  if (tokens.length === 0) return collapseSpaces(name);
  return tokens
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(" ");
}

/** True when a name has a lot/builder suffix that may mean a different home. */
export function hasAmbiguousLotSuffix(name: string): boolean {
  return /#\s*\d+|\bLOT\s*\d+/i.test(name);
}

/** Lot or # token, if present. */
export function lotOrHashToken(name: string): string | null {
  const match = name.match(/#\s*(\d+)|\bLOT\s*(\d+)/i);
  if (!match) return null;
  return match[1] || match[2] || null;
}

/** True when lot/# numbers disagree, or only one name has a lot/#. */
export function lotsConflict(a: string, b: string): boolean {
  const lotA = lotOrHashToken(a);
  const lotB = lotOrHashToken(b);
  if (lotA && lotB) return lotA !== lotB;
  return Boolean(lotA || lotB);
}

export function mergeReasonLabel(reason: string): string {
  if (reason === "conflicting_contact") {
    return "Phone, email, or address does not match";
  }
  if (reason === "lot_or_hash_suffix") {
    return "Lot or home number may be a different house";
  }
  return "Name matches, but the OS is not sure they are the same person";
}

function isMissingMergeTable(message: string | null | undefined): boolean {
  if (!message) return false;
  return /ic_client_merge_candidates|identity_key|merged_into_client_id|schema cache|does not exist/i.test(
    message,
  );
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const value = email.trim().toLowerCase();
  return value.includes("@") ? value : null;
}

function contactsConflict(
  a: { phone?: string | null; email?: string | null; address?: string | null },
  b: { phone?: string | null; email?: string | null; address?: string | null },
): boolean {
  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA !== phoneB) return true;
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (emailA && emailB && emailA !== emailB) return true;
  const addrA = (a.address ?? "").trim().toLowerCase();
  const addrB = (b.address ?? "").trim().toLowerCase();
  if (addrA.length >= 8 && addrB.length >= 8 && addrA !== addrB) return true;
  return false;
}

function contactScore(client: IcClientRow): number {
  let score = 0;
  if (normalizePhone(client.phone)) score += 2;
  if (normalizeEmail(client.email)) score += 2;
  if ((client.address ?? "").trim().length >= 8) score += 1;
  return score;
}

/** Follow merged_into_client_id to the canonical row id. */
export function canonicalClientId(client: {
  id: string;
  merged_into_client_id?: string | null;
}): string {
  return client.merged_into_client_id || client.id;
}

export async function resolveCanonicalClientId(clientId: string | null | undefined): Promise<string | null> {
  if (!clientId) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ic_clients")
    .select("id, merged_into_client_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!data) return clientId;
  return canonicalClientId(data);
}

/**
 * Find or create a canonical client. Descriptors go on the job title, not the name.
 */
export async function resolveClient(input: ResolveClientInput): Promise<ResolveClientResult> {
  const supabase = getSupabaseAdmin();
  const rawName = input.name.trim();
  const identityKey = clientIdentityKey(rawName);
  const displayName = clientDisplayName(rawName);
  const title = jobDescriptorFromName(rawName);
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim() || null;
  const address = input.address?.trim() || null;

  if (input.clientId) {
    const canonical = await resolveCanonicalClientId(input.clientId);
    return {
      clientId: canonical ?? input.clientId,
      created: false,
      identityKey,
      displayName,
      title,
    };
  }

  // Prefer contact match first (stronger than name alone).
  const phoneDigits = normalizePhone(phone);
  if (phoneDigits) {
    const { data: byPhone } = await supabase
      .from("ic_clients")
      .select("id, name, phone, email, address, identity_key, merged_into_client_id")
      .is("deleted_at", null)
      .is("merged_into_client_id", null)
      .not("phone", "is", null)
      .limit(200);
    const hit = (byPhone ?? []).find((row) => normalizePhone(row.phone) === phoneDigits);
    if (hit) {
      return {
        clientId: canonicalClientId(hit),
        created: false,
        identityKey: hit.identity_key || identityKey,
        displayName: hit.name,
        title,
      };
    }
  }

  const emailNorm = normalizeEmail(email);
  if (emailNorm) {
    const { data: byEmail } = await supabase
      .from("ic_clients")
      .select("id, name, phone, email, address, identity_key, merged_into_client_id")
      .is("deleted_at", null)
      .is("merged_into_client_id", null)
      .ilike("email", emailNorm)
      .limit(5);
    const hit = (byEmail ?? [])[0];
    if (hit) {
      return {
        clientId: canonicalClientId(hit),
        created: false,
        identityKey: hit.identity_key || identityKey,
        displayName: hit.name,
        title,
      };
    }
  }

  const { data: byKey } = await supabase
    .from("ic_clients")
    .select("id, name, phone, email, address, identity_key, merged_into_client_id")
    .is("deleted_at", null)
    .is("merged_into_client_id", null)
    .eq("identity_key", identityKey)
    .limit(20);

  let candidates = (byKey ?? []) as IcClientRow[];

  // Fallback for rows that predate identity_key.
  if (candidates.length === 0) {
    const { data: byName } = await supabase
      .from("ic_clients")
      .select("id, name, phone, email, address, identity_key, merged_into_client_id")
      .is("deleted_at", null)
      .is("merged_into_client_id", null)
      .ilike("name", `%${identityKey.split(" ").pop() ?? identityKey}%`)
      .limit(40);
    candidates = ((byName ?? []) as IcClientRow[]).filter(
      (row) => clientIdentityKey(row.name) === identityKey,
    );
  }

  const compatible = candidates.filter(
    (row) => !contactsConflict(row, { phone, email, address }),
  );
  const lotAmbiguous = candidates.some((row) => lotsConflict(rawName, row.name));
  const contactAmbiguous = candidates.some((row) =>
    contactsConflict(row, { phone, email, address }),
  );

  // High confidence: same person key, no conflicting contact, no lot/# mismatch.
  if (compatible.length > 0 && !lotAmbiguous) {
    compatible.sort((a, b) => {
      const scoreDiff = contactScore(b) - contactScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.length - b.name.length;
    });
    const hit = compatible[0]!;
    // Backfill identity_key when missing.
    if (!hit.identity_key) {
      await supabase
        .from("ic_clients")
        .update({ identity_key: identityKey, updated_at: new Date().toISOString() })
        .eq("id", hit.id);
    }
    return {
      clientId: canonicalClientId(hit),
      created: false,
      identityKey,
      displayName: hit.name,
      title,
    };
  }

  const insert: Record<string, unknown> = {
    name: displayName,
    phone,
    email,
    address,
    identity_key: identityKey,
  };
  if (input.actorId) insert.created_by = input.actorId;

  const { data: created, error } = await supabase
    .from("ic_clients")
    .insert(insert)
    .select("id, name")
    .single();

  if (error || !created) {
    // Column may not exist yet — retry without identity_key.
    if (error && /identity_key|column|schema cache/i.test(error.message)) {
      const { data: fallback, error: fallbackError } = await supabase
        .from("ic_clients")
        .insert({
          name: displayName,
          phone,
          email,
          address,
          ...(input.actorId ? { created_by: input.actorId } : {}),
        })
        .select("id, name")
        .single();
      if (fallbackError || !fallback) {
        throw new Error(fallbackError?.message ?? error.message);
      }
      return {
        clientId: fallback.id,
        created: true,
        identityKey,
        displayName: fallback.name,
        title,
      };
    }
    throw new Error(error?.message ?? "Could not create client.");
  }

  // Not confident: keep this as its own client/job and ask a human to confirm.
  let queuedReview = false;
  if (candidates.length > 0) {
    queuedReview = await queueMergeCandidate({
      identityKey,
      clientIds: [...candidates.map((row) => row.id), created.id],
      reason: contactAmbiguous
        ? "conflicting_contact"
        : lotAmbiguous
          ? "lot_or_hash_suffix"
          : "name_match_uncertain",
    });
  }

  return {
    clientId: created.id,
    created: true,
    identityKey,
    displayName: created.name,
    title,
    queuedReview,
  };
}

/** Pick the primary job for a client: most recent open, else most recent closed. */
export function pickPrimaryJob<
  T extends {
    id: string;
    stage: string;
    sold_date?: string | null;
    install_date?: string | null;
    created_at?: string | null;
    duplicate_of_job_id?: string | null;
  },
>(jobs: T[]): T | null {
  const active = jobs.filter((job) => !job.duplicate_of_job_id);
  if (active.length === 0) return null;

  const stageRank: Record<string, number> = {
    install_in_progress: 100,
    install_scheduled: 90,
    ordered: 80,
    job_check: 70,
    deposit_received: 60,
    deposit_pending: 50,
    final_payment: 45,
    install_complete: 40,
    quoted: 30,
    consultation: 20,
    lead: 10,
    closed: 0,
    cancelled: -1,
  };

  const open = active.filter((job) => !["closed", "cancelled"].includes(job.stage));
  const pool = open.length > 0 ? open : active;

  return [...pool].sort((a, b) => {
    const rankDiff = (stageRank[b.stage] ?? 0) - (stageRank[a.stage] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const dateA = a.sold_date || a.install_date || a.created_at || "";
    const dateB = b.sold_date || b.install_date || b.created_at || "";
    return dateB.localeCompare(dateA);
  })[0]!;
}

export async function queueMergeCandidate(input: {
  identityKey: string;
  clientIds: string[];
  reason: MergeCandidateReason | string;
}): Promise<boolean> {
  const clientIds = [...new Set(input.clientIds.filter(Boolean))];
  if (clientIds.length < 2) return false;

  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("ic_client_merge_candidates")
    .select("id, client_ids")
    .eq("identity_key", input.identityKey)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (findError) {
    if (isMissingMergeTable(findError.message)) return false;
    console.warn("queueMergeCandidate find", findError.message);
    return false;
  }

  if (existing) {
    const merged = [...new Set([...(existing.client_ids ?? []), ...clientIds])];
    const { error } = await supabase
      .from("ic_client_merge_candidates")
      .update({
        client_ids: merged,
        reason: input.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error && !isMissingMergeTable(error.message)) {
      console.warn("queueMergeCandidate update", error.message);
    }
    return !error;
  }

  const { error } = await supabase.from("ic_client_merge_candidates").insert({
    identity_key: input.identityKey,
    client_ids: clientIds,
    reason: input.reason,
    status: "pending",
  });
  if (error && !isMissingMergeTable(error.message)) {
    console.warn("queueMergeCandidate insert", error.message);
    return false;
  }
  return !error;
}

export async function listPendingMergeCandidates(): Promise<MergeCandidate[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_client_merge_candidates")
    .select("id, identity_key, client_ids, reason, status")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data?.length) {
    if (error && !isMissingMergeTable(error.message)) {
      console.warn("listPendingMergeCandidates", error.message);
    }
    return [];
  }

  const clientIds = [...new Set(data.flatMap((row) => row.client_ids ?? []))];
  if (clientIds.length === 0) {
    return data.map((row) => ({
      id: row.id,
      identity_key: row.identity_key,
      reason: row.reason,
      status: row.status,
      client_ids: row.client_ids ?? [],
      clients: [],
    }));
  }

  const [{ data: clients }, { data: jobs }] = await Promise.all([
    supabase
      .from("ic_clients")
      .select("id, name, phone, email, address, merged_into_client_id")
      .in("id", clientIds)
      .is("deleted_at", null),
    supabase
      .from("ic_jobs")
      .select("id, client_id, title, stage, contract_cents, sold_date, install_date")
      .in("client_id", clientIds)
      .is("deleted_at", null)
      .is("duplicate_of_job_id", null),
  ]);

  const jobsByClient = new Map<string, MergeCandidateJob[]>();
  for (const job of jobs ?? []) {
    if (!job.client_id) continue;
    const list = jobsByClient.get(job.client_id) ?? [];
    list.push({
      id: job.id,
      title: job.title ?? null,
      stage: job.stage,
      contract_cents: job.contract_cents ?? 0,
      sold_date: job.sold_date ?? null,
      install_date: job.install_date ?? null,
    });
    jobsByClient.set(job.client_id, list);
  }

  const clientsById = new Map((clients ?? []).map((row) => [row.id, row]));

  return data
    .map((row) => ({
      id: row.id,
      identity_key: row.identity_key,
      reason: row.reason,
      status: row.status,
      client_ids: row.client_ids ?? [],
      clients: (row.client_ids ?? [])
        .map((id) => clientsById.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row) && !row.merged_into_client_id)
        .map((client) => ({
          id: client.id,
          name: client.name,
          phone: client.phone ?? null,
          email: client.email ?? null,
          address: client.address ?? null,
          jobs: jobsByClient.get(client.id) ?? [],
        })),
    }))
    .filter((row) => row.clients.length > 1);
}

export async function mergeClients(input: {
  intoClientId: string;
  fromClientIds: string[];
  actorId?: string | null;
  actorLabel?: string | null;
}): Promise<{ intoClientId: string; fromClientIds: string[] }> {
  const supabase = getSupabaseAdmin();
  const intoId = (await resolveCanonicalClientId(input.intoClientId)) ?? input.intoClientId;
  const fromIds = [...new Set(input.fromClientIds)].filter((id) => id && id !== intoId);
  if (fromIds.length === 0) return { intoClientId: intoId, fromClientIds: [] };

  const { data: into } = await supabase
    .from("ic_clients")
    .select("id, name, phone, email, address, identity_key")
    .eq("id", intoId)
    .maybeSingle();
  if (!into) throw new Error("Canonical client not found.");

  const { data: fromRows } = await supabase
    .from("ic_clients")
    .select("id, name, phone, email, address, identity_key")
    .in("id", fromIds);

  const now = new Date().toISOString();
  const contactPatch: Record<string, unknown> = {};
  if (!into.phone) {
    const phone = (fromRows ?? []).find((row) => row.phone)?.phone;
    if (phone) contactPatch.phone = phone;
  }
  if (!into.email) {
    const email = (fromRows ?? []).find((row) => row.email)?.email;
    if (email) contactPatch.email = email;
  }
  if (!into.address) {
    const address = (fromRows ?? []).find((row) => row.address)?.address;
    if (address) contactPatch.address = address;
  }
  if (!into.identity_key) {
    contactPatch.identity_key = clientIdentityKey(into.name);
  }
  if (Object.keys(contactPatch).length > 0) {
    await supabase
      .from("ic_clients")
      .update({ ...contactPatch, updated_at: now })
      .eq("id", intoId);
  }

  for (const from of fromRows ?? []) {
    const title = jobDescriptorFromName(from.name);
    await supabase
      .from("ic_clients")
      .update({
        merged_into_client_id: intoId,
        identity_key: from.identity_key || clientIdentityKey(from.name),
        updated_at: now,
      })
      .eq("id", from.id);

    if (title) {
      await supabase
        .from("ic_jobs")
        .update({ title, client_id: intoId, updated_at: now })
        .eq("client_id", from.id)
        .is("title", null);
    }

    await supabase
      .from("ic_jobs")
      .update({ client_id: intoId, updated_at: now })
      .eq("client_id", from.id);

    await supabase
      .from("ic_leads")
      .update({ client_id: intoId, updated_at: now })
      .eq("client_id", from.id);
  }

  await supabase.from("ic_activity_log").insert({
    entity_type: "client",
    entity_id: intoId,
    action: "merged_clients",
    actor_id: input.actorId ?? null,
    actor_label: input.actorLabel ?? (input.actorId ? null : "ops-app"),
    changes: {
      into: intoId,
      from: (fromRows ?? []).map((row) => ({ id: row.id, name: row.name })),
    },
  });

  return { intoClientId: intoId, fromClientIds: fromIds };
}

export async function resolveMergeCandidate(input: {
  candidateId: string;
  action: "merge" | "keep_separate";
  intoClientId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}): Promise<{ action: "merge" | "keep_separate"; intoClientId?: string }> {
  const supabase = getSupabaseAdmin();
  const { data: candidate, error } = await supabase
    .from("ic_client_merge_candidates")
    .select("id, identity_key, client_ids, status")
    .eq("id", input.candidateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!candidate) throw new Error("Merge candidate not found.");
  if (candidate.status !== "pending") throw new Error("This review is already resolved.");

  const now = new Date().toISOString();

  if (input.action === "keep_separate") {
    const { error: updateError } = await supabase
      .from("ic_client_merge_candidates")
      .update({
        status: "resolved",
        resolution: "kept_separate",
        resolved_at: now,
        updated_at: now,
      })
      .eq("id", candidate.id);
    if (updateError) throw new Error(updateError.message);
    return { action: "keep_separate" };
  }

  const intoClientId = input.intoClientId || candidate.client_ids?.[0];
  if (!intoClientId) throw new Error("into_client_id is required to merge.");

  const fromClientIds = (candidate.client_ids ?? []).filter((id) => id !== intoClientId);
  const merged = await mergeClients({
    intoClientId,
    fromClientIds,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
  });

  const { error: updateError } = await supabase
    .from("ic_client_merge_candidates")
    .update({
      status: "resolved",
      resolution: "merged",
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", candidate.id);
  if (updateError) throw new Error(updateError.message);

  return { action: "merge", intoClientId: merged.intoClientId };
}
