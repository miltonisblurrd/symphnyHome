"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type Staff = {
  id: string;
  name: string;
  role: string;
  workbook_tab: string | null;
  active: boolean;
};

type PayrollEntry = {
  id: string;
  designer_id: string;
  client_name: string;
  entry_date: string | null;
  contract_cents: number;
  deposit_cents: number;
  margin_starting_bp: number | null;
  margin_after_spiff_bp: number | null;
  margin_final_bp: number | null;
  commission_pct_bp: number | null;
  check_cents: number;
  pay_date: string | null;
  status: "open" | "payable" | "paid" | "held";
  gate_override_reason: string | null;
  notes: string | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  staff?: Staff[];
  entries?: PayrollEntry[];
  entry?: PayrollEntry;
  marginGateBp?: number;
  entriesImported?: number;
  designersUpserted?: number;
  entriesSkippedManual?: number;
};

const STATUS_STYLES: Record<PayrollEntry["status"], string> = {
  open: styles.statusOpen,
  payable: styles.statusPayable,
  paid: styles.statusPaid,
  held: styles.statusHeld,
};

function centsToDisplay(cents: number): string {
  if (!cents) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function bpToDisplay(bp: number | null): string {
  return bp == null ? "—" : `${(bp / 100).toFixed(2)}%`;
}

function bestMarginBp(entry: PayrollEntry): number | null {
  return entry.margin_final_bp ?? entry.margin_after_spiff_bp ?? entry.margin_starting_bp ?? null;
}

function dollarsInputToCents(value: string): number {
  const num = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function percentInputToBp(value: string): number | null {
  const trimmed = value.replace(/%/g, "").trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? Math.round(num * 100) : null;
}

const EMPTY_FORM = {
  client_name: "",
  entry_date: "",
  contract: "",
  deposit: "",
  margin_starting: "",
  commission_pct: "",
  check: "",
  notes: "",
};

export default function OpsPayrollWorkspace() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [marginGateBp, setMarginGateBp] = useState(4500);
  const [selectedDesigner, setSelectedDesigner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/payroll");
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load payroll.");
      const loadedStaff = payload.staff ?? [];
      setStaff(loadedStaff);
      setEntries(payload.entries ?? []);
      setMarginGateBp(payload.marginGateBp ?? 4500);
      setSelectedDesigner((current) => current ?? loadedStaff[0]?.id ?? null);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load payroll.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const designers = useMemo(
    () => staff.filter((member) => member.role === "designer" && member.active),
    [staff],
  );

  const visibleEntries = useMemo(
    () =>
      entries
        .filter((entry) => !selectedDesigner || entry.designer_id === selectedDesigner)
        .sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? "")),
    [entries, selectedDesigner],
  );

  const summary = useMemo(() => {
    const contract = visibleEntries.reduce((sum, entry) => sum + entry.contract_cents, 0);
    const open = visibleEntries.filter((entry) => entry.status === "payable").length;
    const held = visibleEntries.filter((entry) => entry.status === "held").length;
    return { contract, open, held, count: visibleEntries.length };
  }, [visibleEntries]);

  async function runImport() {
    setImporting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/import-workbook", {
        method: "POST",
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Import failed.");
      setNotice({
        kind: "info",
        text: `Imported ${payload.entriesImported ?? 0} entries across ${payload.designersUpserted ?? 0} designers (${payload.entriesSkippedManual ?? 0} manual rows preserved).`,
      });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Import failed.",
      });
    } finally {
      setImporting(false);
    }
  }

  async function addEntry(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedDesigner || !form.client_name.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designer_id: selectedDesigner,
          client_name: form.client_name.trim(),
          entry_date: form.entry_date || null,
          contract_cents: dollarsInputToCents(form.contract),
          deposit_cents: dollarsInputToCents(form.deposit),
          margin_starting_bp: percentInputToBp(form.margin_starting),
          commission_pct_bp: percentInputToBp(form.commission_pct),
          check_cents: dollarsInputToCents(form.check),
          notes: form.notes.trim() || null,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok || !payload.entry) throw new Error(payload.error ?? "Failed to add entry.");
      const created = payload.entry;
      setForm({ ...EMPTY_FORM });
      setEntries((current) => [created, ...current]);
      setNotice({ kind: "info", text: `Added ${created.client_name}.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add entry.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(entry: PayrollEntry) {
    const today = new Date().toISOString().slice(0, 10);
    const belowGate = (bestMarginBp(entry) ?? Number.MAX_SAFE_INTEGER) < marginGateBp;
    let overrideReason: string | null = entry.gate_override_reason;
    if (belowGate && !overrideReason) {
      overrideReason = window.prompt(
        `This job is below the ${marginGateBp / 100}% margin gate. Enter an override reason (approved by Gavin) or cancel:`,
      );
      if (!overrideReason) return;
    }

    try {
      const response = await fetch("/api/inspired-closets/ops/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          status: "paid",
          pay_date: today,
          ...(overrideReason ? { gate_override_reason: overrideReason } : {}),
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok || !payload.entry) {
        throw new Error(payload.error ?? "Failed to update entry.");
      }
      const updated = payload.entry;
      setEntries((current) => current.map((item) => (item.id === entry.id ? updated : item)));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update entry.",
      });
    }
  }

  return (
    <OpsShell
      title="Payroll & Commissions"
      subtitle={`Replaces the red 2026 workbook · ${marginGateBp / 100}% spiff gate enforced`}
      actions={
        <>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => void runImport()}
            disabled={importing}
          >
            {importing ? "Importing…" : "Import from workbook"}
          </button>
        </>
      }
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <nav className={styles.tabs}>
        {designers.map((designer) => (
          <button
            key={designer.id}
            type="button"
            className={`${styles.tab} ${selectedDesigner === designer.id ? styles.tabActive : ""}`}
            onClick={() => setSelectedDesigner(designer.id)}
          >
            {designer.name}
          </button>
        ))}
      </nav>

      <section className={styles.panel}>
        <div className={styles.summaryRow}>
          <span>
            <span className={styles.summaryStrong}>{summary.count}</span> entries
          </span>
          <span>
            Contract total{" "}
            <span className={styles.summaryStrong}>{centsToDisplay(summary.contract)}</span>
          </span>
          <span>
            <span className={styles.summaryStrong}>{summary.open}</span> commissions payable
          </span>
          <span>
            <span className={styles.summaryStrong}>{summary.held}</span> held below gate
          </span>
        </div>

        {loading ? (
          <p className={styles.empty}>Loading payroll…</p>
        ) : visibleEntries.length === 0 ? (
          <p className={styles.empty}>
            No entries yet. Run “Import from workbook” to bring in the red 2026 tabs, or add an
            entry below.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Date</th>
                <th>Contract</th>
                <th>Deposit</th>
                <th>Margin start</th>
                <th>After spiff</th>
                <th>Final</th>
                <th>Comm %</th>
                <th>Check</th>
                <th>Pay date</th>
                <th>Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const margin = bestMarginBp(entry);
                const below = margin != null && margin < marginGateBp;
                return (
                  <tr key={entry.id} className={entry.status === "held" ? styles.rowHeld : ""}>
                    <td>{entry.client_name}</td>
                    <td>{entry.entry_date ?? "—"}</td>
                    <td>{centsToDisplay(entry.contract_cents)}</td>
                    <td>{centsToDisplay(entry.deposit_cents)}</td>
                    <td className={below ? styles.marginBelow : ""}>
                      {bpToDisplay(entry.margin_starting_bp)}
                    </td>
                    <td>{bpToDisplay(entry.margin_after_spiff_bp)}</td>
                    <td>{bpToDisplay(entry.margin_final_bp)}</td>
                    <td>{bpToDisplay(entry.commission_pct_bp)}</td>
                    <td>{centsToDisplay(entry.check_cents)}</td>
                    <td>{entry.pay_date ?? "—"}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${STATUS_STYLES[entry.status]}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className={styles.notesCell} title={entry.notes ?? undefined}>
                      {entry.notes ?? ""}
                    </td>
                    <td>
                      {entry.status !== "paid" && entry.check_cents > 0 ? (
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          onClick={() => void markPaid(entry)}
                        >
                          Mark paid
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <form className={styles.formGrid} onSubmit={addEntry}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Client</span>
            <input
              className={styles.input}
              value={form.client_name}
              onChange={(event) => setForm({ ...form, client_name: event.target.value })}
              placeholder="LAST NAME"
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Date</span>
            <input
              className={styles.input}
              type="date"
              value={form.entry_date}
              onChange={(event) => setForm({ ...form, entry_date: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Total contract</span>
            <input
              className={styles.input}
              value={form.contract}
              onChange={(event) => setForm({ ...form, contract: event.target.value })}
              placeholder="$0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Deposit</span>
            <input
              className={styles.input}
              value={form.deposit}
              onChange={(event) => setForm({ ...form, deposit: event.target.value })}
              placeholder="$0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Margin % starting</span>
            <input
              className={styles.input}
              value={form.margin_starting}
              onChange={(event) => setForm({ ...form, margin_starting: event.target.value })}
              placeholder="50.00"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Comm %</span>
            <input
              className={styles.input}
              value={form.commission_pct}
              onChange={(event) => setForm({ ...form, commission_pct: event.target.value })}
              placeholder="8"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Check</span>
            <input
              className={styles.input}
              value={form.check}
              onChange={(event) => setForm({ ...form, check: event.target.value })}
              placeholder="$0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Notes</span>
            <input
              className={styles.input}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.buttonPrimary}
              disabled={saving || !selectedDesigner}
            >
              {saving ? "Adding…" : "Add entry"}
            </button>
          </div>
        </form>
      </section>
    </OpsShell>
  );
}
