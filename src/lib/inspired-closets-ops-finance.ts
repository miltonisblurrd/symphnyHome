/**
 * Lulu finance helpers — July 15 workflow.
 *
 * Podium = customer payment activity (already in ic_payments).
 * QuickBooks = books (Lulu marks quickbooks_ref after she enters).
 * 45% gate before spiff. Job costing = materials + labor + fees + commission + spiff.
 */
import { getSupabaseAdmin } from "@/db/client";
import { gavinDemoMeta } from "@/data/inspired-closets-gavin-demo";

export const MARGIN_GATE_PCT = gavinDemoMeta.marginGate; // 45
export const MARGIN_GATE_BP = Math.round(MARGIN_GATE_PCT * 100);

/** Default installer labor rate when Lulu hasn't entered labor $ yet. */
export function laborRateCentsPerHour(): number {
  const raw = process.env.INSPIRED_CLOSETS_LABOR_RATE_CENTS_PER_HOUR?.trim();
  const n = raw ? Number(raw) : 4500;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 4500;
}

export type FinanceAttentionItem = {
  id: string;
  kind:
    | "needs_qb_entry"
    | "who_owes"
    | "below_gate"
    | "unverified_costs"
    | "spiff_approval"
    | "final_unpaid";
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  amountCents: number;
  jobId: string | null;
  paymentId: string | null;
  clientName: string | null;
  actionLabel: string;
};

export type JobProfitRow = {
  jobId: string;
  clientName: string;
  stage: string;
  contractCents: number;
  collectedCents: number;
  owedCents: number;
  materialCents: number;
  materialSource: "override" | "inventory" | "none";
  laborCents: number;
  laborSource: "override" | "time" | "none";
  laborMinutes: number;
  otherFeesCents: number;
  commissionCents: number;
  spiffCents: number;
  spiffRecipient: string | null;
  spiffStatus: string;
  costsVerified: boolean;
  stowInvoiceRef: string | null;
  grossProfitCents: number;
  netProfitCents: number;
  marginPct: number | null;
  marginGateMet: boolean | null;
  payrollMarginFinalBp: number | null;
  notes: string | null;
};

function cents(n: number | null | undefined): number {
  return Number.isFinite(n) ? Math.round(n as number) : 0;
}

