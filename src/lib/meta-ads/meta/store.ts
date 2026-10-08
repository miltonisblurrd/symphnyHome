import fs from "node:fs";
import path from "node:path";
import { isDbConfigured } from "@/db/client";
import { pullLiveSnapshot } from "@/lib/meta-ads/meta/pull";
import type { AccountSnapshot } from "@/lib/meta-ads/meta/snapshot";

const SNAPSHOT_ID = "inspired-closets";
const FILE_NAME = "meta-ads-live.json";
const STORAGE_BUCKET = "ic-meta-ads";
const STORAGE_OBJECT = "live.json";

/** Refresh the ads tab when the stored pull is older than this. */
export const META_ADS_SYNC_MAX_AGE_MS = 60 * 60 * 1000;

export async function readLiveSnapshot(options?: {
  maxAgeMs?: number;
}): Promise<AccountSnapshot | null> {
  const stored = newerSnapshot(await readDbSnapshot(), newerSnapshot(await readStorageSnapshot(), readFileSnapshot()));
  if (options?.maxAgeMs == null) return stored;
  if (snapshotAgeMs(stored) < options.maxAgeMs) return stored;
  try {
    const snapshot = keepSavedTargets(await pullLiveSnapshot(), stored);
    const saveError = await persistLiveSnapshot(snapshot);
    if (saveError) console.error("Meta ads snapshot was not saved", saveError);
    return snapshot;
  } catch (error) {
    console.error("Meta ads sync failed", error instanceof Error ? error.message : error);
    return stored;
  }
}

export async function saveMetaAdsTargets(targets: {
  targetCpl: number | null;
  targetQualifiedCpl: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const snapshot = newerSnapshot(await readDbSnapshot(), newerSnapshot(await readStorageSnapshot(), readFileSnapshot()));
  if (!snapshot || snapshot.isDemo) {
    return { ok: false, error: "No live Meta snapshot is saved yet." };
  }
  const error = await persistLiveSnapshot({
    ...snapshot,
    targetCpl: targets.targetCpl,
    targetQualifiedCpl: targets.targetQualifiedCpl,
  });
  if (error) return { ok: false, error };
  return { ok: true };
}

export async function syncLiveSnapshot(): Promise<AccountSnapshot> {
  const previous = newerSnapshot(await readDbSnapshot(), newerSnapshot(await readStorageSnapshot(), readFileSnapshot()));
  const snapshot = keepSavedTargets(await pullLiveSnapshot(), previous);
  const saveError = await persistLiveSnapshot(snapshot);
  if (saveError) throw new Error(saveError);
  return snapshot;
}

function supabaseAuth(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

function supabaseHeaders(key: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function readDbSnapshot(): Promise<AccountSnapshot | null> {
  const auth = supabaseAuth();
  if (!auth) return null;
  try {
    const response = await fetch(
      `${auth.url}/rest/v1/ic_meta_live_snapshot?id=eq.${encodeURIComponent(SNAPSHOT_ID)}&select=payload`,
      { headers: supabaseHeaders(auth.key) },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ payload?: AccountSnapshot }>;
    const payload = rows[0]?.payload;
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

function readFileSnapshot(): AccountSnapshot | null {
  const file = path.join(process.cwd(), "data", FILE_NAME);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as AccountSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshotFile(snapshot: AccountSnapshot): "saved" | "readonly" | string {
  try {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(snapshot));
    return "saved";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not write the snapshot file.";
    if (/read-only|EROFS|EPERM/i.test(message)) return "readonly";
    return message;
  }
}

/** Returns an error string when the copy the live site reads was not saved. */
export async function persistLiveSnapshot(snapshot: AccountSnapshot): Promise<string | null> {
  if (!isDbConfigured()) {
    const file = writeSnapshotFile(snapshot);
    if (file === "saved") return null;
    if (file === "readonly") return "Database is not configured.";
    return file;
  }

  const tableError = await saveTableSnapshot(snapshot);
  const storageError = tableError ? await saveStorageSnapshot(snapshot) : null;
  writeSnapshotFile(snapshot);
  if (!tableError || !storageError) return null;
  return `${tableError}; ${storageError}`;
}

async function saveTableSnapshot(snapshot: AccountSnapshot): Promise<string | null> {
  const auth = supabaseAuth();
  if (!auth) return "Database is not configured.";
  const response = await fetch(`${auth.url}/rest/v1/ic_meta_live_snapshot`, {
    method: "POST",
    headers: supabaseHeaders(auth.key, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    }),
    body: JSON.stringify({
      id: SNAPSHOT_ID,
      payload: snapshot,
      synced_at: snapshot.syncedAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (response.ok) return null;
  const detail = await response.text();
  return detail.slice(0, 300) || `Snapshot table save failed (${response.status}).`;
}

async function saveStorageSnapshot(snapshot: AccountSnapshot): Promise<string | null> {
  const auth = supabaseAuth();
  if (!auth) return "Database is not configured.";
  const created = await fetch(`${auth.url}/storage/v1/bucket`, {
    method: "POST",
    headers: supabaseHeaders(auth.key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: STORAGE_BUCKET, name: STORAGE_BUCKET, public: false }),
  });
  if (!created.ok && created.status !== 409) {
    const detail = await created.text();
    if (!/already exists|duplicate/i.test(detail)) {
      return detail.slice(0, 300) || `Could not create the snapshot bucket (${created.status}).`;
    }
  }
  const uploaded = await fetch(`${auth.url}/storage/v1/object/${STORAGE_BUCKET}/${STORAGE_OBJECT}`, {
    method: "POST",
    headers: supabaseHeaders(auth.key, {
      "Content-Type": "application/json",
      "x-upsert": "true",
    }),
    body: JSON.stringify(snapshot),
  });
  if (uploaded.ok) return null;
  const detail = await uploaded.text();
  return detail.slice(0, 300) || `Snapshot upload failed (${uploaded.status}).`;
}

async function readStorageSnapshot(): Promise<AccountSnapshot | null> {
  const auth = supabaseAuth();
  if (!auth) return null;
  try {
    const response = await fetch(`${auth.url}/storage/v1/object/${STORAGE_BUCKET}/${STORAGE_OBJECT}`, {
      headers: supabaseHeaders(auth.key),
    });
    if (!response.ok) return null;
    return (await response.json()) as AccountSnapshot;
  } catch {
    return null;
  }
}

function keepSavedTargets(next: AccountSnapshot, previous: AccountSnapshot | null): AccountSnapshot {
  if (!previous) return next;
  return {
    ...next,
    targetCpl: previous.targetCpl,
    targetQualifiedCpl: previous.targetQualifiedCpl ?? null,
  };
}

function newerSnapshot(a: AccountSnapshot | null, b: AccountSnapshot | null): AccountSnapshot | null {
  if (!a) return b;
  if (!b) return a;
  return snapshotTime(a) >= snapshotTime(b) ? a : b;
}

function snapshotAgeMs(snapshot: AccountSnapshot | null): number {
  if (!snapshot) return Number.POSITIVE_INFINITY;
  const synced = snapshotTime(snapshot);
  if (!synced) return Number.POSITIVE_INFINITY;
  return Date.now() - synced;
}

function snapshotTime(snapshot: AccountSnapshot): number {
  if (!snapshot.syncedAt) return 0;
  const parsed = Date.parse(snapshot.syncedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}
