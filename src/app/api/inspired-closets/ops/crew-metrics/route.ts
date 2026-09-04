import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import {
  daysAgoIso,
  gradeInstallerJobs,
  gradeInstallerOverall,
  summarizeJobsInputs,
  viewVehicleGrade,
} from "@/lib/inspired-closets-ops-installer-grade";
import {
  gradeVehicle,
  startOfWeekIso,
  vehicleLabel,
  type VehicleLogRow,
  type VehicleRow,
} from "@/lib/inspired-closets-ops-vehicles";

export const runtime = "nodejs";

type TimeEntry = {
  id: string;
  job_id: string;
  installer_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  note: string | null;
};

type IssueRow = {
  id: string;
  installer_id: string | null;
  job_id: string;
  issue_type: string;
  status: string;
  description: string | null;
  created_at: string;
  resolved_at: string | null;
};

type JobRow = {
  id: string;
  installer_id: string | null;
  stage: string;
  install_date: string | null;
  completed_date: string | null;
  client_id: string | null;
  notes: string | null;
  job_kind: string | null;
  visit_window: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
};

type StaffRow = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  hired_at: string | null;
  title: string | null;
  created_at: string;
  password_hash?: string | null;
};

const COMPLETED_STAGES = new Set(["install_complete", "final_payment", "closed"]);
const ACTIVE_STAGES = new Set(["install_scheduled", "install_in_progress"]);