export async function buildFinanceSnapshot(): Promise<{
  summary: {
    outstandingCents: number;
    collectedOpenJobsCents: number;
    needsQbEntry: number;
    belowGate: number;
    unverifiedCosts: number;
    spiffsPending: number;
    marginGatePct: number;
  };
  attention: FinanceAttentionItem[];
  needsQb: Array<{
    paymentId: string;
    jobId: string;
    clientName: string;
    milestone: string;
    amountPaidCents: number;
    method: string | null;
    podiumRef: string | null;
    checkRef: string | null;
    paidAt: string | null;
  }>;
  jobs: JobProfitRow[];
  spiffs: JobProfitRow[];
}> {
  const supabase = getSupabaseAdmin();
  const rate = laborRateCentsPerHour();

  const [
    { data: jobs },
    { data: payments },
    { data: financials },
    { data: movements },
    { data: timeEntries },
    { data: payroll },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("ic_jobs")
      .select("id, client_id, stage, contract_cents, collected_cents, completed_date")
      .is("deleted_at", null)
      .limit(3000),
    supabase
      .from("ic_payments")
      .select(
        "id, job_id, milestone, amount_due_cents, amount_paid_cents, status, method, podium_ref, check_ref, quickbooks_ref, paid_at",
      )
      .limit(5000),
    supabase.from("ic_job_financials").select("*"),
    supabase
      .from("ic_stock_movements")
      .select("job_id, movement_type, qty, unit_cost_cents")
      .not("job_id", "is", null)
      .limit(5000),
    supabase
      .from("ic_time_entries")
      .select("job_id, clock_in_at, clock_out_at")
      .limit(5000),
    supabase
      .from("ic_payroll_entries")
      .select("job_id, client_name, margin_final_bp, check_cents, status, gate_override_by")
      .is("deleted_at", null)
      .limit(3000),
    supabase.from("ic_clients").select("id, name").is("deleted_at", null),
  ]);

  const clientsById = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const finByJob = new Map((financials ?? []).map((f) => [f.job_id as string, f]));
  const payrollByJob = new Map<
    string,
    {
      job_id: string | null;
      client_name: string;
      margin_final_bp: number | null;
      check_cents: number;
      status: string;
      gate_override_by: string | null;
    }
  >();
  for (const row of payroll ?? []) {
    if (row.job_id && !payrollByJob.has(row.job_id)) payrollByJob.set(row.job_id, row);
  }

  const materialByJob = new Map<string, number>();
  for (const m of movements ?? []) {
    if (!m.job_id) continue;
    const unit = cents(m.unit_cost_cents);
    const qty = cents(m.qty);
    // allocate reduces stock (qty often negative in effect); use abs cost
    if (m.movement_type === "allocate") {
      materialByJob.set(m.job_id, (materialByJob.get(m.job_id) ?? 0) + Math.abs(qty) * unit);
    } else if (m.movement_type === "return") {
      materialByJob.set(m.job_id, (materialByJob.get(m.job_id) ?? 0) - Math.abs(qty) * unit);
    }
  }

  const laborMinutesByJob = new Map<string, number>();
  for (const t of timeEntries ?? []) {
    if (!t.job_id || !t.clock_in_at) continue;
    const start = new Date(t.clock_in_at).getTime();
    const end = t.clock_out_at ? new Date(t.clock_out_at).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const mins = Math.round((end - start) / 60000);
    laborMinutesByJob.set(t.job_id, (laborMinutesByJob.get(t.job_id) ?? 0) + mins);
  }

  const paymentsByJob = new Map<string, typeof payments>();
  for (const p of payments ?? []) {
    const list = paymentsByJob.get(p.job_id) ?? [];
    list.push(p);
    paymentsByJob.set(p.job_id, list);
  }

  const jobRows: JobProfitRow[] = [];
  for (const job of jobs ?? []) {
    const fin = finByJob.get(job.id);
    const pr = payrollByJob.get(job.id);
    const jobPayments = paymentsByJob.get(job.id) ?? [];
    const collectedFromPayments = jobPayments.reduce(
      (sum, p) => sum + cents(p.amount_paid_cents),
      0,
    );
    const dueFromPayments = jobPayments.reduce((sum, p) => sum + cents(p.amount_due_cents), 0);
    const collectedCents =
      collectedFromPayments > 0 ? collectedFromPayments : cents(job.collected_cents);
    const owedCents = Math.max(
      0,
      (dueFromPayments > 0 ? dueFromPayments : cents(job.contract_cents)) - collectedCents,
    );

    let materialCents = 0;
    let materialSource: JobProfitRow["materialSource"] = "none";
    if (fin?.material_cents != null) {
      materialCents = cents(fin.material_cents);
      materialSource = "override";
    } else if (materialByJob.has(job.id)) {
      materialCents = Math.max(0, materialByJob.get(job.id) ?? 0);
      materialSource = "inventory";
    }

    const laborMinutes = laborMinutesByJob.get(job.id) ?? 0;
    let laborCents = 0;
    let laborSource: JobProfitRow["laborSource"] = "none";
    if (fin?.labor_cents != null) {
      laborCents = cents(fin.labor_cents);
      laborSource = "override";
    } else if (laborMinutes > 0) {
      laborCents = Math.round((laborMinutes / 60) * rate);
      laborSource = "time";
    }

    const otherFeesCents = cents(fin?.other_fees_cents);
    const spiffCents = cents(fin?.spiff_cents);
    const commissionCents = cents(pr?.check_cents);
    const contractCents = cents(job.contract_cents);
    const grossProfitCents = contractCents - materialCents - laborCents - otherFeesCents;
    const netProfitCents = grossProfitCents - commissionCents - spiffCents;

    let marginPct: number | null = null;
    if (pr?.margin_final_bp != null) {
      marginPct = pr.margin_final_bp / 100;
    } else if (contractCents > 0) {
      marginPct = Math.round((netProfitCents / contractCents) * 1000) / 10;
    }

    const marginGateMet =
      marginPct == null ? null : marginPct + 1e-9 >= MARGIN_GATE_PCT;

    jobRows.push({
      jobId: job.id,
      clientName:
        (job.client_id ? clientsById.get(job.client_id) : null) ??
        pr?.client_name ??
        "Client",
      stage: job.stage,
      contractCents,
      collectedCents,
      owedCents,
      materialCents,
      materialSource,
      laborCents,
      laborSource,
      laborMinutes,
      otherFeesCents,
      commissionCents,
      spiffCents,
      spiffRecipient: fin?.spiff_recipient ?? null,
      spiffStatus: fin?.spiff_status ?? "none",
      costsVerified: Boolean(fin?.costs_verified),
      stowInvoiceRef: fin?.stow_invoice_ref ?? null,
      grossProfitCents,
      netProfitCents,
      marginPct,
      marginGateMet,
      payrollMarginFinalBp: pr?.margin_final_bp ?? null,
      notes: fin?.notes ?? null,
    });
  }

  const needsQb = (payments ?? [])
    .filter(
      (p) =>
        cents(p.amount_paid_cents) > 0 &&
        p.status !== "void" &&
        !p.quickbooks_ref,
    )
    .map((p) => {
      const job = (jobs ?? []).find((j) => j.id === p.job_id);
      return {
        paymentId: p.id,
        jobId: p.job_id,
        clientName:
          (job?.client_id ? clientsById.get(job.client_id) : null) ??
          payrollByJob.get(p.job_id)?.client_name ??
          "Client",
        milestone: p.milestone as string,
        amountPaidCents: cents(p.amount_paid_cents),
        method: p.method,
        podiumRef: p.podium_ref,
        checkRef: p.check_ref,
        paidAt: p.paid_at,
      };
    });

  const attention: FinanceAttentionItem[] = [];

  for (const row of needsQb.slice(0, 40)) {
    attention.push({
      id: `qb-${row.paymentId}`,
      kind: "needs_qb_entry",
      priority: "high",
      title: `Enter in QuickBooks · ${row.clientName}`,
      detail: `${row.milestone.replace(/_/g, " ")} · ${row.method ?? "payment"} paid — mark QB when done (your ~5–10 min recon step).`,
      amountCents: row.amountPaidCents,
      jobId: row.jobId,
      paymentId: row.paymentId,
      clientName: row.clientName,
      actionLabel: "Marked in QB",
    });
  }

  for (const row of jobRows) {
    if (row.owedCents >= 10000 && !["cancelled", "lead"].includes(row.stage)) {
      attention.push({
        id: `owe-${row.jobId}`,
        kind: "who_owes",
        priority: row.owedCents >= 100000 ? "high" : "medium",
        title: `Still owes · ${row.clientName}`,
        detail: `Outstanding balance on ${row.stage.replace(/_/g, " ")}.`,
        amountCents: row.owedCents,
        jobId: row.jobId,
        paymentId: null,
        clientName: row.clientName,
        actionLabel: "Open billing",
      });
    }
    if (
      row.marginGateMet === false &&
      row.contractCents > 0 &&
      !["lead", "cancelled"].includes(row.stage)
    ) {
      attention.push({
        id: `gate-${row.jobId}`,
        kind: "below_gate",
        priority: "high",
        title: `Below ${MARGIN_GATE_PCT}% gate · ${row.clientName}`,
        detail: `Margin ${row.marginPct ?? "—"}%. Spiff blocked until margin recovers or Gavin overrides.`,
        amountCents: row.netProfitCents,
        jobId: row.jobId,
        paymentId: null,
        clientName: row.clientName,
        actionLabel: "Review costs",
      });
    }
    if (
      ["install_complete", "final_payment", "closed"].includes(row.stage) &&
      !row.costsVerified &&
      row.contractCents > 0
    ) {
      attention.push({
        id: `cost-${row.jobId}`,
        kind: "unverified_costs",
        priority: "medium",
        title: `Unverified costs · ${row.clientName}`,
        detail: "Stow/materials not marked verified — itemize invoice before treating costs as final.",
        amountCents: row.materialCents + row.otherFeesCents,
        jobId: row.jobId,
        paymentId: null,
        clientName: row.clientName,
        actionLabel: "Verify costs",
      });
    }
    if (row.spiffStatus === "pending" || row.spiffStatus === "requested") {
      attention.push({
        id: `spiff-${row.jobId}`,
        kind: "spiff_approval",
        priority: row.marginGateMet === false ? "high" : "medium",
        title: `Spiff waiting · ${row.clientName}`,
        detail: `${row.spiffRecipient ?? "Recipient TBD"} · gate ${
          row.marginGateMet === false ? "FAIL" : row.marginGateMet ? "OK" : "unknown"
        }.`,
        amountCents: row.spiffCents,
        jobId: row.jobId,
        paymentId: null,
        clientName: row.clientName,
        actionLabel: row.marginGateMet === false ? "Blocked" : "Approve / pay",
      });
    }
    if (
      ["install_complete", "final_payment"].includes(row.stage) &&
      row.owedCents > 0
    ) {
      attention.push({
        id: `final-${row.jobId}`,
        kind: "final_unpaid",
        priority: "high",
        title: `Final balance open · ${row.clientName}`,
        detail: "Install done / final payment stage — collect remaining balance.",
        amountCents: row.owedCents,
        jobId: row.jobId,
        paymentId: null,
        clientName: row.clientName,
        actionLabel: "Collect",
      });
    }
  }

  // De-dupe / prioritize
  const seen = new Set<string>();
  const sortedAttention = attention
    .sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority] || b.amountCents - a.amountCents;
    })
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 60);

  const openJobs = jobRows.filter((j) => !["closed", "cancelled"].includes(j.stage));
  const outstandingCents = openJobs.reduce((s, j) => s + j.owedCents, 0);
  const collectedOpenJobsCents = openJobs.reduce((s, j) => s + j.collectedCents, 0);

  return {
    summary: {
      outstandingCents,
      collectedOpenJobsCents,
      needsQbEntry: needsQb.length,
      belowGate: jobRows.filter((j) => j.marginGateMet === false).length,
      unverifiedCosts: jobRows.filter(
        (j) =>
          ["install_complete", "final_payment", "closed"].includes(j.stage) && !j.costsVerified,
      ).length,
      spiffsPending: jobRows.filter((j) =>
        ["pending", "requested", "approved"].includes(j.spiffStatus),
      ).length,
      marginGatePct: MARGIN_GATE_PCT,
    },
    attention: sortedAttention,
    needsQb,
    jobs: jobRows
      .filter((j) => j.contractCents > 0 || j.collectedCents > 0 || j.owedCents > 0)
      .sort((a, b) => b.owedCents - a.owedCents || b.contractCents - a.contractCents)
      .slice(0, 200),
    spiffs: jobRows.filter((j) => j.spiffCents > 0 || ["pending", "requested", "approved", "paid", "blocked"].includes(j.spiffStatus)),
  };
}

