import type { GradeLight, GradeStatus, VehicleGrade } from "@/lib/inspired-closets-ops-vehicles";

export type InstallerGradeLabel = "Solid" | "Watch" | "Needs attention" | "Too new" | "No truck";

export type InstallerJobsGrade = {
  overall: GradeStatus | "new";
  label: InstallerGradeLabel;
  lights: GradeLight[];
  windowDays: number;
  completions30: number;
  openIssues: number;
  issues30: number;
  goBacks30: number;
  minutes30: number;
};

export type InstallerVehicleGradeView = {
  overall: GradeStatus | "none";
  label: InstallerGradeLabel;
  lights: GradeLight[];
  label_name: string | null;
};

export type InstallerOverallGrade = {
  overall: GradeStatus | "new" | "none";
  label: InstallerGradeLabel;
  summary: string;
};

export const INSTALLER_GRADE_WINDOW_DAYS = 30;

/** About 1 issue per 5 completions in the window → Watch. */
const ISSUE_RATE_WARN = 0.2;
/** Go-backs / services as share of recent completed-or-dated work → Watch. */
const GO_BACK_SHARE_WARN = 0.35;
/** Below this recent activity, do not invent a bad grade. */
const MIN_RECENT_ACTIVITY = 2;

function worst(statuses: GradeStatus[]): GradeStatus {
  if (statuses.includes("due")) return "due";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

export function gradeStatusLabel(status: GradeStatus | "new" | "none"): InstallerGradeLabel {
  if (status === "due") return "Needs attention";
  if (status === "warn") return "Watch";
  if (status === "new") return "Too new";
  if (status === "none") return "No truck";
  return "Solid";
}

export function daysAgoIso(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function inWindow(iso: string | null | undefined, sinceIso: string): boolean {
  if (!iso) return false;
  return iso >= sinceIso;
}

function jobActivityDate(job: {
  completed_date?: string | null;
  install_date?: string | null;
}): string | null {
  return job.completed_date ?? job.install_date ?? null;
}

export function gradeInstallerJobs(input: {
  openIssues: number;
  issuesLast30: number;
  completionsLast30: number;
  goBacksLast30: number;
  recentJobsLast30: number;
  clockSessionsLast30: number;
  minutesLast30: number;
  windowDays?: number;
}): InstallerJobsGrade {
  const windowDays = input.windowDays ?? INSTALLER_GRADE_WINDOW_DAYS;
  const lights: GradeLight[] = [];

  const openLight: GradeLight =
    input.openIssues > 0
      ? {
          id: "open_issues",
          label: "Open issues",
          status: "due",
          detail:
            input.openIssues === 1
              ? "1 issue still open"
              : `${input.openIssues} issues still open`,
        }
      : {
          id: "open_issues",
          label: "Open issues",
          status: "ok",
          detail: "None open",
        };
  lights.push(openLight);

  const rate =
    input.completionsLast30 > 0
      ? input.issuesLast30 / input.completionsLast30
      : input.issuesLast30 > 0
        ? 1
        : 0;
  const rateLight: GradeLight =
    input.completionsLast30 === 0 && input.issuesLast30 === 0
      ? {
          id: "issue_rate",
          label: "Issue rate",
          status: "ok",
          detail: `No issues in ${windowDays} days`,
        }
      : rate >= ISSUE_RATE_WARN
        ? {
            id: "issue_rate",
            label: "Issue rate",
            status: "warn",
            detail: `${input.issuesLast30} issues / ${input.completionsLast30 || 0} completions`,
          }
        : {
            id: "issue_rate",
            label: "Issue rate",
            status: "ok",
            detail: `${input.issuesLast30} issues / ${input.completionsLast30} completions`,
          };
  lights.push(rateLight);

  const goBackShare =
    input.recentJobsLast30 > 0 ? input.goBacksLast30 / input.recentJobsLast30 : 0;
  const goBackLight: GradeLight =
    input.recentJobsLast30 === 0
      ? {
          id: "go_backs",
          label: "Go-backs",
          status: "ok",
          detail: "No recent jobs",
        }
      : goBackShare >= GO_BACK_SHARE_WARN
        ? {
            id: "go_backs",
            label: "Go-backs",
            status: "warn",
            detail: `${input.goBacksLast30} of ${input.recentJobsLast30} recent jobs`,
          }
        : {
            id: "go_backs",
            label: "Go-backs",
            status: "ok",
            detail: `${input.goBacksLast30} of ${input.recentJobsLast30} recent jobs`,
          };
  lights.push(goBackLight);

  const activity = input.completionsLast30 + input.clockSessionsLast30;
  if (activity < MIN_RECENT_ACTIVITY && input.openIssues === 0) {
    lights.push({
      id: "activity",
      label: "Recent work",
      status: "ok",
      detail: `Too little in the last ${windowDays} days to score`,
    });
    return {
      overall: "new",
      label: "Too new",
      lights,
      windowDays,
      completions30: input.completionsLast30,
      openIssues: input.openIssues,
      issues30: input.issuesLast30,
      goBacks30: input.goBacksLast30,
      minutes30: input.minutesLast30,
    };
  }

  lights.push({
    id: "activity",
    label: "Recent work",
    status: "ok",
    detail: `${input.completionsLast30} completions · ${input.clockSessionsLast30} clocks`,
  });

  const overall = worst(lights.map((light) => light.status));
  return {
    overall,
    label: gradeStatusLabel(overall),
    lights,
    windowDays,
    completions30: input.completionsLast30,
    openIssues: input.openIssues,
    issues30: input.issuesLast30,
    goBacks30: input.goBacksLast30,
    minutes30: input.minutesLast30,
  };
}

export function summarizeJobsInputs(input: {
  sinceIso: string;
  openIssues: number;
  issues: Array<{ created_at: string; status: string }>;
  jobs: Array<{
    stage: string;
    completed_date: string | null;
    install_date: string | null;
    job_kind: string | null;
  }>;
  entries: Array<{ clock_in_at: string; clock_out_at: string | null }>;
  completedStages: Set<string>;
}): Omit<Parameters<typeof gradeInstallerJobs>[0], "windowDays"> {
  const issuesLast30 = input.issues.filter((row) => inWindow(row.created_at, input.sinceIso)).length;
  const completionsLast30 = input.jobs.filter((job) => {
    const completed = input.completedStages.has(job.stage) || Boolean(job.completed_date);
    if (!completed) return false;
    const when = job.completed_date ?? job.install_date;
    return inWindow(when ? `${when}T12:00:00.000Z` : null, input.sinceIso);
  }).length;

  const recentJobs = input.jobs.filter((job) => {
    const when = jobActivityDate(job);
    return inWindow(when ? `${when}T12:00:00.000Z` : null, input.sinceIso);
  });
  const goBacksLast30 = recentJobs.filter(
    (job) => job.job_kind === "go_back" || job.job_kind === "service",
  ).length;

  const clockSessionsLast30 = input.entries.filter((entry) =>
    inWindow(entry.clock_in_at, input.sinceIso),
  ).length;
  const minutesLast30 = input.entries.reduce((sum, entry) => {
    if (!inWindow(entry.clock_in_at, input.sinceIso) || !entry.clock_out_at) return sum;
    const a = new Date(entry.clock_in_at).getTime();
    const b = new Date(entry.clock_out_at).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return sum;
    return sum + Math.round((b - a) / 60000);
  }, 0);

  return {
    openIssues: input.openIssues,
    issuesLast30,
    completionsLast30,
    goBacksLast30,
    recentJobsLast30: recentJobs.length,
    clockSessionsLast30,
    minutesLast30,
  };
}

export function viewVehicleGrade(
  grade: VehicleGrade | null,
  truckLabel: string | null,
): InstallerVehicleGradeView {
  if (!grade || !truckLabel) {
    return {
      overall: "none",
      label: "No truck",
      lights: [],
      label_name: null,
    };
  }
  return {
    overall: grade.overall,
    label: gradeStatusLabel(grade.overall),
    lights: grade.lights,
    label_name: truckLabel,
  };
}

export function gradeInstallerOverall(
  jobs: InstallerJobsGrade,
  vehicle: InstallerVehicleGradeView,
): InstallerOverallGrade {
  const statuses: GradeStatus[] = [];
  if (jobs.overall !== "new") statuses.push(jobs.overall);
  if (vehicle.overall !== "none") statuses.push(vehicle.overall);

  if (statuses.length === 0) {
    const summary =
      vehicle.overall === "none"
        ? "Too little recent work to score. No truck assigned."
        : "Too little recent work to score.";
    return { overall: "new", label: "Too new", summary };
  }

  const overall = worst(statuses);
  const jobsPart =
    jobs.overall === "new"
      ? "Jobs are too new to score"
      : `Jobs are ${gradeStatusLabel(jobs.overall).toLowerCase()}`;
  const vehiclePart =
    vehicle.overall === "none"
      ? "no truck assigned"
      : `Truck ${gradeStatusLabel(vehicle.overall).toLowerCase()}${
          vehicle.overall !== "ok"
            ? (() => {
                const hit = vehicle.lights.find((light) => light.status === vehicle.overall);
                return hit ? ` — ${hit.detail}` : "";
              })()
            : ""
        }`;

  return {
    overall,
    label: gradeStatusLabel(overall),
    summary: `${jobsPart}. ${vehiclePart.charAt(0).toUpperCase()}${vehiclePart.slice(1)}.`,
  };
}
