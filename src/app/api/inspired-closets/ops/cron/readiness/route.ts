import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { receivingRollupByJobIds } from "@/lib/inspired-closets-ops-receiving";
import { dismissNotifications, insertNotification } from "@/lib/inspired-closets-ops-job-spine";
import { addDaysYmd, daysBetween, todayYmd } from "@/lib/inspired-closets-ops-tiers";

export const runtime = "nodejs";

/** Days before install that raise a look, tightest last. Agreed in the Sept 14 scheduling meeting. */
const THRESHOLDS = [21, 14, 7, 3] as const;

const DONE_STAGES = new Set(["install_complete", "final_payment", "closed", "cancelled"]);

function thresholdCopy(days: number): string {
  if (days >= 21) return "3 weeks";
  if (days >= 14) return "2 weeks";
  if (days >= 7) return "1 week";
  return "3 days";
}

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const today = todayYmd();
  const horizon = addDaysYmd(today, THRESHOLDS[0]);

  const { data: jobs, error } = await supabase
    .from("ic_jobs")
    .select("id, client_id, title, stage, install_date, install_confidence")
    .is("deleted_at", null)
    .is("archived_at", null)
    .gte("install_date", today)
    .lte("install_date", horizon);
  if (error) {
    if (/install_confidence|schema cache|column/i.test(error.message)) {
      return NextResponse.json({ ok: true, created: 0, hint: "Run drizzle/0030_ic_job_scheduling_readiness.sql." });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const open = (jobs ?? []).filter(
    (job) => !DONE_STAGES.has(String(job.stage)) && job.install_confidence !== "confirmed",
  );
  if (open.length === 0) return NextResponse.json({ ok: true, created: 0 });

  const clientIds = [...new Set(open.map((job) => job.client_id).filter(Boolean))] as string[];
  const { data: clients } = clientIds.length
    ? await supabase.from("ic_clients").select("id, name").in("id", clientIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const nameById = new Map((clients ?? []).map((client) => [client.id, client.name]));
  const receiving = await receivingRollupByJobIds(open.map((job) => job.id));

  let created = 0;
  for (const job of open) {
    const daysOut = daysBetween(today, job.install_date);
    if (daysOut == null) continue;
    const threshold = [...THRESHOLDS].reverse().find((value) => daysOut <= value);
    if (threshold == null) continue;
    const rollup = receiving.get(job.id);
    const received = rollup?.received_qty ?? 0;
    const total = rollup?.total_qty ?? 0;
    const name = (job.client_id && nameById.get(job.client_id)) || job.title || "Job";
    const kind = `readiness_${threshold}`;

    await dismissNotifications(job.id, (value) => value.startsWith("readiness_") && value !== kind);
    await insertNotification({
      jobId: job.id,
      kind,
      title: `${name} installs in ${daysOut} day${daysOut === 1 ? "" : "s"} — still tentative`,
      body:
        total > 0
          ? `${thresholdCopy(threshold)} check · ${received}/${total} pieces received. Confirm the date or push it.`
          : `${thresholdCopy(threshold)} check · nothing received yet. Confirm the date or push it.`,
      severity: threshold <= 7 ? "alert" : "warn",
      thresholdDays: threshold,
    });
    created += 1;
  }

  return NextResponse.json({ ok: true, checked: open.length, created });
}