export async function upsertJobFinancials(
  jobId: string,
  patch: Record<string, unknown>,
  actorId?: string | null,
) {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabase
    .from("ic_job_financials")
    .select("job_id")
    .eq("job_id", jobId)
    .maybeSingle();

  const row = {
    ...patch,
    job_id: jobId,
    updated_at: nowIso,
    updated_by: actorId ?? null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("ic_job_financials")
      .update(row)
      .eq("job_id", jobId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("ic_job_financials")
    .insert({ ...row, created_at: nowIso })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Compact OS context for Cubby (prefer over Sheets when available). */
export async function buildCubbyOpsContext(): Promise<Record<string, unknown> | null> {
  try {
    const snap = await buildFinanceSnapshot();
    const supabase = getSupabaseAdmin();
    const [{ data: issues }, { data: openClocks }] = await Promise.all([
      supabase
        .from("ic_field_issues")
        .select("id, job_id, issue_type, status, description, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("ic_time_entries")
        .select("id, job_id, installer_id, clock_in_at")
        .is("clock_out_at", null)
        .limit(40),
    ]);

    return {
      source: "inspired_closets_os",
      marginGatePct: MARGIN_GATE_PCT,
      summary: snap.summary,
      attention: snap.attention.slice(0, 20),
      topOwed: snap.jobs
        .filter((j) => j.owedCents > 0)
        .slice(0, 15)
        .map((j) => ({
          client: j.clientName,
          owedCents: j.owedCents,
          stage: j.stage,
          marginPct: j.marginPct,
        })),
      belowGate: snap.jobs
        .filter((j) => j.marginGateMet === false)
        .slice(0, 15)
        .map((j) => ({
          client: j.clientName,
          marginPct: j.marginPct,
          spiffStatus: j.spiffStatus,
        })),
      needsQuickBooksEntry: snap.needsQb.slice(0, 15),
      openFieldIssues: issues ?? [],
      installersOnSite: openClocks ?? [],
      note: "OS is operational truth for jobs/payments/crew. QuickBooks remains accounting books. Podium remains payment rail.",
    };
  } catch {
    return null;
  }
}
