import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";
import {
  gradeVehicle,
  publicVehicle,
  startOfWeekIso,
  todayYmd,
  type JobMilesRow,
  type VehicleLogKind,
  type VehicleLogRow,
  type VehicleRow,
} from "@/lib/inspired-closets-ops-vehicles";

export const runtime = "nodejs";

const LOG_KINDS = new Set<VehicleLogKind>(["fuel", "wash", "clean_check", "odometer", "service"]);

function missingTable(message: string): boolean {
  return /does not exist|schema cache|ic_vehicles|ic_vehicle_logs|ic_job_miles/i.test(message);
}

async function loadSnapshot(installerId: string) {
  const supabase = getSupabaseAdmin();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("ic_vehicles")
    .select(
      "id, name, year, make, model, color, plate_last4, odometer, assigned_installer_id, registration_expires_on, insurance_expires_on, next_oil_due_miles",
    )
    .eq("assigned_installer_id", installerId)
    .is("deleted_at", null)
    .eq("active", true)
    .maybeSingle();
  if (vehicleError) throw vehicleError;

  if (!vehicle) {
    return {
      vehicle: null,
      grade: null,
      week_miles: 0,
      last_wash_at: null as string | null,
      last_fuel_at: null as string | null,
      logs: [] as VehicleLogRow[],
      miles: [] as JobMilesRow[],
    };
  }

  const weekStart = startOfWeekIso();
  const [{ data: logs }, { data: miles }] = await Promise.all([
    supabase
      .from("ic_vehicle_logs")
      .select("id, kind, logged_at, odometer, gallons, amount_cents, clean_ok, note")
      .eq("vehicle_id", vehicle.id)
      .order("logged_at", { ascending: false })
      .limit(40),
    supabase
      .from("ic_job_miles")
      .select("id, job_id, drive_date, miles_out, miles_back")
      .eq("installer_id", installerId)
      .gte("drive_date", weekStart.slice(0, 10))
      .order("drive_date", { ascending: false })
      .limit(40),
  ]);

  const logRows = (logs ?? []) as VehicleLogRow[];
  const mileRows = (miles ?? []) as JobMilesRow[];
  const lastWash = logRows.find((row) => row.kind === "wash") ?? null;
  const lastClean = logRows.find((row) => row.kind === "clean_check") ?? null;
  const lastFuel = logRows.find((row) => row.kind === "fuel") ?? null;
  const lastOdo = logRows.find((row) => row.kind === "odometer" || row.odometer != null) ?? null;
  const weekMiles = mileRows.reduce((sum, row) => sum + (row.miles_out || 0) + (row.miles_back || 0), 0);
  const grade = gradeVehicle({
    vehicle: vehicle as VehicleRow,
    lastWashAt: lastWash?.logged_at ?? null,
    lastCleanAt: lastClean?.logged_at ?? null,
    lastCleanOk: lastClean?.clean_ok ?? null,
    lastOdometerAt: lastOdo?.logged_at ?? null,
    weekMiles,
  });

  return {
    vehicle: publicVehicle(vehicle as VehicleRow),
    grade,
    week_miles: weekMiles,
    last_wash_at: lastWash?.logged_at ?? null,
    last_fuel_at: lastFuel?.logged_at ?? null,
    logs: logRows,
    miles: mileRows,
  };
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;

  try {
    const snapshot = await loadSnapshot(auth.installer.id);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load vehicle.";
    if (missingTable(message)) {
      return NextResponse.json({
        ok: true,
        vehicle: null,
        grade: null,
        week_miles: 0,
        last_wash_at: null,
        last_fuel_at: null,
        logs: [],
        miles: [],
        hint: "Run drizzle/0021_ic_vehicles.sql in Supabase to enable the truck file.",
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: vehicle, error: findError } = await supabase
    .from("ic_vehicles")
    .select("id, odometer")
    .eq("assigned_installer_id", auth.installer.id)
    .is("deleted_at", null)
    .eq("active", true)
    .maybeSingle();
  if (findError) {
    if (missingTable(findError.message)) {
      return NextResponse.json(
        { ok: false, error: "Vehicle tables are not in the database yet." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!vehicle) {
    return NextResponse.json({ ok: false, error: "No truck is assigned to you yet." }, { status: 404 });
  }

  const action = typeof body.action === "string" ? body.action : "log";

  try {
    if (action === "miles") {
      const jobId = typeof body.job_id === "string" ? body.job_id : "";
      if (!jobId) {
        return NextResponse.json({ ok: false, error: "Pick a job for these miles." }, { status: 400 });
      }
      const milesOut = Math.max(0, Math.round(Number(body.miles_out) || 0));
      const milesBack = Math.max(0, Math.round(Number(body.miles_back) || 0));
      const driveDate =
        typeof body.drive_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.drive_date)
          ? body.drive_date
          : todayYmd();
      const now = new Date().toISOString();
      const { error } = await supabase.from("ic_job_miles").upsert(
        {
          job_id: jobId,
          installer_id: auth.installer.id,
          vehicle_id: vehicle.id,
          drive_date: driveDate,
          miles_out: milesOut,
          miles_back: milesBack,
          updated_at: now,
        },
        { onConflict: "job_id,installer_id,drive_date" },
      );
      if (error) throw error;
      const snapshot = await loadSnapshot(auth.installer.id);
      return NextResponse.json({ ok: true, ...snapshot });
    }

    const kind = (typeof body.kind === "string" ? body.kind : "") as VehicleLogKind;
    if (!LOG_KINDS.has(kind)) {
      return NextResponse.json({ ok: false, error: "Unknown vehicle log." }, { status: 400 });
    }
    const odometer =
      body.odometer === undefined || body.odometer === null || body.odometer === ""
        ? null
        : Math.max(0, Math.round(Number(body.odometer)));
    const gallons =
      body.gallons === undefined || body.gallons === null || body.gallons === ""
        ? null
        : Math.max(0, Number(body.gallons));
    const dollars =
      body.amount_dollars === undefined || body.amount_dollars === null || body.amount_dollars === ""
        ? null
        : Math.max(0, Number(body.amount_dollars));
    const { error } = await supabase.from("ic_vehicle_logs").insert({
      vehicle_id: vehicle.id,
      installer_id: auth.installer.id,
      kind,
      odometer,
      gallons,
      amount_cents: dollars == null ? null : Math.round(dollars * 100),
      clean_ok: kind === "clean_check" ? body.clean_ok !== false : null,
      note: typeof body.note === "string" ? body.note.trim() || null : null,
    });
    if (error) throw error;
    if (odometer != null && odometer > (vehicle.odometer ?? 0)) {
      await supabase
        .from("ic_vehicles")
        .update({ odometer, updated_at: new Date().toISOString() })
        .eq("id", vehicle.id);
    }
    const snapshot = await loadSnapshot(auth.installer.id);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
