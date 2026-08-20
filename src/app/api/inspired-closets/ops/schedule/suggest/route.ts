import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { suggestInstallSchedule } from "@/lib/inspired-closets-ops-schedule";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const from = typeof body.from === "string" ? body.from.slice(0, 10) : null;
  const to = typeof body.to === "string" ? body.to.slice(0, 10) : null;
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: "from and to (YYYY-MM-DD) are required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const full = await supabase
    .from("ic_jobs")
    .select(
      "id, client_id, stage, install_date, receive_date, crew_size, estimated_install_days, contract_cents, notes",
    )
    .is("deleted_at", null)
    .limit(2000);
  const fallback =
    full.error && /column|schema cache/i.test(full.error.message)
      ? await supabase
          .from("ic_jobs")
          .select("id, client_id, stage, install_date, receive_date, contract_cents, notes")
          .is("deleted_at", null)
          .limit(2000)
      : null;
  const jobsResult = fallback ?? full;
  const jobs = (jobsResult.data ?? []) as Array<Record<string, unknown>>;
  const jobsError = jobsResult.error;
  const { data: staff } = await supabase
    .from("ic_staff")
    .select("id, role, active")
    .is("deleted_at", null)
    .eq("active", true)
    .eq("role", "installer");

  if (jobsError) {
    return NextResponse.json({ ok: false, error: jobsError.message }, { status: 500 });
  }

  const clientIds = [
    ...new Set(
      jobs.map((j) => j.client_id).filter((id): id is string => typeof id === "string"),
    ),
  ];
  const { data: clients } = clientIds.length
    ? await supabase.from("ic_clients").select("id, name").in("id", clientIds)
    : { data: [] };
  const names = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const forSolver = jobs
    .filter((job) => !["closed", "cancelled"].includes(String(job.stage)))
    .map((job) => {
      const notes = String(job.notes ?? "").toLowerCase();
      const serviceTag =
        /\b(svc|service)\b/.test(notes) || job.stage === "service"
          ? ("SVC" as const)
          : /\b(g\/?b|go[\s-]?back)\b/.test(notes)
            ? ("G/B" as const)
            : null;
      const installDate = typeof job.install_date === "string" ? job.install_date : null;
      const inWindow = Boolean(installDate && installDate >= from && installDate < to);
      return {
        id: String(job.id),
        clientName:
          (typeof job.client_id === "string" ? names.get(job.client_id) : null) ?? "Client",
        stage: String(job.stage),
        installDate: inWindow ? installDate : null,
        receiveDate: typeof job.receive_date === "string" ? job.receive_date : null,
        crewSize: Number(job.crew_size) || (serviceTag ? 1 : 2),
        estimatedInstallDays: Number(job.estimated_install_days) || 1,
        serviceTag,
        contractCents: Number(job.contract_cents) || 0,
        include:
          inWindow ||
          (!installDate &&
            (["deposit_received", "job_check", "ordered"].includes(String(job.stage)) ||
              Boolean(serviceTag))),
      };
    })
    .filter((job) => job.include)
    .map(({ include: _include, ...job }) => job);

  const result = suggestInstallSchedule({
    from,
    to,
    installerCount: (staff ?? []).length || 3,
    jobs: forSolver,
  });

  return NextResponse.json({
    ok: true,
    installerCount: (staff ?? []).length || 3,
    from,
    to,
    ...result,
  });
}
