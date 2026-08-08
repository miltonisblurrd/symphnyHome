export const IC_STAFF_ID_COOKIE = "ic-staff-id";
export const IC_STAFF_ROLE_COOKIE = "ic-staff-role";
export const IC_STAFF_NAME_COOKIE = "ic-staff-name";

export const FIELD_JOB_STAGES = [
  "install_scheduled",
  "install_in_progress",
  "ordered",
  "job_check",
] as const;

export const MEDIA_KINDS = [
  { id: "before", label: "Before" },
  { id: "during", label: "During" },
  { id: "after", label: "After" },
  { id: "issue", label: "Issue" },
  { id: "staging", label: "Staging" },
] as const;

export const ISSUE_TYPES = [
  { id: "site_not_ready", label: "Site not ready" },
  { id: "missing_part", label: "Missing part" },
  { id: "damage", label: "Damage" },
  { id: "access_problem", label: "Access problem" },
  { id: "customer_issue", label: "Customer issue" },
  { id: "other", label: "Other" },
] as const;

export function isInstallerRole(role: string | null | undefined): boolean {
  return role === "installer";
}

export function canAccessOps(role: string | null | undefined): boolean {
  if (!role) return true; // no staff session yet — allow ops (prototype password already passed)
  return !isInstallerRole(role);
}
