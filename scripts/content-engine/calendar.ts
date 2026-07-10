import fs from "node:fs";
import path from "node:path";

export type CalendarPack = {
  day: number;
  week: number;
  weekTitle: string;
  type: "video" | "blog";
  title: string;
  id: string;
  theme: number;
  themeLabel: string;
  workflow: "reference-first" | "blog-first";
  priority: number;
  status: "pending" | "generated" | "published";
  talkingPoints: string[];
  showNotes?: string[];
  modes: string[];
};

export type ContentCalendar = {
  version: number;
  description: string;
  themes: Record<string, string>;
  cornerstonePriorities: number[];
  packs: CalendarPack[];
};

const CALENDAR_REL = ".cursor/skills/symphony-content-engine/calendar.json";

export function calendarPath(repoRoot: string): string {
  return path.join(repoRoot, CALENDAR_REL);
}

export function loadCalendar(repoRoot: string): ContentCalendar {
  const raw = fs.readFileSync(calendarPath(repoRoot), "utf8");
  return JSON.parse(raw) as ContentCalendar;
}

export function saveCalendar(repoRoot: string, calendar: ContentCalendar): void {
  fs.writeFileSync(calendarPath(repoRoot), `${JSON.stringify(calendar, null, 2)}\n`);
}

export function selectNextTopic(
  calendar: ContentCalendar,
  opts: { topicId?: string; includeGenerated?: boolean } = {}
): CalendarPack {
  if (opts.topicId) {
    const found = calendar.packs.find((p) => p.id === opts.topicId);
    if (!found) throw new Error(`Unknown topic id: ${opts.topicId}`);
    if (found.status === "generated" && !opts.includeGenerated) {
      throw new Error(
        `Topic "${opts.topicId}" is already generated. Pass --force to regenerate.`
      );
    }
    return found;
  }

  const pending = calendar.packs
    .filter((p) => p.status === "pending")
    .sort((a, b) => a.priority - b.priority || a.day - b.day);

  if (pending.length === 0) {
    throw new Error("No pending topics in calendar.json");
  }

  return pending[0];
}

export function packDirName(datePrefix: string, id: string): string {
  return `${datePrefix}-${id}`;
}

export function findExistingPackDir(
  repoRoot: string,
  id: string
): string | undefined {
  const packsRoot = path.join(repoRoot, "content/packs");
  if (!fs.existsSync(packsRoot)) return undefined;
  const dirs = fs.readdirSync(packsRoot, { withFileTypes: true });
  const match = dirs.find((d) => d.isDirectory() && d.name.endsWith(`-${id}`));
  return match ? path.join(packsRoot, match.name) : undefined;
}
