import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDbConfigured, getSupabaseAdmin } from "@/db/client";
import {
  buildFinanceSnapshot,
  upsertJobFinancials,
  MARGIN_GATE_PCT,
} from "@/lib/inspired-closets-ops-finance";
import { IC_STAFF_ID_COOKIE } from "@/lib/inspired-closets-ops-field";
import {
  fetchQuickBooksFinancialPulse,
  getQuickBooksConfig,
  getQuickBooksTokens,
} from "@/lib/quickbooks";

export const runtime = "nodejs";

async function actorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IC_STAFF_ID_COOKIE)?.value ?? null;
}

function dollarsToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const n = Number(value.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n)) return null;
    // Treat values with decimal as dollars; integers >= 1000 as cents already if huge? Prefer dollars from UI.
    return Math.round(n * 100);
  }
  return null;
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  try {
    const snapshot = await buildFinanceSnapshot();

    let quickbooks: Awaited<ReturnType<typeof fetchQuickBooksFinancialPulse>> | null = null;
    let qbStatus: "connected" | "not_connected" | "error" = "not_connected";
    try {
      if (getQuickBooksConfig() && (await getQuickBooksTokens())) {
        quickbooks = await fetchQuickBooksFinancialPulse();
        qbStatus = quickbooks?.source === "quickbooks" ? "connected" : "not_connected";
      }
    } catch {
      qbStatus = "error";
    }

    return NextResponse.json({
      ok: true,
      marginGatePct: MARGIN_GATE_PCT,
      quickbooksStatus: qbStatus,
      quickbooks,
      ...snapshot,
      luluTips: [
        "Start with Today — anything that needs you is listed first.",
        "After YOU enter a payment in QuickBooks, tap Marked in QB (checklist only — we never post to QB).",
        `Spiffs only when margin ≥ ${MARGIN_GATE_PCT}% — approve from the Spiffs tab.`,
        "Mark costs verified once the Stow invoice is itemized to the job.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Finance load failed." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
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
  const actor = await actorId();
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  if (action === "mark_qb_entered") {
    const paymentId = typeof body.payment_id === "string" ? body.payment_id : null;
    if (!paymentId) {
      return NextResponse.json({ ok: false, error: "payment_id is required." }, { status: 400 });
    }
    const qbRef =
      typeof body.quickbooks_ref === "string" && body.quickbooks_ref.trim()
        ? body.quickbooks_ref.trim()
        : `entered-${nowIso.slice(0, 10)}`;

    const { data, error } = await supabase
      .from("ic_payments")
      .update({
        quickbooks_ref: qbRef,
        updated_at: nowIso,
        updated_by: actor,
      })
      .eq("id", paymentId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await supabase.from("ic_activity_log").insert({
      entity_type: "payment",
      entity_id: paymentId,
      action: "marked_quickbooks_entered",
      actor_id: actor,
      changes: { quickbooks_ref: qbRef },
    });

    return NextResponse.json({ ok: true, payment: data });
  }

  if (action === "save_job_costs") {
    const jobId = typeof body.job_id === "string" ? body.job_id : null;
    if (!jobId) {
      return NextResponse.json({ ok: false, error: "job_id is required." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.material != null || body.material_cents != null) {
      patch.material_cents =
        typeof body.material_cents === "number"
          ? Math.round(body.material_cents)
          : dollarsToCents(body.material);
    }
    if (body.labor != null || body.labor_cents != null) {
      patch.labor_cents =
        typeof body.labor_cents === "number"
          ? Math.round(body.labor_cents)
          : dollarsToCents(body.labor);
    }
    if (body.other_fees != null || body.other_fees_cents != null) {
      patch.other_fees_cents =
        typeof body.other_fees_cents === "number"
          ? Math.round(body.other_fees_cents)
          : dollarsToCents(body.other_fees) ?? 0;
    }
    if (body.spiff != null || body.spiff_cents != null) {
      patch.spiff_cents =
        typeof body.spiff_cents === "number"
          ? Math.round(body.spiff_cents)
          : dollarsToCents(body.spiff) ?? 0;
    }
    if (typeof body.spiff_recipient === "string") patch.spiff_recipient = body.spiff_recipient;
    if (typeof body.spiff_status === "string") patch.spiff_status = body.spiff_status;
    if (typeof body.costs_verified === "boolean") patch.costs_verified = body.costs_verified;
    if (typeof body.stow_invoice_ref === "string") patch.stow_invoice_ref = body.stow_invoice_ref;
    if (typeof body.notes === "string") patch.notes = body.notes;

    try {
      const financials = await upsertJobFinancials(jobId, patch, actor);
      return NextResponse.json({ ok: true, financials });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Save failed." },
        { status: 500 },
      );
    }
  }

  if (action === "set_spiff_status") {
    const jobId = typeof body.job_id === "string" ? body.job_id : null;
    const status = typeof body.spiff_status === "string" ? body.spiff_status : null;
    if (!jobId || !status) {
      return NextResponse.json(
        { ok: false, error: "job_id and spiff_status are required." },
        { status: 400 },
      );
    }
    // Enforce 45% gate for approve/paid unless override flag
    if ((status === "approved" || status === "paid") && body.force !== true) {
      const snap = await buildFinanceSnapshot();
      const job = snap.jobs.find((j) => j.jobId === jobId);
      if (job && job.marginGateMet === false) {
        return NextResponse.json(
          {
            ok: false,
            error: `Spiff blocked: margin ${job.marginPct ?? "—"}% is below the ${MARGIN_GATE_PCT}% gate. Fix costs or get Gavin override (force).`,
          },
          { status: 409 },
        );
      }
    }

    try {
      const financials = await upsertJobFinancials(
        jobId,
        { spiff_status: status },
        actor,
      );
      return NextResponse.json({ ok: true, financials });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Spiff update failed." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
