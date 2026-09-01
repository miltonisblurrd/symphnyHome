import { getSupabaseAdmin } from "@/db/client";
import {
  crewTokensFromNotes,
  displayNameForInstaller,
  installerKeyFromStaffName,
  isFieldTestJob,
  isFieldTestStaff,
  matchInstallerStaff,
  shouldBeInstallerRole,
  type RosterStaff,
} from "@/lib/inspired-closets-ops-installer-roster";

type JobRow = {
  id: string;
  installer_id: string | null;
  notes: string | null;
  workbook_ref: string | null;
  community_ref: string | null;
};

export type InstallerSyncSummary = {
  created: string[];
  roster: Array<{ name: string; jobs: number }>;
  jobs_assigned: number;
  jobs_reassigned_from_test: number;
  crew_rows: number;
  skipped_tokens: string[];
};

function mergeTokens(base: string[], extra: string[]): string[] {
  const out = [...base];
  for (const token of extra) {
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

export async function syncInstallersFromJobs(input?: {
  extraCrewByWorkbookRef?: Map<string, string[]>;
}): Promise<InstallerSyncSummary> {
  const supabase = getSupabaseAdmin();
  const extra = input?.extraCrewByWorkbookRef ?? new Map<string, string[]>();

  const [{ data: staffRows, error: staffError }, { data: jobs, error: jobsError }, { data: crewRows }] =
    await Promise.all([
      supabase
        .from("ic_staff")
        .select("id, name, role, phone, active")
        .is("deleted_at", null),
      supabase
        .from("ic_jobs")
        .select("id, installer_id, notes, workbook_ref, community_ref")
        .is("deleted_at", null)
        .limit(3000),
      supabase.from("ic_job_crew").select("job_id, installer_id"),
    ]);
  if (staffError) throw new Error(staffError.message);
  if (jobsError) throw new Error(jobsError.message);

  const staff: RosterStaff[] = [...(staffRows ?? [])];
  const created: string[] = [];
  const skipped = new Set<string>();

  const tokensNeeded = new Set<string>();
  for (const job of jobs ?? []) {
    if (isFieldTestJob(job)) continue;
    for (const token of crewTokensFromNotes(job.notes)) tokensNeeded.add(token);
    const extraTokens = job.workbook_ref ? extra.get(job.workbook_ref) ?? [] : [];
    for (const token of extraTokens) tokensNeeded.add(token);
  }

  for (const token of tokensNeeded) {
    if (matchInstallerStaff(token, staff)) continue;
    const name = displayNameForInstaller(token);
    const today = new Date().toISOString().slice(0, 10);
    const { data: createdRow, error } = await supabase
      .from("ic_staff")
      .insert({
        name,
        role: "installer",
        title: "Installer",
        hired_at: today,
        active: true,
      })
      .select("id, name, role, phone, active")
      .single();
    if (error) throw new Error(error.message);
    staff.push(createdRow);
    created.push(name);
  }

  for (const row of staff) {
    if (isFieldTestStaff(row)) continue;
    const token = installerKeyFromStaffName(row.name);
    if (!token) continue;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let changed = false;
    if (shouldBeInstallerRole(row)) {
      patch.role = "installer";
      patch.title = "Installer";
      row.role = "installer";
      changed = true;
    }
    const nice = displayNameForInstaller(token);
    if (row.name !== nice && (row.name === row.name.toUpperCase() || row.name.toUpperCase() === "MANDO")) {
      patch.name = nice;
      row.name = nice;
      changed = true;
    }
    if (!changed) continue;
    const { error } = await supabase.from("ic_staff").update(patch).eq("id", row.id);
    if (error) throw new Error(error.message);
  }

  const existingCrew = new Set(
    (crewRows ?? []).map((row) => `${row.job_id}:${row.installer_id}`),
  );
  const jobCounts = new Map<string, number>();
  let jobsAssigned = 0;
  let reassignedFromTest = 0;
  let crewInserted = 0;

  for (const job of (jobs ?? []) as JobRow[]) {
    if (isFieldTestJob(job)) continue;
    const fromNotes = crewTokensFromNotes(job.notes);
    const fromWorkbook = job.workbook_ref ? extra.get(job.workbook_ref) ?? [] : [];
    const tokens = mergeTokens(fromNotes, fromWorkbook);
    if (tokens.length === 0) continue;

    const people = tokens
      .map((token) => matchInstallerStaff(token, staff))
      .filter((row): row is RosterStaff => Boolean(row));
    if (people.length === 0) {
      for (const token of tokens) skipped.add(token);
      continue;
    }

    const lead = people[0];
    const current = staff.find((row) => row.id === job.installer_id) ?? null;
    const currentIsTest = current ? isFieldTestStaff(current) : false;
    if (!job.installer_id || currentIsTest) {
      const { error } = await supabase
        .from("ic_jobs")
        .update({ installer_id: lead.id, updated_at: new Date().toISOString() })
        .eq("id", job.id);
      if (error) throw new Error(error.message);
      jobsAssigned += 1;
      if (currentIsTest) reassignedFromTest += 1;
    }

    for (const person of people) {
      jobCounts.set(person.name, (jobCounts.get(person.name) ?? 0) + 1);
      const key = `${job.id}:${person.id}`;
      if (existingCrew.has(key)) continue;
      const { error } = await supabase.from("ic_job_crew").insert({
        job_id: job.id,
        installer_id: person.id,
        status: "approved",
        decided_at: new Date().toISOString(),
      });
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
      existingCrew.add(key);
      crewInserted += 1;
    }
  }

  return {
    created,
    roster: [...jobCounts.entries()]
      .map(([name, jobs]) => ({ name, jobs }))
      .sort((a, b) => b.jobs - a.jobs),
    jobs_assigned: jobsAssigned,
    jobs_reassigned_from_test: reassignedFromTest,
    crew_rows: crewInserted,
    skipped_tokens: [...skipped],
  };
}
