import { getSupabaseAdmin } from "@/db/client";
import { mapsKey } from "@/lib/inspired-closets-google-places";

function pacificYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function pacificDayStartIso(ymd: string): string {
  const pdt = `${ymd}T00:00:00.000-07:00`;
  if (pacificYmd(new Date(pdt)) === ymd) return pdt;
  return `${ymd}T00:00:00.000-08:00`;
}

export type DrivePinKind = "clock_in" | "install_done" | "clock_out";

type LatLng = { lat: number; lng: number };

type DrivePin = {
  id: string;
  installer_id: string;
  job_id: string | null;
  kind: DrivePinKind;
  lat: string;
  lng: string;
  recorded_at: string;
};

function missingTable(message: string): boolean {
  return /does not exist|schema cache|ic_drive_pins|ic_job_miles/i.test(message);
}

function parseCoord(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asLatLng(lat: string | null | undefined, lng: string | null | undefined): LatLng | null {
  const a = parseCoord(lat);
  const b = parseCoord(lng);
  if (a == null || b == null) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

function haversineMiles(from: LatLng, to: LatLng): number {
  const earth = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

function roundMiles(value: number): number {
  if (!Number.isFinite(value) || value < 0.3) return 0;
  return Math.max(1, Math.round(value));
}

async function drivingMiles(from: LatLng, to: LatLng): Promise<number> {
  const key = mapsKey();
  if (key) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", `${from.lat},${from.lng}`);
      url.searchParams.set("destinations", `${to.lat},${to.lng}`);
      url.searchParams.set("units", "imperial");
      url.searchParams.set("mode", "driving");
      url.searchParams.set("key", key);
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as {
          rows?: Array<{ elements?: Array<{ status?: string; distance?: { value?: number } }> }>;
        };
        const meters = payload.rows?.[0]?.elements?.[0]?.distance?.value;
        if (payload.rows?.[0]?.elements?.[0]?.status === "OK" && typeof meters === "number") {
          return roundMiles(meters / 1609.344);
        }
      }
    } catch {
      /* fall through to haversine */
    }
  }
  return roundMiles(haversineMiles(from, to));
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  const key = mapsKey();
  const query = address.trim();
  if (!key || !query) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("region", "us");
    url.searchParams.set("key", key);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const loc = payload.results?.[0]?.geometry?.location;
    if (payload.status !== "OK" || loc?.lat == null || loc?.lng == null) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

async function fallbackCoords(input: {
  kind: DrivePinKind;
  installerId: string;
  jobId: string | null;
}): Promise<LatLng | null> {
  const supabase = getSupabaseAdmin();
  if (input.kind === "install_done" && input.jobId) {
    const { data: job } = await supabase
      .from("ic_jobs")
      .select("client_id")
      .eq("id", input.jobId)
      .maybeSingle();
    if (job?.client_id) {
      const { data: client } = await supabase
        .from("ic_clients")
        .select("address")
        .eq("id", job.client_id)
        .maybeSingle();
      if (client?.address) return geocodeAddress(client.address);
    }
  }
  const { data: vehicle } = await supabase
    .from("ic_vehicles")
    .select("garage_address")
    .eq("assigned_installer_id", input.installerId)
    .is("deleted_at", null)
    .eq("active", true)
    .maybeSingle();
  if (vehicle?.garage_address) return geocodeAddress(vehicle.garage_address);
  return null;
}

export async function recordDrivePin(input: {
  installerId: string;
  jobId?: string | null;
  kind: DrivePinKind;
  lat?: string | null;
  lng?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  let coords = asLatLng(input.lat, input.lng);
  if (!coords) {
    coords = await fallbackCoords({
      kind: input.kind,
      installerId: input.installerId,
      jobId: input.jobId ?? null,
    });
  }
  if (!coords) return;

  const { error } = await supabase.from("ic_drive_pins").insert({
    installer_id: input.installerId,
    job_id: input.jobId ?? null,
    kind: input.kind,
    lat: String(coords.lat),
    lng: String(coords.lng),
  });
  if (error && !missingTable(error.message)) {
    console.error("recordDrivePin", error.message);
    return;
  }
  if (error) return;

  try {
    await recomputeInstallerMilesToday(input.installerId);
  } catch (err) {
    console.error("recomputeInstallerMilesToday", err);
  }
}

export async function recomputeInstallerMilesToday(installerId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const day = pacificYmd();
  const start = pacificDayStartIso(day);
  const { data: pinRows, error } = await supabase
    .from("ic_drive_pins")
    .select("id, installer_id, job_id, kind, lat, lng, recorded_at")
    .eq("installer_id", installerId)
    .gte("recorded_at", start)
    .order("recorded_at", { ascending: true });
  if (error) {
    if (!missingTable(error.message)) console.error("drive pins load", error.message);
    return;
  }

  const pins = (pinRows ?? []) as DrivePin[];
  const clockIn = pins.find((pin) => pin.kind === "clock_in");
  if (!clockIn) return;
  const afterIn = pins.filter((pin) => pin.recorded_at >= clockIn.recorded_at);
  const dones = afterIn.filter((pin) => pin.kind === "install_done" && pin.job_id);
  const clockOut = [...afterIn].reverse().find((pin) => pin.kind === "clock_out") ?? null;
  if (dones.length === 0) return;

  const { data: vehicle } = await supabase
    .from("ic_vehicles")
    .select("id")
    .eq("assigned_installer_id", installerId)
    .is("deleted_at", null)
    .eq("active", true)
    .maybeSingle();

  const now = new Date().toISOString();
  for (let i = 0; i < dones.length; i += 1) {
    const current = dones[i];
    const prev = i === 0 ? clockIn : dones[i - 1];
    const next = i < dones.length - 1 ? dones[i + 1] : clockOut;
    const from = asLatLng(prev.lat, prev.lng);
    const here = asLatLng(current.lat, current.lng);
    if (!from || !here || !current.job_id) continue;
    const milesOut = await drivingMiles(from, here);
    let milesBack = 0;
    if (next?.kind === "clock_out") {
      const dest = asLatLng(next.lat, next.lng);
      if (dest) milesBack = await drivingMiles(here, dest);
    }
    const { error: upsertError } = await supabase.from("ic_job_miles").upsert(
      {
        job_id: current.job_id,
        installer_id: installerId,
        vehicle_id: vehicle?.id ?? null,
        drive_date: day,
        miles_out: milesOut,
        miles_back: milesBack,
        updated_at: now,
      },
      { onConflict: "job_id,installer_id,drive_date" },
    );
    if (upsertError && !missingTable(upsertError.message)) {
      console.error("ic_job_miles upsert", upsertError.message);
    }
  }
}