function minutesBetween(start: string, end: string | null): number | null {
  if (!end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

function tenureLabel(hiredAt: string | null, createdAt: string | null): string {
  const raw = hiredAt ?? (createdAt ? createdAt.slice(0, 10) : null);
  if (!raw) return "New to the team";
  const start = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(start.getTime())) return "New to the team";
  const months = Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
  );
  if (months < 1) return "Just started";
  if (months < 12) return `${months} mo with IC`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} yr with IC`;
  return `${years} yr ${rem} mo with IC`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function clientFor(job: JobRow, clientsById: Map<string, ClientRow>) {
  return job.client_id ? (clientsById.get(job.client_id) ?? null) : null;
}

function buildJobsGrade(
  personId: string,
  entries: TimeEntry[],
  issueRows: IssueRow[],
  jobRows: JobRow[],
) {
  const theirEntries = entries.filter((e) => e.installer_id === personId);
  const theirIssues = issueRows.filter((i) => i.installer_id === personId);
  const theirJobs = jobRows.filter((j) => j.installer_id === personId);
  const sinceIso = daysAgoIso(30);
  return gradeInstallerJobs(
    summarizeJobsInputs({
      sinceIso,
      openIssues: theirIssues.filter((i) => i.status === "open").length,
      issues: theirIssues,
      jobs: theirJobs,
      entries: theirEntries,
      completedStages: COMPLETED_STAGES,
    }),
  );
}

function buildInstaller(
  person: StaffRow,
  entries: TimeEntry[],
  issueRows: IssueRow[],
  jobRows: JobRow[],
  vehicleGrade: ReturnType<typeof viewVehicleGrade>,
) {
  const theirEntries = entries.filter((e) => e.installer_id === person.id);
  const closedMinutes = theirEntries
    .map((e) => minutesBetween(e.clock_in_at, e.clock_out_at))
    .filter((m): m is number => m != null);
  const totalMinutes = closedMinutes.reduce((sum, m) => sum + m, 0);
  const openSessions = theirEntries.filter((e) => !e.clock_out_at).length;

  const theirIssues = issueRows.filter((i) => i.installer_id === person.id);
  const theirJobs = jobRows.filter((j) => j.installer_id === person.id);
  const completions = theirJobs.filter(
    (j) => COMPLETED_STAGES.has(j.stage) || Boolean(j.completed_date),
  ).length;
  const activeJobs = theirJobs.filter((j) => ACTIVE_STAGES.has(j.stage)).length;

  const minutesByJob = new Map<string, number>();
  for (const entry of theirEntries) {
    const mins = minutesBetween(entry.clock_in_at, entry.clock_out_at);
    if (mins == null) continue;
    minutesByJob.set(entry.job_id, (minutesByJob.get(entry.job_id) ?? 0) + mins);
  }
  const jobDurations = [...minutesByJob.values()];
  const jobsGrade = buildJobsGrade(person.id, entries, issueRows, jobRows);
  const overall = gradeInstallerOverall(jobsGrade, vehicleGrade);

  return {
    id: person.id,
    name: person.name,
    role: person.role,
    active: person.active,
    phone: person.phone,
    email: person.email,
    title: person.title || "Installer",
    hiredAt: person.hired_at,
    tenureLabel: tenureLabel(person.hired_at, person.created_at),
    avatarUrl: person.avatar_url,
    initials: initials(person.name),
    onSiteNow: openSessions > 0,
    sessions: theirEntries.length,
    openSessions,
    totalMinutes,
    avgSessionMinutes:
      closedMinutes.length > 0 ? Math.round(totalMinutes / closedMinutes.length) : null,
    avgJobMinutes:
      jobDurations.length > 0
        ? Math.round(jobDurations.reduce((a, b) => a + b, 0) / jobDurations.length)
        : null,
    jobsClocked: minutesByJob.size,
    completions,
    activeJobs,
    issuesReported: theirIssues.length,
    openIssues: theirIssues.filter((i) => i.status === "open").length,
    grade: {
      overall,
      jobs: jobsGrade,
      vehicle: vehicleGrade,
    },
  };
}

function gradeFromVehicleLogs(vehicle: VehicleRow, logs: VehicleLogRow[], weekMiles: number) {
  const lastWash = logs.find((row) => row.kind === "wash") ?? null;
  const lastClean = logs.find((row) => row.kind === "clean_check") ?? null;
  const lastOdo = logs.find((row) => row.kind === "odometer" || row.odometer != null) ?? null;
  const lastOil = logs.find((row) => row.kind === "oil") ?? null;
  return gradeVehicle({
    vehicle,
    lastWashAt: lastWash?.logged_at ?? null,
    lastCleanAt: lastClean?.logged_at ?? null,
    lastCleanOk: lastClean?.clean_ok ?? null,
    lastOdometerAt: lastOdo?.logged_at ?? null,
    lastOilAt: lastOil?.logged_at ?? null,
    lastOilMiles: lastOil?.odometer ?? null,
    weekMiles,
  });
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const installerId = new URL(request.url).searchParams.get("id");
  const supabase = getSupabaseAdmin();

  const mediaQuery = installerId
    ? supabase
        .from("ic_job_media")
        .select("id, job_id, kind, public_url, caption, created_at")
        .eq("installer_id", installerId)
        .order("created_at", { ascending: false })
        .limit(80)
    : Promise.resolve({ data: [] as Record<string, unknown>[], error: null });

  const apptQuery = installerId
    ? supabase
        .from("ic_appointments")
        .select("id, job_id, kind, scheduled_at, status, subject, location_text")
        .eq("installer_id", installerId)
        .order("scheduled_at", { ascending: false })
        .limit(40)
    : Promise.resolve({ data: [] as Record<string, unknown>[], error: null });

  const [
    { data: staff, error: staffError },
    { data: timeEntries, error: timeError },
    { data: issues, error: issuesError },
    { data: jobs, error: jobsError },
    { data: clients },
    { data: mediaRows, error: mediaError },
    { data: appointmentRows, error: apptError },
    trucksResult,
  ] = await Promise.all([
    supabase
      .from("ic_staff")
      .select("id, name, role, active, phone, email, avatar_url, hired_at, title, created_at")
      .is("deleted_at", null)
      .eq("active", true)
      .order("name"),
    supabase
      .from("ic_time_entries")
      .select("id, job_id, installer_id, clock_in_at, clock_out_at, note")
      .order("clock_in_at", { ascending: false })
      .limit(2000),
    supabase
      .from("ic_field_issues")
      .select("id, installer_id, job_id, issue_type, status, description, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("ic_jobs")
      .select(
        "id, installer_id, stage, install_date, completed_date, client_id, notes, job_kind, visit_window",
      )
      .is("deleted_at", null)
      .limit(5000),
    supabase.from("ic_clients").select("id, name, address, phone").is("deleted_at", null),
    mediaQuery,
    apptQuery,
    supabase
      .from("ic_vehicles")
      .select("*")
      .is("deleted_at", null)
      .eq("active", true),
  ]);

  if (staffError || timeError || issuesError || jobsError || mediaError || apptError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          staffError?.message ??
          timeError?.message ??
          issuesError?.message ??
          jobsError?.message ??
          mediaError?.message ??
          apptError?.message ??
          "Failed to load installers.",
      },
      { status: 500 },
    );
  }

  const clientsById = new Map(((clients ?? []) as ClientRow[]).map((c) => [c.id, c]));
  const entries = (timeEntries ?? []) as TimeEntry[];
  const issueRows = (issues ?? []) as IssueRow[];
  const jobRows = (jobs ?? []) as JobRow[];
  const staffRows = (staff ?? []) as StaffRow[];

  const trucksMissing =
    trucksResult.error && /does not exist|schema cache|ic_vehicles/i.test(trucksResult.error.message);
  const trucks = trucksMissing ? ([] as VehicleRow[]) : ((trucksResult.data ?? []) as VehicleRow[]);
  const trucksByInstaller = new Map<string, VehicleRow>();
  for (const truck of trucks) {
    if (truck.assigned_installer_id) trucksByInstaller.set(truck.assigned_installer_id, truck);
  }

  const truckIds = trucks.map((truck) => truck.id);
  type VehicleLogWithTruck = VehicleLogRow & { vehicle_id: string };
  let vehicleLogs: VehicleLogWithTruck[] = [];
  let milesByInstaller = new Map<string, number>();
  if (truckIds.length > 0) {
    const weekStart = startOfWeekIso().slice(0, 10);
    const [{ data: logs }, milesResult] = await Promise.all([
      supabase
        .from("ic_vehicle_logs")
        .select("id, kind, logged_at, odometer, gallons, amount_cents, clean_ok, note, vehicle_id")
        .in("vehicle_id", truckIds)
        .order("logged_at", { ascending: false })
        .limit(2000),
      supabase
        .from("ic_job_miles")
        .select("installer_id, miles_out, miles_back, drive_date")
        .gte("drive_date", weekStart)
        .limit(2000),
    ]);
    vehicleLogs = (logs ?? []) as VehicleLogWithTruck[];
    milesByInstaller = new Map();
    const milesMissing =
      milesResult.error && /does not exist|schema cache|ic_job_miles/i.test(milesResult.error.message);
    if (!milesMissing) {
      for (const row of (milesResult.data ?? []) as Array<{
        installer_id: string;
        miles_out: number;
        miles_back: number;
      }>) {
        milesByInstaller.set(
          row.installer_id,
          (milesByInstaller.get(row.installer_id) ?? 0) + (row.miles_out || 0) + (row.miles_back || 0),
        );
      }
    }
  }

  const logsByVehicle = new Map<string, VehicleLogRow[]>();
  for (const log of vehicleLogs) {
    const list = logsByVehicle.get(log.vehicle_id) ?? [];
    list.push(log);
    logsByVehicle.set(log.vehicle_id, list);
  }

  function vehicleGradeFor(personId: string) {
    const truck = trucksByInstaller.get(personId);
    if (!truck) return viewVehicleGrade(null, null);
    const grade = gradeFromVehicleLogs(
      truck,
      logsByVehicle.get(truck.id) ?? [],
      milesByInstaller.get(personId) ?? 0,
    );
    return viewVehicleGrade(grade, vehicleLabel(truck));
  }

  const installers = staffRows
    .filter((person) => person.phone !== "0000000000")
    .filter((person) => person.role === "installer" || person.role === "ops")
    .map((person) =>
      buildInstaller(person, entries, issueRows, jobRows, vehicleGradeFor(person.id)),
    )
    .filter(
      (row) =>
        row.role === "installer" ||
        row.sessions > 0 ||
        row.completions > 0 ||
        row.issuesReported > 0,
    )
    .sort((a, b) => {
      const rank = (status: string) =>
        status === "due" ? 0 : status === "warn" ? 1 : status === "new" || status === "none" ? 3 : 2;
      const byGrade = rank(a.grade.overall.overall) - rank(b.grade.overall.overall);
      if (byGrade !== 0) return byGrade;
      return Number(b.onSiteNow) - Number(a.onSiteNow) || b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name);
    });

  function mapSession(entry: TimeEntry) {
    const job = jobRows.find((j) => j.id === entry.job_id);
    const client = job ? clientFor(job, clientsById) : null;
    const staffRow = staffRows.find((s) => s.id === entry.installer_id);
    return {
      id: entry.id,
      installerId: entry.installer_id,
      installerName: staffRow?.name ?? "Unknown",
      jobId: entry.job_id,
      clientName: client?.name ?? "Job",
      clockInAt: entry.clock_in_at,
      clockOutAt: entry.clock_out_at,
      minutes: minutesBetween(entry.clock_in_at, entry.clock_out_at),
      open: !entry.clock_out_at,
      note: entry.note,
    };
  }

  function mapIssue(issue: IssueRow) {
    const job = jobRows.find((j) => j.id === issue.job_id);
    const client = job ? clientFor(job, clientsById) : null;
    const staffRow = staffRows.find((s) => s.id === issue.installer_id);
    return {
      id: issue.id,
      installerId: issue.installer_id,
      installerName: staffRow?.name ?? "Unassigned",
      jobId: issue.job_id,
      clientName: client?.name ?? "Job",
      issueType: issue.issue_type,
      status: issue.status,
      description: issue.description,
      createdAt: issue.created_at,
      resolvedAt: issue.resolved_at,
    };
  }

  const recentSessions = entries.slice(0, 40).map(mapSession);
  const recentIssues = issueRows.slice(0, 30).map(mapIssue);

  const payload: Record<string, unknown> = {
    ok: true,
    storage: {
      clocks: "ic_time_entries",
      issues: "ic_field_issues",
      completions: "ic_jobs.stage / completed_date",
    },
    installers,
    recentSessions,
    recentIssues,
  };

  if (installerId) {
    const person = staffRows.find((s) => s.id === installerId);
    if (!person) {
      return NextResponse.json({ ok: false, error: "Installer not found." }, { status: 404 });
    }

    const vehicleGrade = vehicleGradeFor(installerId);
    const installer = buildInstaller(person, entries, issueRows, jobRows, vehicleGrade);
    const theirJobIds = new Set([
      ...jobRows.filter((j) => j.installer_id === installerId).map((j) => j.id),
      ...entries.filter((e) => e.installer_id === installerId).map((e) => e.job_id),
    ]);

    const jobsForFile = jobRows
      .filter((j) => theirJobIds.has(j.id) || j.installer_id === installerId)
      .map((job) => {
        const client = clientFor(job, clientsById);
        return {
          id: job.id,
          clientName: client?.name ?? "Job",
          address: client?.address ?? null,
          phone: client?.phone ?? null,
          stage: job.stage,
          installDate: job.install_date,
          completedDate: job.completed_date,
          jobKind: job.job_kind,
          visitWindow: job.visit_window,
          notes: job.notes,
        };
      })
      .sort((a, b) => {
        const activeA = ACTIVE_STAGES.has(a.stage) ? 0 : COMPLETED_STAGES.has(a.stage) ? 2 : 1;
        const activeB = ACTIVE_STAGES.has(b.stage) ? 0 : COMPLETED_STAGES.has(b.stage) ? 2 : 1;
        if (activeA !== activeB) return activeA - activeB;
        return (b.installDate ?? b.completedDate ?? "").localeCompare(
          a.installDate ?? a.completedDate ?? "",
        );
      });

    const media = ((mediaRows ?? []) as Array<{
      id: string;
      job_id: string;
      kind: string;
      public_url: string | null;
      caption: string | null;
      created_at: string;
    }>).map((item) => {
      const job = jobRows.find((j) => j.id === item.job_id);
      const client = job ? clientFor(job, clientsById) : null;
      return {
        id: item.id,
        jobId: item.job_id,
        kind: item.kind,
        publicUrl: item.public_url,
        caption: item.caption,
        createdAt: item.created_at,
        clientName: client?.name ?? "Job",
      };
    });

    const upcoming = ((appointmentRows ?? []) as Array<{
      id: string;
      job_id: string | null;
      kind: string;
      scheduled_at: string;
      status: string;
      subject: string | null;
      location_text: string | null;
    }>).map((appt) => {
      const job = appt.job_id ? jobRows.find((j) => j.id === appt.job_id) : null;
      const client = job ? clientFor(job, clientsById) : null;
      return {
        id: appt.id,
        kind: appt.kind,
        scheduledAt: appt.scheduled_at,
        status: appt.status,
        subject: appt.subject,
        locationText: appt.location_text,
        clientName: client?.name ?? appt.subject ?? "Visit",
      };
    });

    const [{ data: timeOff }, { data: pay }, { data: access }] = await Promise.all([
      supabase
        .from("ic_time_off")
        .select("id, kind, start_date, end_date, note, status, created_at")
        .eq("installer_id", installerId)
        .order("start_date", { ascending: false })
        .limit(40),
      supabase.from("ic_staff_pay").select("*").eq("staff_id", installerId).maybeSingle(),
      supabase.from("ic_staff").select("password_hash").eq("id", installerId).maybeSingle(),
    ]);

    const truck = trucksByInstaller.get(installerId) ?? null;
    payload.installer = { ...installer, hasPassword: Boolean(access?.password_hash) };
    payload.sessions = entries.filter((e) => e.installer_id === installerId).map(mapSession);
    payload.issues = issueRows.filter((i) => i.installer_id === installerId).map(mapIssue);
    payload.jobs = jobsForFile;
    payload.media = media;
    payload.upcoming = upcoming;
    payload.timeOff = timeOff ?? [];
    payload.pay = pay ?? null;
    payload.vehicle = truck
      ? {
          id: truck.id,
          label: vehicleLabel(truck),
          grade: vehicleGrade,
        }
      : null;
  }

  return NextResponse.json(payload);
}
