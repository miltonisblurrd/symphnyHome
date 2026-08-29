import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { requireFieldInstaller } from "@/lib/inspired-closets-field-auth-server";

export const runtime = "nodejs";

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

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;

  const staffId = auth.installer.id;
  const supabase = getSupabaseAdmin();

  let staffQuery = supabase
    .from("ic_staff")
    .select("id, name, role, phone, avatar_url, hired_at, title, created_at, active")
    .is("deleted_at", null)
    .eq("active", true)
    .eq("role", "installer")
    .order("name");

  if (staffId) staffQuery = staffQuery.eq("id", staffId);

  const { data: staffRows, error } = await staffQuery;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (staffRows ?? []).map((s) => s.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, profiles: [] });
  }

  const [{ data: jobs }, { data: openClocks }, { data: issues }, { data: clients }] =
    await Promise.all([
      supabase
        .from("ic_jobs")
        .select("id, installer_id, stage, install_date, completed_date, client_id, notes")
        .in("installer_id", ids)
        .is("deleted_at", null)
        .limit(2000),
      supabase
        .from("ic_time_entries")
        .select("id, installer_id, job_id, clock_in_at")
        .in("installer_id", ids)
        .is("clock_out_at", null),
      supabase
        .from("ic_field_issues")
        .select("id, installer_id, status")
        .in("installer_id", ids)
        .limit(2000),
      supabase.from("ic_clients").select("id, name, address").is("deleted_at", null),
    ]);

  const clientsById = new Map((clients ?? []).map((c) => [c.id, c]));
  const openByInstaller = new Set((openClocks ?? []).map((c) => c.installer_id));

  const profiles = (staffRows ?? []).map((member) => {
    const theirJobs = (jobs ?? []).filter((j) => j.installer_id === member.id);
    const completed = theirJobs.filter((j) =>
      ["install_complete", "final_payment", "closed"].includes(j.stage),
    );
    const activeJobs = theirJobs.filter((j) =>
      ["install_scheduled", "install_in_progress"].includes(j.stage),
    );
    const theirIssues = (issues ?? []).filter((i) => i.installer_id === member.id);
    const history = [...completed]
      .sort((a, b) => {
        const da = a.completed_date ?? a.install_date ?? "";
        const db = b.completed_date ?? b.install_date ?? "";
        return db.localeCompare(da);
      })
      .slice(0, staffId ? 25 : 5)
      .map((job) => {
        const client = job.client_id ? clientsById.get(job.client_id) : null;
        return {
          id: job.id,
          clientName: client?.name ?? "Client",
          address: client?.address ?? null,
          stage: job.stage,
          installDate: job.install_date,
          completedDate: job.completed_date,
        };
      });

    return {
      id: member.id,
      name: member.name,
      role: member.role,
      phone: member.phone,
      avatarUrl: member.avatar_url,
      hiredAt: member.hired_at,
      title: member.title || "Installer",
      initials: initials(member.name),
      tenureLabel: tenureLabel(member.hired_at, member.created_at),
      onSiteNow: openByInstaller.has(member.id),
      stats: {
        installsCompleted: completed.length,
        activeJobs: activeJobs.length,
        issuesReported: theirIssues.length,
        openIssues: theirIssues.filter((i) => i.status === "open").length,
      },
      recentInstalls: history,
    };
  });

  return NextResponse.json({
    ok: true,
    profiles: staffId ? profiles : profiles,
    profile: staffId ? profiles[0] ?? null : null,
  });
}

/** Update own profile photo / title / hired_at (prototype). */
export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  const actorId = auth.installer.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const targetId = typeof body.id === "string" ? body.id : actorId;
  if (targetId !== actorId) {
    return NextResponse.json({ ok: false, error: "Can only edit your own profile." }, { status: 403 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.avatar_url === "string" || body.avatar_url === null) {
    updates.avatar_url = body.avatar_url;
  }
  if (typeof body.title === "string") updates.title = body.title.trim() || "Installer";
  if (typeof body.hired_at === "string" || body.hired_at === null) {
    updates.hired_at = body.hired_at;
  }
  if (typeof body.phone === "string" || body.phone === null) updates.phone = body.phone;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_staff")
    .update(updates)
    .eq("id", targetId)
    .select("id, name, role, phone, avatar_url, hired_at, title, created_at")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, staff: data });
}

/** Upload avatar image → storage → avatar_url. */
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const auth = await requireFieldInstaller();
  if (!auth.ok) return auth.response;
  const actorId = auth.installer.id;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Keep the photo under 8 MB." }, { status: 400 });
  }
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Choose a photo." }, { status: 400 });
  }

  const allowed = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"]);
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  if (!allowed.has(ext)) {
    return NextResponse.json({ ok: false, error: "Use a JPG, PNG, or HEIC photo." }, { status: 400 });
  }
  const path = `${actorId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();

  const { error: uploadError } = await supabase.storage
    .from("ic-staff-avatars")
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from("ic-staff-avatars").getPublicUrl(path);
  const avatarUrl = pub.publicUrl;

  const { data, error } = await supabase
    .from("ic_staff")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", actorId)
    .select("id, name, role, phone, avatar_url, hired_at, title")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, staff: data, avatarUrl });
}
