/**
 * Merge duplicate workbook clients into one person with many jobs.
 *
 *   npx tsx scripts/merge-ic-duplicate-clients.ts --dry-run
 *   npx tsx scripts/merge-ic-duplicate-clients.ts --apply
 *   npx tsx scripts/merge-ic-duplicate-clients.ts --apply --only=FRIEDMAN
 *
 * High-confidence clusters auto-merge. Ambiguous ones go to ic_client_merge_candidates.
 */
import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import {
  clientDisplayName,
  clientIdentityKey,
  hasAmbiguousLotSuffix,
  jobDescriptorFromName,
} from "../src/lib/inspired-closets-ops-clients";

loadDotEnv(path.resolve(__dirname, ".."));

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  identity_key: string | null;
  merged_into_client_id: string | null;
};

type JobRow = {
  id: string;
  client_id: string | null;
  contract_cents: number;
  workbook_ref: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
  duplicate_of_job_id: string | null;
};

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const DRY = !APPLY || args.has("--dry-run");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length).toUpperCase() : null;

function env(name: string): string {
  const aliases: Record<string, string[]> = {
    NEXT_PUBLIC_SUPABASE_URL: ["SUPABASE_URL"],
    SUPABASE_URL: ["NEXT_PUBLIC_SUPABASE_URL"],
  };
  const value = process.env[name]?.trim() || aliases[name]?.map((key) => process.env[key]?.trim()).find(Boolean);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function rest(pathname: string, init: RequestInit = {}) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${pathname}: ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchAll<T>(tableQuery: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    const res = await fetch(`${url}/rest/v1/${tableQuery}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + page - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${tableQuery}: ${await res.text()}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const value = email.trim().toLowerCase();
  return value.includes("@") ? value : null;
}

function contactsConflict(a: ClientRow, b: ClientRow): boolean {
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

function contactScore(client: ClientRow): number {
  let score = 0;
  if (normalizePhone(client.phone)) score += 2;
  if (normalizeEmail(client.email)) score += 2;
  if ((client.address ?? "").trim().length >= 8) score += 1;
  return score;
}

function pickCanonical(cluster: ClientRow[]): ClientRow {
  return [...cluster].sort((a, b) => {
    const scoreDiff = contactScore(b) - contactScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.length - b.name.length;
  })[0]!;
}

function labelKey(ref: string | null): string {
  if (!ref) return "";
  return ref.replace(/^(sold|inst|wh|trk|svc):/i, "").trim().toUpperCase();
}

async function main() {
  console.log(DRY ? "DRY RUN — no writes" : "APPLY — writing merges");
  if (ONLY) console.log(`Filter: ${ONLY}`);

  // Ensure identity_key is populated for all unmerged clients.
  const clients = await fetchAll<ClientRow>(
    "ic_clients?deleted_at=is.null&select=id,name,phone,email,address,identity_key,merged_into_client_id",
  );
  const live = clients.filter((c) => !c.merged_into_client_id);
  console.log(`Clients: ${live.length} live`);

  for (const client of live) {
    const key = clientIdentityKey(client.name);
    if (client.identity_key === key) continue;
    if (!DRY) {
      await rest(`ic_clients?id=eq.${client.id}`, {
        method: "PATCH",
        body: JSON.stringify({ identity_key: key, updated_at: new Date().toISOString() }),
      });
    }
    client.identity_key = key;
  }

  const byKey = new Map<string, ClientRow[]>();
  for (const client of live) {
    const key = client.identity_key || clientIdentityKey(client.name);
    if (ONLY && !key.includes(ONLY) && !client.name.toUpperCase().includes(ONLY)) continue;
    const list = byKey.get(key) ?? [];
    list.push(client);
    byKey.set(key, list);
  }

  const clusters = [...byKey.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`Clusters with 2+ clients: ${clusters.length}`);

  let autoMerged = 0;
  let queued = 0;
  let jobsRepointed = 0;
  let jobsDuped = 0;
  let titlesSet = 0;

  for (const [key, cluster] of clusters) {
    const ambiguous =
      cluster.some((c) => hasAmbiguousLotSuffix(c.name)) ||
      cluster.some((a, i) => cluster.slice(i + 1).some((b) => contactsConflict(a, b)));

    if (ambiguous) {
      console.log(`  QUEUE ${key}: ${cluster.map((c) => c.name).join(" | ")}`);
      queued += 1;
      if (!DRY) {
        await rest("ic_client_merge_candidates", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            identity_key: key,
            client_ids: cluster.map((c) => c.id),
            reason: cluster.some((c) => hasAmbiguousLotSuffix(c.name))
              ? "lot_or_hash_suffix"
              : "conflicting_contact",
            status: "pending",
          }),
        }).catch(async () => {
          // Insert without Prefer if table is fresh.
          await rest("ic_client_merge_candidates", {
            method: "POST",
            body: JSON.stringify({
              identity_key: key,
              client_ids: cluster.map((c) => c.id),
              reason: cluster.some((c) => hasAmbiguousLotSuffix(c.name))
                ? "lot_or_hash_suffix"
                : "conflicting_contact",
              status: "pending",
            }),
          });
        });
      }
      continue;
    }

    const canonical = pickCanonical(cluster);
    const dupes = cluster.filter((c) => c.id !== canonical.id);
    const displayName = clientDisplayName(canonical.name);
    console.log(
      `  MERGE ${key} → ${displayName} (${canonical.id.slice(0, 8)}) from [${dupes.map((d) => d.name).join(", ")}]`,
    );
    autoMerged += 1;

    if (!DRY) {
      await rest(`ic_clients?id=eq.${canonical.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: displayName,
          identity_key: key,
          updated_at: new Date().toISOString(),
        }),
      });
      for (const dupe of dupes) {
        await rest(`ic_clients?id=eq.${dupe.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            merged_into_client_id: canonical.id,
            identity_key: key,
            updated_at: new Date().toISOString(),
          }),
        });
        for (const table of ["ic_jobs", "ic_leads"]) {
          await rest(`${table}?client_id=eq.${dupe.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              client_id: canonical.id,
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => null);
        }
        jobsRepointed += 1;
      }
      await rest("ic_activity_log", {
        method: "POST",
        body: JSON.stringify({
          entity_type: "client",
          entity_id: canonical.id,
          action: "merged_clients",
          actor_label: "merge-ic-duplicate-clients",
          changes: {
            identity_key: key,
            into: canonical.id,
            from: dupes.map((d) => ({ id: d.id, name: d.name })),
          },
        }),
      }).catch(() => null);
    }

    // Set job titles from descriptors on any job whose client is in this cluster.
    const clientIds = cluster.map((c) => c.id);
    const jobs = await fetchAll<JobRow>(
      `ic_jobs?deleted_at=is.null&client_id=in.(${clientIds.join(",")})&select=id,client_id,contract_cents,workbook_ref,title,notes,created_at,duplicate_of_job_id`,
    );

    for (const job of jobs) {
      const sourceClient = cluster.find((c) => c.id === job.client_id) ?? canonical;
      const title = jobDescriptorFromName(sourceClient.name);
      if (title && !job.title) {
        titlesSet += 1;
        if (!DRY) {
          await rest(`ic_jobs?id=eq.${job.id}`, {
            method: "PATCH",
            body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
          });
        }
      }
    }

    // Dedupe Sold + Install double entries with same contract.
    const unduped = jobs.filter((j) => !j.duplicate_of_job_id);
    const byContract = new Map<number, JobRow[]>();
    for (const job of unduped) {
      if (!job.contract_cents) continue;
      const list = byContract.get(job.contract_cents) ?? [];
      list.push(job);
      byContract.set(job.contract_cents, list);
    }
    for (const [, group] of byContract) {
      if (group.length < 2) continue;
      const labels = group.map((j) => labelKey(j.workbook_ref));
      const hasSold = group.some((j) => (j.workbook_ref ?? "").startsWith("sold:"));
      const hasInst = group.some((j) => (j.workbook_ref ?? "").startsWith("inst:"));
      const sameLabelFamily =
        labels.filter(Boolean).length >= 2 &&
        labels.some((a, i) =>
          labels.slice(i + 1).some((b) => {
            if (!a || !b) return false;
            const shortA = a.replace(/\b(PRIMARY|ADD ON|A\/O|ADDON)\b/g, "").trim();
            const shortB = b.replace(/\b(PRIMARY|ADD ON|A\/O|ADDON)\b/g, "").trim();
            return shortA === shortB || a.includes(b) || b.includes(a);
          }),
        );
      if (!(hasSold && hasInst) && !sameLabelFamily) continue;

      const keeper = [...group].sort((a, b) => {
        const aSold = (a.workbook_ref ?? "").startsWith("sold:") ? 1 : 0;
        const bSold = (b.workbook_ref ?? "").startsWith("sold:") ? 1 : 0;
        if (bSold !== aSold) return bSold - aSold;
        return a.created_at.localeCompare(b.created_at);
      })[0]!;
      for (const job of group) {
        if (job.id === keeper.id) continue;
        jobsDuped += 1;
        console.log(`    DUP job ${job.workbook_ref} → ${keeper.workbook_ref}`);
        if (!DRY) {
          await rest(`ic_jobs?id=eq.${job.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              duplicate_of_job_id: keeper.id,
              client_id: canonical.id,
              updated_at: new Date().toISOString(),
            }),
          });
        }
      }
    }

    // Repoint remaining jobs to canonical.
    if (!DRY) {
      for (const job of jobs) {
        if (job.client_id === canonical.id) continue;
        await rest(`ic_jobs?id=eq.${job.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            client_id: canonical.id,
            updated_at: new Date().toISOString(),
          }),
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      { autoMerged, queued, jobsRepointed, jobsDuped, titlesSet, dryRun: DRY },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
