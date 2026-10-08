export const HELP_BUCKET = "ic-help-uploads";

export const HELP_PRIORITIES = [
  { id: "low", label: "Low: nice to have" },
  { id: "medium", label: "Medium: annoying but workable" },
  { id: "high", label: "High: blocking my work" },
  { id: "urgent", label: "Urgent: customers or money affected" },
] as const;

export type HelpPriority = (typeof HELP_PRIORITIES)[number]["id"];

export function isHelpPriority(value: unknown): value is HelpPriority {
  return HELP_PRIORITIES.some((row) => row.id === value);
}

export function helpPriorityLabel(id: string): string {
  return HELP_PRIORITIES.find((row) => row.id === id)?.label ?? id;
}

export type HelpAttachment = {
  path: string;
  name: string;
  mime_type: string | null;
  bytes: number | null;
};
