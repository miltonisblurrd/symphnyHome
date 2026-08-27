import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import { jobKindTag, resolveJobKind, type IcJobKind } from "@/lib/inspired-closets-ops-jobs";

export const runtime = "nodejs";

function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastName(full: string | null | undefined): string {
  if (!full) return "CLIENT";
  const parts = full.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? full).toUpperCase();
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const installerId = cookieStore.get(IC_STAFF_ID_COOKIE)?.value;
  if (!installerId) {
    return NextResponse.json({ ok: false, error: "Sign in as a driver first." }, { status: 401 });
  }

  const fromParam = new URL(request.url).searchParams.get("from");
  const weekStart = fromParam ? new Date(`${fromParam}T12:00:00`) : startOfWeek();
  if (Number.isNaN(weekStart.getTime())) {
    return NextResponse.json({ ok: false, error: "from must be YYYY-MM-DD." }, { status: 400 });
  }
  weekStart.setHours(0, 0, 0, 0);
  const from = ymd(weekStart);
  const to = ymd(addDays(weekStart, 6)); // exclusive Sunday — board is Mon–Sat

  const days = [0, 1, 2, 3, 4, 5].map((offset) => {
    const d = addDays(weekStart, offset);
    return {
      key: ymd(d),
      dow: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: d.getDate(),
    };
  });

  const supabase = getSupabaseAdmin();
  const [{ data: staff }, { data: jobs, error }, { data: clients }, { data: me }] = await Promise.all([
    supabase
      .from("ic_staff")
      .select("id, name, role, active")
      .is("deleted_at", null)
      .eq("active", true)
      .order("name"),
    supabase
      .from("ic_jobs")
      .select("*")
      .is("deleted_at", null)
      .not("install_date", "is", null)
      .gte("install_date", from)
      .lt("install_date", to)
      .limit(500),
    supabase.from("ic_clients").select("id, name, address, phone").is("deleted_at", null),
    supabase.from("ic_staff").select("id, name").eq("id", installerId).maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const clientsById = new Map((clients ?? []).map((row) => [row.id, row]));
  const staffById = new Map((staff ?? []).map((row) => [row.id, row]));

  type BoardJob = {
    id: string;
    lastName: string;
    clientName: string;
    job_kind: IcJobKind;
    visit_window: string | null;
    tag: "SVC" | "G/B" | null;
    address: string | null;
    installer_id: string | null;
    mine: boolean;
  };

  const mapped: Array<BoardJob & { date: string }> = (jobs ?? []).map((job) => {
    const kind = resolveJobKind(job as Record<string, unknown>);
    const client = job.client_id ? clientsById.get(job.client_id) ?? null : null;
    return {
      id: job.id as string,
      date: String(job.install_date),
      lastName: lastName(client?.name),
      clientName: client?.name ?? "Client",
      job_kind: kind,
      visit_window: (job.visit_window as string | null) ?? null,
      tag: jobKindTag(kind),
      address: client?.address ?? null,
      installer_id: (job.installer_id as string | null) ?? null,
      mine: job.installer_id === installerId,
    };
  });

  const assignedIds = new Set(
    mapped.map((job) => job.installer_id).filter((id): id is string => Boolean(id)),
  );
  const crew = (staff ?? []).filter((person) => person.role === "installer");
  for (const id of assignedIds) {
    if (!crew.some((person) => person.id === id)) {
      const extra = staffById.get(id);
      if (extra) crew.push(extra);
    }
  }
  crew.sort((a, b) => {
    if (a.id === installerId) return -1;
    if (b.id === installerId) return 1;
    return a.name.localeCompare(b.name);
  });

  const emptyCells = () => Object.fromEntries(days.map((day) => [day.key, [] as BoardJob[]]));

  const installers = crew.map((person) => {
    const cells = emptyCells();
    for (const job of mapped) {
      if (job.installer_id !== person.id) continue;
      if (!cells[job.date]) continue;
      cells[job.date].push(job);
    }
    return {
      id: person.id,
      name: person.name,
      mine: person.id === installerId,
      cells,
    };
  });

  const unassigned = emptyCells();
  for (const job of mapped) {
    if (job.installer_id) continue;
    if (!unassigned[job.date]) continue;
    unassigned[job.date].push(job);
  }

  return NextResponse.json({
    ok: true,
    installer: me ?? { id: installerId, name: "Driver" },
    weekStart: from,
    days,
    installers,
    unassigned,
  });
}
