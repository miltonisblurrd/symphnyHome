import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { applyStockMovement } from "@/lib/inspired-closets-ops-inventory";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";

export const runtime = "nodejs";

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

function missingTable(message: string): boolean {
  return /relation|schema cache|does not exist/i.test(message);
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ic_job_materials")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) {
    if (missingTable(error.message)) {
      return NextResponse.json({
        ok: true,
        lines: [],
        hint: "Run drizzle/0012_ic_inventory_schedule.sql to enable job materials.",
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const partIds = [...new Set((data ?? []).map((row) => row.part_id).filter(Boolean))];
  const { data: parts } = partIds.length
    ? await supabase
        .from("ic_parts")
        .select("id, sku, name, size, qty_on_hand, qty_reserved, unit_cost_cents, location")
        .in("id", partIds)
    : { data: [] };
  const byId = new Map((parts ?? []).map((p) => [p.id, p]));
  const lines = (data ?? []).map((row) => {
    const part = byId.get(row.part_id);
    const unit = part?.unit_cost_cents ?? 0;
    return {
      ...row,
      part: part ?? null,
      ext_cents: Math.abs(row.qty ?? 0) * unit,
    };
  });

  const materialsCents = lines
    .filter((line) => ["reserved", "staged", "allocated"].includes(line.status))
    .reduce((sum, line) => sum + line.ext_cents, 0);

  return NextResponse.json({ ok: true, lines, materialsCents });
}

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

  const action = typeof body.action === "string" ? body.action : "";
  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  const actor = await actorId();
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  if (!jobId) {
    return NextResponse.json({ ok: false, error: "job_id is required." }, { status: 400 });
  }

  try {
    if (action === "reserve") {
      const partId = typeof body.part_id === "string" ? body.part_id : null;
      const qty = Math.abs(Number(body.qty) || 0);
      if (!partId || qty <= 0) {
        return NextResponse.json(
          { ok: false, error: "part_id and qty are required." },
          { status: 400 },
        );
      }
      await applyStockMovement({
        partId,
        movementType: "reserve",
        qty,
        jobId,
        note: typeof body.note === "string" ? body.note : "Job check reserve",
        actorId: actor,
      });
      const { data, error } = await supabase
        .from("ic_job_materials")
        .insert({
          job_id: jobId,
          part_id: partId,
          qty,
          status: "reserved",
          note: typeof body.note === "string" ? body.note : null,
          created_by: actor,
        })
        .select("*")
        .single();
      if (error) {
        if (missingTable(error.message)) {
          return NextResponse.json(
            {
              ok: false,
              error: "Run drizzle/0012_ic_inventory_schedule.sql to enable job materials.",
            },
            { status: 400 },
          );
        }
        throw error;
      }
      return NextResponse.json({ ok: true, line: data });
    }

    const lineId = typeof body.line_id === "string" ? body.line_id : null;
    if (!lineId) {
      return NextResponse.json({ ok: false, error: "line_id is required." }, { status: 400 });
    }
    const { data: line, error: findError } = await supabase
      .from("ic_job_materials")
      .select("*")
      .eq("id", lineId)
      .maybeSingle();
    if (findError) throw findError;
    if (!line) {
      return NextResponse.json({ ok: false, error: "Line not found." }, { status: 404 });
    }

    if (action === "unreserve") {
      if (line.status === "reserved") {
        await applyStockMovement({
          partId: line.part_id,
          movementType: "unreserve",
          qty: line.qty,
          jobId,
          note: "Released from job",
          actorId: actor,
        });
      } else if (line.status === "staged" || line.status === "allocated") {
        await applyStockMovement({
          partId: line.part_id,
          movementType: "return",
          qty: line.qty,
          jobId,
          note: "Returned from job",
          actorId: actor,
        });
      }
      const { data, error } = await supabase
        .from("ic_job_materials")
        .update({ status: "returned", updated_at: nowIso })
        .eq("id", lineId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, line: data });
    }

    if (action === "stage") {
      if (line.status === "reserved") {
        await applyStockMovement({
          partId: line.part_id,
          movementType: "allocate",
          qty: line.qty,
          jobId,
          note: "Staged / packed for install",
          actorId: actor,
        });
      }
      const { data, error } = await supabase
        .from("ic_job_materials")
        .update({
          status: "staged",
          staged_at: nowIso,
          staged_by: actor,
          updated_at: nowIso,
        })
        .eq("id", lineId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, line: data });
    }

    if (action === "damage") {
      await applyStockMovement({
        partId: line.part_id,
        movementType: "scrap",
        qty: line.qty,
        jobId,
        note: typeof body.note === "string" ? body.note : "Damaged in warehouse",
        actorId: actor,
      });
      if (line.status === "reserved") {
        await applyStockMovement({
          partId: line.part_id,
          movementType: "unreserve",
          qty: line.qty,
          jobId,
          note: "Damaged — released reserve",
          actorId: actor,
        });
      }
      const { data, error } = await supabase
        .from("ic_job_materials")
        .update({
          status: "damaged",
          note: typeof body.note === "string" ? body.note : line.note,
          updated_at: nowIso,
        })
        .eq("id", lineId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, line: data, reorder: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Job materials failed." },
      { status: 400 },
    );
  }
}
