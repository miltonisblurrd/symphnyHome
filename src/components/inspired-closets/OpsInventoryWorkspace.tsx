"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type Part = {
  id: string;
  sku: string;
  name: string;
  category: string;
  location: string | null;
  barcode: string | null;
  unit_cost_cents: number;
  qty_on_hand: number;
  qty_reserved: number;
  reorder_point: number;
  is_excess: boolean;
  vendor: string | null;
  notes: string | null;
  active: boolean;
};

type JobOption = {
  id: string;
  client: { name: string } | null;
  stage: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  parts?: Part[];
  part?: Part;
  categories?: string[];
  summary?: {
    totalParts: number;
    lowStock: number;
    excess: number;
    valueCents: number;
  };
  jobs?: JobOption[];
};

function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dollarsInputToCents(value: string): number {
  const num = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

const EMPTY_PART = {
  sku: "",
  name: "",
  category: "hardware",
  location: "",
  qty: "",
  unit_cost: "",
  reorder_point: "5",
  vendor: "",
  notes: "",
  is_excess: false,
};

export default function OpsInventoryWorkspace() {
  const [parts, setParts] = useState<Part[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [summary, setSummary] = useState({
    totalParts: 0,
    lowStock: 0,
    excess: 0,
    valueCents: 0,
  });
  const [filter, setFilter] = useState<"all" | "low" | "excess">("all");
  const [query, setQuery] = useState("");
  const [selectedPartId, setSelectedPartId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [partForm, setPartForm] = useState({ ...EMPTY_PART });
  const [moveForm, setMoveForm] = useState({
    type: "receive" as "receive" | "allocate" | "return" | "adjust" | "scrap" | "sell_excess",
    qty: "",
    job_id: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (query.trim()) params.set("q", query.trim());

      const [partsRes, jobsRes] = await Promise.all([
        fetch(`/api/inspired-closets/ops/inventory/parts?${params.toString()}`),
        fetch("/api/inspired-closets/ops/jobs"),
      ]);
      const partsPayload = (await partsRes.json()) as ApiResponse;
      const jobsPayload = (await jobsRes.json()) as ApiResponse;
      if (!partsPayload.ok) throw new Error(partsPayload.error ?? "Failed to load parts.");
      setParts(partsPayload.parts ?? []);
      setCategories(partsPayload.categories ?? []);
      setSummary(
        partsPayload.summary ?? { totalParts: 0, lowStock: 0, excess: 0, valueCents: 0 },
      );
      if (jobsPayload.ok) {
        setJobs(
          (jobsPayload.jobs ?? []).filter(
            (job) => !["closed", "cancelled"].includes(job.stage),
          ),
        );
      }
      setSelectedPartId((current) => current || partsPayload.parts?.[0]?.id || "");
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load inventory.",
      });
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPart = useMemo(
    () => parts.find((part) => part.id === selectedPartId) ?? null,
    [parts, selectedPartId],
  );

  async function addPart(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/inventory/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: partForm.sku,
          name: partForm.name,
          category: partForm.category,
          location: partForm.location || null,
          qty_on_hand: Number(partForm.qty) || 0,
          unit_cost_cents: dollarsInputToCents(partForm.unit_cost),
          reorder_point: Number(partForm.reorder_point) || 0,
          vendor: partForm.vendor || null,
          notes: partForm.notes || null,
          is_excess: partForm.is_excess,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to add part.");
      setPartForm({ ...EMPTY_PART });
      setNotice({ kind: "info", text: `Added ${payload.part?.sku}.` });
      if (payload.part?.id) setSelectedPartId(payload.part.id);
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add part.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runMovement(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPartId) return;
    setSaving(true);
    setNotice(null);
    try {
      const qty = Number(moveForm.qty);
      const response = await fetch("/api/inspired-closets/ops/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part_id: selectedPartId,
          movement_type: moveForm.type,
          qty,
          job_id: moveForm.job_id || null,
          note: moveForm.note || null,
        }),
      });
      const raw = await response.text();
      let payload: ApiResponse & { error?: string };
      try {
        payload = JSON.parse(raw) as ApiResponse;
      } catch {
        throw new Error(raw.slice(0, 160) || "Movement failed.");
      }
      if (!payload.ok) throw new Error(payload.error ?? "Movement failed.");
      setMoveForm({ type: moveForm.type, qty: "", job_id: moveForm.job_id, note: "" });
      setNotice({
        kind: "info",
        text: `${moveForm.type} recorded for ${selectedPart?.sku ?? "part"}.`,
      });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Movement failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleExcess(part: Part) {
    try {
      const response = await fetch("/api/inspired-closets/ops/inventory/parts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: part.id, is_excess: !part.is_excess }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to update part.");
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update part.",
      });
    }
  }

  return (
    <OpsShell
      title="Inventory"
      subtitle="Frank’s warehouse · stop over-ordering · allocate parts to jobs"
      actions={
        <button
          type="button"
          className={styles.buttonGhost}
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      }
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <nav className={styles.tabs}>
        {(
          [
            ["all", "All parts"],
            ["low", "Low stock"],
            ["excess", "Excess / dead stock"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${filter === id ? styles.tabActive : ""}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className={styles.panel}>
        <div className={styles.summaryRow}>
          <span>
            <span className={styles.summaryStrong}>{summary.totalParts}</span> parts
          </span>
          <span>
            <span className={styles.summaryStrong}>{summary.lowStock}</span> low stock
          </span>
          <span>
            <span className={styles.summaryStrong}>{summary.excess}</span> excess flagged
          </span>
          <span>
            On-hand value{" "}
            <span className={styles.summaryStrong}>{centsToDisplay(summary.valueCents)}</span>
          </span>
        </div>

        <label className={styles.field} style={{ marginBottom: "0.85rem", maxWidth: "24rem" }}>
          <span className={styles.fieldLabel}>Search SKU / name / bin / barcode</span>
          <input
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. drawer slide, A12, STOW-"
          />
        </label>

        {loading ? (
          <p className={styles.empty}>Loading inventory…</p>
        ) : parts.length === 0 ? (
          <p className={styles.empty}>
            No parts yet. Add the first SKU below — receive stock, then allocate to jobs so you
            stop reordering what’s already here.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th></th>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Bin</th>
                <th>On hand</th>
                <th>Reorder @</th>
                <th>Unit cost</th>
                <th>Value</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => {
                const low = part.qty_on_hand <= part.reorder_point;
                return (
                  <tr
                    key={part.id}
                    className={low || part.is_excess ? styles.rowHeld : undefined}
                  >
                    <td>
                      <input
                        type="radio"
                        name="selectedPart"
                        checked={selectedPartId === part.id}
                        onChange={() => setSelectedPartId(part.id)}
                        aria-label={`Select ${part.sku}`}
                      />
                    </td>
                    <td>{part.sku}</td>
                    <td>{part.name}</td>
                    <td>{part.category}</td>
                    <td>{part.location ?? "—"}</td>
                    <td className={low ? styles.marginBelow : undefined}>{part.qty_on_hand}</td>
                    <td>{part.reorder_point}</td>
                    <td>{centsToDisplay(part.unit_cost_cents)}</td>
                    <td>{centsToDisplay(part.qty_on_hand * part.unit_cost_cents)}</td>
                    <td>
                      {low ? (
                        <span className={`${styles.statusBadge} ${styles.statusHeld}`}>low</span>
                      ) : null}{" "}
                      {part.is_excess ? (
                        <span className={`${styles.statusBadge} ${styles.statusPayable}`}>
                          excess
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.buttonGhost}
                        onClick={() => void toggleExcess(part)}
                      >
                        {part.is_excess ? "Clear excess" : "Mark excess"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <form className={styles.formGrid} onSubmit={runMovement}>
          <p className={styles.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
            Stock movement {selectedPart ? `· ${selectedPart.sku}` : "· select a part above"}
          </p>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Action</span>
            <select
              className={styles.input}
              value={moveForm.type}
              onChange={(event) =>
                setMoveForm({
                  ...moveForm,
                  type: event.target.value as typeof moveForm.type,
                })
              }
            >
              <option value="receive">Receive (stock in)</option>
              <option value="allocate">Allocate to job</option>
              <option value="return">Return from job</option>
              <option value="adjust">Adjust count (+/-)</option>
              <option value="scrap">Scrap / damaged</option>
              <option value="sell_excess">Sell excess</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Qty</span>
            <input
              className={styles.input}
              value={moveForm.qty}
              onChange={(event) => setMoveForm({ ...moveForm, qty: event.target.value })}
              placeholder={moveForm.type === "adjust" ? "+5 or -2" : "1"}
              required
            />
          </label>
          {(moveForm.type === "allocate" || moveForm.type === "return") && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Job</span>
              <select
                className={styles.input}
                value={moveForm.job_id}
                onChange={(event) => setMoveForm({ ...moveForm, job_id: event.target.value })}
                required
              >
                <option value="">Select open job…</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.client?.name ?? "Client"} · {job.stage}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Note</span>
            <input
              className={styles.input}
              value={moveForm.note}
              onChange={(event) => setMoveForm({ ...moveForm, note: event.target.value })}
              placeholder="Pallet #, Stow invoice, staging note…"
            />
          </label>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.buttonPrimary}
              disabled={saving || !selectedPartId}
            >
              {saving ? "Saving…" : "Record movement"}
            </button>
          </div>
        </form>

        <form className={styles.formGrid} onSubmit={addPart}>
          <p className={styles.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
            Add part to catalog
          </p>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>SKU</span>
            <input
              className={styles.input}
              value={partForm.sku}
              onChange={(event) => setPartForm({ ...partForm, sku: event.target.value })}
              placeholder="DS-18-SOFT"
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={partForm.name}
              onChange={(event) => setPartForm({ ...partForm, name: event.target.value })}
              placeholder="18in soft-close drawer slide"
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Category</span>
            <select
              className={styles.input}
              value={partForm.category}
              onChange={(event) => setPartForm({ ...partForm, category: event.target.value })}
            >
              {(categories.length ? categories : ["hardware"]).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Bin / location</span>
            <input
              className={styles.input}
              value={partForm.location}
              onChange={(event) => setPartForm({ ...partForm, location: event.target.value })}
              placeholder="Aisle B / Shelf 3"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Opening qty</span>
            <input
              className={styles.input}
              value={partForm.qty}
              onChange={(event) => setPartForm({ ...partForm, qty: event.target.value })}
              placeholder="0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Unit cost</span>
            <input
              className={styles.input}
              value={partForm.unit_cost}
              onChange={(event) => setPartForm({ ...partForm, unit_cost: event.target.value })}
              placeholder="$0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Reorder point</span>
            <input
              className={styles.input}
              value={partForm.reorder_point}
              onChange={(event) =>
                setPartForm({ ...partForm, reorder_point: event.target.value })
              }
              placeholder="5"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Vendor</span>
            <input
              className={styles.input}
              value={partForm.vendor}
              onChange={(event) => setPartForm({ ...partForm, vendor: event.target.value })}
              placeholder="Stow / Alibaba / other"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Notes</span>
            <input
              className={styles.input}
              value={partForm.notes}
              onChange={(event) => setPartForm({ ...partForm, notes: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className={styles.field} style={{ alignContent: "end" }}>
            <span className={styles.fieldLabel}>Excess stock?</span>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={partForm.is_excess}
                onChange={(event) =>
                  setPartForm({ ...partForm, is_excess: event.target.checked })
                }
              />
              Flag as excess / dead stock
            </label>
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.buttonPrimary} disabled={saving}>
              {saving ? "Saving…" : "Add part"}
            </button>
          </div>
        </form>
      </section>
    </OpsShell>
  );
}
