import path from "node:path";
import { loadDotEnv } from "./content-engine/load-env";
import { buildDrafts } from "./import-ic-jobs-from-services";
import {
  crewTokensFromNotes,
  displayNameForInstaller,
  installerKeyFromStaffName,
  isFieldTestJob,
  isFieldTestStaff,
  matchInstallerStaff,
  parseCrewTokens,
  shouldBeInstallerRole,
  type RosterStaff,
} from "../src/lib/inspired-closets-ops-installer-roster";

const ROOT = path.resolve(__dirname, "..");

function rest(url: string, key: string, pathname: string, init: RequestInit = {}) {
  return fetch(`${url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

async function fetchAll<T>(url: string, key: string, tableQuery: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const res = await rest(url, key, tableQuery, {
      headers: { Range: `${from}-${from + page - 1}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

function mergeTokens(base: string[], extra: string[]): string[] {
  const out = [...base];
  for (const token of extra) {
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  loadDotEnv(ROOT);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const extra = new Map<string, string[]>();
  const { jobs: drafts } = buildDrafts();
  for (const draft of drafts) {
    const tokens = mergeTokens(
      parseCrewTokens(draft.installerHint),
      crewTokensFromNotes(draft.notes.join("\n")),
    );
    if (tokens.length) extra.set(draft.ref, tokens);
  }

  const staff = await fetchAll<RosterStaff>(
    url,
    key,
    "ic_staff?deleted_at=is.null&select=id,name,role,phone,active",
  );
  const jobs = await fetchAll<{
    id: string;
    installer_id: string | null;
    notes: string | null;
    workbook_ref: string | null;
    community_ref: string | null;
  }>(
    url,
    key,
    "ic_jobs?deleted_at=is.null&select=id,installer_id,notes,workbook_ref,community_ref",
  );
  const crewRows = await fetchAll<{ job_id: string; installer_id: string }>(
    url,
    key,
    "ic_job_crew?select=job_id,installer_id",
  );

  const tokensNeeded = new Set<string>();
  for (const job of jobs) {
    if (isFieldTestJob(job)) continue;
    for (const token of crewTokensFromNotes(job.notes)) tokensNeeded.add(token);
    for (const token of job.workbook_ref ? extra.get(job.workbook_ref) ?? [] : []) {
      tokensNeeded.add(token);
    }
  }

  const toCreate = [...tokensNeeded].filter((token) => !matchInstallerStaff(token, staff));
  const previewCounts = new Map<string, number>();
  let wouldAssign = 0;
  let wouldReassignTest = 0;
  let wouldCrew = 0;
  const existingCrew = new Set(crewRows.map((row) => `${row.job_id}:${row.installer_id}`));
  const plannedCrew = new Set(existingCrew);

  const staffAfterCreate: RosterStaff[] = [
    ...staff,
    ...toCreate.map((token) => ({
      id: `pending:${token}`,
      name: displayNameForInstaller(token),
      role: "installer",
      phone: null,
      active: true,
    })),
  ];

  for (const job of jobs) {
    if (isFieldTestJob(job)) continue;
    const tokens = mergeTokens(
      crewTokensFromNotes(job.notes),
      job.workbook_ref ? extra.get(job.workbook_ref) ?? [] : [],
    );
    if (tokens.length === 0) continue;
    const people = tokens
      .map((token) => matchInstallerStaff(token, staffAfterCreate))
      .filter((row): row is RosterStaff => Boolean(row));
    if (people.length === 0) continue;
    const current = staff.find((row) => row.id === job.installer_id) ?? null;
    const currentIsTest = current ? isFieldTestStaff(current) : false;
    if (!job.installer_id || currentIsTest) {
      wouldAssign += 1;
      if (currentIsTest) wouldReassignTest += 1;
    }
    for (const person of people) {
      previewCounts.set(person.name, (previewCounts.get(person.name) ?? 0) + 1);
      const key = `${job.id}:${person.id}`;
      if (plannedCrew.has(key)) continue;
      plannedCrew.add(key);
      wouldCrew += 1;
    }
  }

  const summary = {
    apply,
    existing_installers: staff
      .filter((row) => row.role === "installer")
      .map((row) => ({
        name: row.name,
        test: isFieldTestStaff(row),
        has_phone: Boolean(row.phone && row.phone !== "0000000000"),
      })),
    create: toCreate.map(displayNameForInstaller),
    jobs_with_crew_names: previewCounts.size
      ? Object.fromEntries([...previewCounts.entries()].sort((a, b) => b[1] - a[1]))
      : {},
    jobs_to_assign: wouldAssign,
    reassign_off_field_test: wouldReassignTest,
    crew_rows_to_add: wouldCrew,
    workbook_crew_refs: extra.size,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return;

  for (const token of toCreate) {
    const res = await rest(url, key, "ic_staff", {
      method: "POST",
      body: JSON.stringify({
        name: displayNameForInstaller(token),
        role: "installer",
        title: "Installer",
        hired_at: new Date().toISOString().slice(0, 10),
        active: true,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const [row] = (await res.json()) as RosterStaff[];
    staff.push({ ...row, active: true });
  }

  for (const row of staff) {
    if (isFieldTestStaff(row)) continue;
    const token = installerKeyFromStaffName(row.name);
    if (!token) continue;
    const patch: Record<string, unknown> = {};
    if (shouldBeInstallerRole(row)) {
      patch.role = "installer";
      patch.title = "Installer";
      row.role = "installer";
    }
    const nice = displayNameForInstaller(token);
    if (row.name !== nice && (row.name === row.name.toUpperCase() || row.name.toUpperCase() === "MANDO")) {
      patch.name = nice;
      row.name = nice;
    }
    if (Object.keys(patch).length === 0) continue;
    patch.updated_at = new Date().toISOString();
    const res = await rest(url, key, `ic_staff?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  let jobsAssigned = 0;
  let reassignedFromTest = 0;
  let crewInserted = 0;
  const liveCrew = new Set(
    (
      await fetchAll<{ job_id: string; installer_id: string }>(
        url,
        key,
        "ic_job_crew?select=job_id,installer_id",
      )
    ).map((row) => `${row.job_id}:${row.installer_id}`),
  );

  for (const job of jobs) {
    if (isFieldTestJob(job)) continue;
    const tokens = mergeTokens(
      crewTokensFromNotes(job.notes),
      job.workbook_ref ? extra.get(job.workbook_ref) ?? [] : [],
    );
    if (tokens.length === 0) continue;
    const people = tokens
      .map((token) => matchInstallerStaff(token, staff))
      .filter((row): row is RosterStaff => Boolean(row));
    if (people.length === 0) continue;
    const lead = people[0];
    const current = staff.find((row) => row.id === job.installer_id) ?? null;
    const currentIsTest = current ? isFieldTestStaff(current) : false;
    if (!job.installer_id || currentIsTest) {
      const res = await rest(url, key, `ic_jobs?id=eq.${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ installer_id: lead.id, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(await res.text());
      jobsAssigned += 1;
      if (currentIsTest) reassignedFromTest += 1;
    }
    const crewBody = people
      .filter((person) => !liveCrew.has(`${job.id}:${person.id}`))
      .map((person) => ({
        job_id: job.id,
        installer_id: person.id,
        status: "approved",
        decided_at: new Date().toISOString(),
      }));
    if (crewBody.length === 0) continue;
    const res = await rest(url, key, "ic_job_crew", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(crewBody),
    });
    if (!res.ok) throw new Error(await res.text());
    for (const row of crewBody) liveCrew.add(`${row.job_id}:${row.installer_id}`);
    crewInserted += crewBody.length;
  }

  console.log(
    JSON.stringify(
      {
        applied: true,
        created: toCreate.map(displayNameForInstaller),
        jobs_assigned: jobsAssigned,
        reassign_off_field_test: reassignedFromTest,
        crew_rows: crewInserted,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
