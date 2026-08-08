import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";

export const runtime = "nodejs";

type TimeEntry = {
  id: string;
  job_id: string;
  installer_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
};

type IssueRow = {
  id: string;
  installer_id: string | null;
  job_id: string;
  issue_type: string;
  status: string;
  created_at: string;
};

type JobRow = {
  id: string;
  installer_id: string | null;
  stage: string;
  completed_date: string | null;
  client_id: string | null;
};

function minutesBetween(start: string, end: string | null): number | null {
  if (!end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();

  const [
    { data: staff, error: staffError },
    { data: timeEntries, error: timeError },
    { data: issues, error: issuesError },
    { data: jobs, error: jobsError },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("ic_staff")
      .select("id, name, role, active")
      .eq("active", true)
      .order("name"),
    supabase
      .from("ic_time_entries")
      .select("id, job_id, installer_id, clock_in_at, clock_out_at")
      .order("clock_in_at", { ascending: false })
      .limit(2000),
    supabase
      .from("ic_field_issues")
      .select("id, installer_id, job_id, issue_type, status, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("ic_jobs")
      .select("id, installer_id, stage, completed_date, client_id")
      .is("deleted_at", null)
      .limit(5000),
    supabase.from("ic_clients").select("id, name").is("deleted_at", null),
  ]);

  if (staffError || timeError || issuesError || jobsError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          staffError?.message ??
          timeError?.message ??
          issuesError?.message ??
          jobsError?.message ??
          "Failed to load metrics.",
      },
      { status: 500 },
    );
  }

  const clientsById = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const entries = (timeEntries ?? []) as TimeEntry[];
  const issueRows = (issues ?? []) as IssueRow[];
  const jobRows = (jobs ?? []) as JobRow[];

  const completedStages = new Set(["install_complete", "final_payment", "closed"]);

  const installers = (staff ?? [])
    .filter((person) => person.role === "installer" || person.role === "ops")
    .map((person) => {
      const theirEntries = entries.filter((e) => e.installer_id === person.id);
      const closedMinutes = theirEntries
        .map((e) => minutesBetween(e.clock_in_at, e.clock_out_at))
        .filter((m): m is number => m != null);
      const totalMinutes = closedMinutes.reduce((sum, m) => sum + m, 0);
      const sessions = theirEntries.length;
      const openSessions = theirEntries.filter((e) => !e.clock_out_at).length;

      const theirIssues = issueRows.filter((i) => i.installer_id === person.id);
      const openIssues = theirIssues.filter((i) => i.status === "open").length;

      const theirJobs = jobRows.filter((j) => j.installer_id === person.id);
      const completions = theirJobs.filter(
        (j) => completedStages.has(j.stage) || Boolean(j.completed_date),
      ).length;

      // Average on-site minutes per closed clock session (proxy for install duration).
      const avgSessionMinutes =
        closedMinutes.length > 0
          ? Math.round(totalMinutes / closedMinutes.length)
          : null;

      // Job-level total: sum closed minutes grouped by job, then average.
      const minutesByJob = new Map<string, number>();
      for (const entry of theirEntries) {
        const mins = minutesBetween(entry.clock_in_at, entry.clock_out_at);
        if (mins == null) continue;
        minutesByJob.set(entry.job_id, (minutesByJob.get(entry.job_id) ?? 0) + mins);
      }
      const jobDurations = [...minutesByJob.values()];
      const avgJobMinutes =
        jobDurations.length > 0
          ? Math.round(jobDurations.reduce((a, b) => a + b, 0) / jobDurations.length)
          : null;

      return {
        id: person.id,
        name: person.name,
        role: person.role,
        sessions,
        openSessions,
        totalMinutes,
        avgSessionMinutes,
        avgJobMinutes,
        jobsClocked: minutesByJob.size,
        completions,
        issuesReported: theirIssues.length,
        openIssues,
      };
    })
    .filter(
      (row) =>
        row.sessions > 0 ||
        row.completions > 0 ||
        row.issuesReported > 0 ||
        row.role === "installer",
    )
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name));

  const recentSessions = entries.slice(0, 40).map((entry) => {
    const job = jobRows.find((j) => j.id === entry.job_id);
    const staffRow = (staff ?? []).find((s) => s.id === entry.installer_id);
    return {
      id: entry.id,
      installerName: staffRow?.name ?? "Unknown",
      clientName: job?.client_id ? clientsById.get(job.client_id) ?? "Job" : "Job",
      clockInAt: entry.clock_in_at,
      clockOutAt: entry.clock_out_at,
      minutes: minutesBetween(entry.clock_in_at, entry.clock_out_at),
      open: !entry.clock_out_at,
    };
  });

  const recentIssues = issueRows.slice(0, 30).map((issue) => {
    const job = jobRows.find((j) => j.id === issue.job_id);
    const staffRow = (staff ?? []).find((s) => s.id === issue.installer_id);
    return {
      id: issue.id,
      installerName: staffRow?.name ?? "Unassigned",
      clientName: job?.client_id ? clientsById.get(job.client_id) ?? "Job" : "Job",
      issueType: issue.issue_type,
      status: issue.status,
      createdAt: issue.created_at,
    };
  });

  return NextResponse.json({
    ok: true,
    storage: {
      clocks: "ic_time_entries",
      issues: "ic_field_issues",
      completions: "ic_jobs.stage / completed_date",
    },
    installers,
    recentSessions,
    recentIssues,
  });
}
