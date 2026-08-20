"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type Part = {
  id: string;
  sku: string;
  name: string;
  size: string | null;
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

type Movement = {
  id: string;
  part_id: string;
  job_id: string | null;
  movement_type: string;
  qty: number;
  unit_cost_cents: number | null;
  note: string | null;
  created_at: string;
};

type Attention = {
  lowStock: Array<{
    id: string;
    sku: string;
    name: string;
    qty_on_hand: number;
    reorder_point: number;
    value_cents: number;
  }>;
  excessCount: number;
  excessValueCents: number;
  unallocatedReceives: Array<{
    part_id: string;
    sku: string;
    name: string;
    qty: number;
    created_at: string;
  }>;
  missingMaterials: Array<{
    id: string;
    stage: string;
    install_date: string | null;
    contract_cents: number;
    client_name: string;
  }>;
  unstagedInstalls?: Array<{
    id: string;
    client_name: string;
    install_date: string | null;
    unstaged: number;
  }>;
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
  movements?: Movement[];
  attention?: Attention;
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
  size: "",
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
  const [movements, setMovements] = useState<Movement[]>([]);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [editForm, setEditForm] = useState({
    location: "",
    barcode: "",
    unit_cost: "",
    reorder_point: "",
    vendor: "",
    notes: "",
    size: "",
  });
  const [jobMaterialTotal, setJobMaterialTotal] = useState<number | null>(null);
  const [importCsv, setImportCsv] = useState("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (query.trim()) params.set("q", query.trim());

      const [partsRes, jobsRes, attentionRes] = await Promise.all([
        fetch(`/api/inspired-closets/ops/inventory/parts?${params.toString()}`),
        fetch("/api/inspired-closets/ops/jobs"),
        fetch("/api/inspired-closets/ops/inventory/attention"),
      ]);
      const partsPayload = (await partsRes.json()) as ApiResponse;
      const jobsPayload = (await jobsRes.json()) as ApiResponse;
      const attentionPayload = (await attentionRes.json()) as ApiResponse;
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
      if (attentionPayload.ok) setAttention(attentionPayload.attention ?? null);
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

  useEffect(() => {
    if (!selectedPart) return;
    setEditForm({
      location: selectedPart.location ?? "",
      barcode: selectedPart.barcode ?? "",
      unit_cost: (selectedPart.unit_cost_cents / 100).toFixed(2),
      reorder_point: String(selectedPart.reorder_point),
      vendor: selectedPart.vendor ?? "",
      notes: selectedPart.notes ?? "",
      size: selectedPart.size ?? "",
    });
  }, [selectedPart]);

  useEffect(() => {
    if (!selectedPartId) {
      setMovements([]);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(
          `/api/inspired-closets/ops/inventory/movements?partId=${selectedPartId}`,
        );
        const payload = (await response.json()) as ApiResponse;
        if (payload.ok) setMovements(payload.movements ?? []);
      } catch {
        setMovements([]);
      }
    })();
  }, [selectedPartId]);

  useEffect(() => {
    if (!moveForm.job_id || (moveForm.type !== "allocate" && moveForm.type !== "return")) {
      setJobMaterialTotal(null);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(
          `/api/inspired-closets/ops/inventory/movements?jobId=${moveForm.job_id}`,
        );
        const payload = (await response.json()) as ApiResponse;
        if (!payload.ok) {
          setJobMaterialTotal(null);
          return;
        }
        let total = 0;
        for (const m of payload.movements ?? []) {
          const unit = m.unit_cost_cents ?? 0;
          const qty = Math.abs(m.qty);
          if (m.movement_type === "allocate") total += qty * unit;
          if (m.movement_type === "return") total -= qty * unit;
        }
        setJobMaterialTotal(total);
      } catch {
        setJobMaterialTotal(null);
      }
    })();
  }, [moveForm.job_id, moveForm.type]);

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
          size: partForm.size || null,
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
      if (selectedPartId) {
        const hist = await fetch(
          `/api/inspired-closets/ops/inventory/movements?partId=${selectedPartId}`,
        );
        const histPayload = (await hist.json()) as ApiResponse;
        if (histPayload.ok) setMovements(histPayload.movements ?? []);
      }
      if (moveForm.job_id && (moveForm.type === "allocate" || moveForm.type === "return")) {
        const jobHist = await fetch(
          `/api/inspired-closets/ops/inventory/movements?jobId=${moveForm.job_id}`,
        );
        const jobPayload = (await jobHist.json()) as ApiResponse;
        if (jobPayload.ok) {
          let total = 0;
          for (const m of jobPayload.movements ?? []) {
            const unit = m.unit_cost_cents ?? 0;
            const qty = Math.abs(m.qty);
            if (m.movement_type === "allocate") total += qty * unit;
            if (m.movement_type === "return") total -= qty * unit;
          }
          setJobMaterialTotal(total);
        }
      }
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

  async function savePartEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPartId) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/inventory/parts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPartId,
          location: editForm.location || null,
          barcode: editForm.barcode || null,
          unit_cost_cents: dollarsInputToCents(editForm.unit_cost),
          reorder_point: Number(editForm.reorder_point) || 0,
          vendor: editForm.vendor || null,
          notes: editForm.notes || null,
          size: editForm.size || null,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to update part.");
      setNotice({ kind: "info", text: "Part details saved." });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update part.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runImport() {
    if (!importCsv.trim()) return;
    setImporting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: importCsv }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        created?: number;
        updated?: number;
        errors?: string[];
      };
      if (!payload.ok) throw new Error(payload.error ?? "Import failed.");
      const extra = payload.errors?.length ? ` · ${payload.errors.length} row errors` : "";
      setNotice({
        kind: payload.errors?.length ? "error" : "info",
        text: `Imported — ${payload.created ?? 0} new, ${payload.updated ?? 0} updated${extra}.`,
      });
      setImportCsv("");
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

      <section className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.5rem" }}>
          One-time warehouse upload — then only receive and allocate
        </p>
        <p className={styles.empty} style={{ marginTop: 0 }}>
          Brian counts the shelf, pastes the CSV. Size is required so 18&quot; and 21&quot; slides
          cannot get mixed up.{" "}
          <a href="/api/inspired-closets/ops/inventory/import">Download count sheet</a>.
        </p>
        <textarea
          className={styles.input}
          rows={5}
          value={importCsv}
          onChange={(e) => setImportCsv(e.target.value)}
          placeholder="sku,name,size,category,location,qty,unit_cost,reorder_point,vendor"
          style={{ fontFamily: "monospace", fontSize: "0.8rem", width: "100%" }}
        />
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={importing || !importCsv.trim()}
            onClick={() => void runImport()}
          >
            {importing ? "Importing…" : "Import count"}
          </button>
        </div>
      </section>

      {attention ? (
        <section className={styles.panel} style={{ marginBottom: "1rem" }}>
          <p className={styles.subtitle} style={{ marginBottom: "0.65rem" }}>
            Gavin / Frank · money leaks
          </p>
          <div className={styles.summaryRow}>
            <span>
              Low stock{" "}
              <span className={styles.summaryStrong}>{attention.lowStock.length}</span>
            </span>
            <span>
              Excess value{" "}
              <span className={styles.summaryStrong}>
                {centsToDisplay(attention.excessValueCents)}
              </span>{" "}
              ({attention.excessCount} parts)
            </span>
            <span>
              Receives w/o allocate{" "}
              <span className={styles.summaryStrong}>
                {attention.unallocatedReceives.length}
              </span>
            </span>
            <span>
              Installs missing materials{" "}
              <span className={styles.summaryStrong}>
                {attention.missingMaterials.length}
              </span>
            </span>
            <span>
              Unstaged next 3 days{" "}
              <span className={styles.summaryStrong}>
                {(attention.unstagedInstalls ?? []).length}
              </span>
            </span>
          </div>
          {attention.missingMaterials.length > 0 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <p className={styles.fieldLabel}>Jobs with $0 materials (likely missing allocate)</p>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                {attention.missingMaterials.slice(0, 8).map((job) => (
                  <li key={job.id} style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                    {job.client_name} · {job.stage.replace(/_/g, " ")} ·{" "}
                    {centsToDisplay(job.contract_cents)}
                    {job.install_date ? ` · install ${job.install_date}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {attention.lowStock.length > 0 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <p className={styles.fieldLabel}>Low stock (below reorder)</p>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                {attention.lowStock.slice(0, 6).map((part) => (
                  <li key={part.id} style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                    {part.sku} · {part.name} · on hand {part.qty_on_hand} / reorder{" "}
                    {part.reorder_point} · {centsToDisplay(part.value_cents)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {attention.unallocatedReceives.length > 0 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <p className={styles.fieldLabel}>Receives this week still unallocated</p>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                {attention.unallocatedReceives.slice(0, 6).map((row, idx) => (
                  <li
                    key={`${row.part_id}-${idx}`}
                    style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}
                  >
                    {row.sku} · +{row.qty} · {new Date(row.created_at).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(attention.unstagedInstalls ?? []).length > 0 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <p className={styles.fieldLabel}>
                Installs in the next 3 days with parts not staged/packed
              </p>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                {(attention.unstagedInstalls ?? []).slice(0, 8).map((job) => (
                  <li key={job.id} style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                    {job.client_name}
                    {job.install_date ? ` · ${job.install_date}` : ""} · {job.unstaged}{" "}
                    unstaged
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
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
                <th>Size</th>
                <th>Category</th>
                <th>Bin</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Avail</th>
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
                    <td>{part.size ?? "—"}</td>
                    <td>{part.category}</td>
                    <td>{part.location ?? "—"}</td>
                    <td className={low ? styles.marginBelow : undefined}>{part.qty_on_hand}</td>
                    <td>{part.qty_reserved}</td>
                    <td>{Math.max(0, part.qty_on_hand - part.qty_reserved)}</td>
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
          {jobMaterialTotal != null ? (
            <p className={styles.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
              Materials on this job so far:{" "}
              <span className={styles.summaryStrong}>{centsToDisplay(jobMaterialTotal)}</span>
            </p>
          ) : null}
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

        {selectedPart ? (
          <>
            <form className={styles.formGrid} onSubmit={savePartEdit}>
              <p className={styles.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
                Edit part · {selectedPart.sku}
                {selectedPart.size ? ` · ${selectedPart.size}` : ""} · reserved{" "}
                {selectedPart.qty_reserved} · available{" "}
                {Math.max(0, selectedPart.qty_on_hand - selectedPart.qty_reserved)} · on-hand
                value {centsToDisplay(selectedPart.qty_on_hand * selectedPart.unit_cost_cents)}
              </p>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Size</span>
                <input
                  className={styles.input}
                  value={editForm.size}
                  onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                  placeholder="21 in"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Bin / location</span>
                <input
                  className={styles.input}
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Barcode</span>
                <input
                  className={styles.input}
                  value={editForm.barcode}
                  onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Unit cost</span>
                <input
                  className={styles.input}
                  value={editForm.unit_cost}
                  onChange={(e) => setEditForm({ ...editForm, unit_cost: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Reorder point</span>
                <input
                  className={styles.input}
                  value={editForm.reorder_point}
                  onChange={(e) => setEditForm({ ...editForm, reorder_point: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Vendor</span>
                <input
                  className={styles.input}
                  value={editForm.vendor}
                  onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Notes</span>
                <input
                  className={styles.input}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </label>
              <div className={styles.formActions}>
                <button type="submit" className={styles.buttonPrimary} disabled={saving}>
                  Save part
                </button>
              </div>
            </form>

            <div style={{ marginTop: "1rem" }}>
              <p className={styles.fieldLabel}>Movement history · {selectedPart.sku}</p>
              {movements.length === 0 ? (
                <p className={styles.empty}>No movements yet for this part.</p>
              ) : (
                <table className={styles.table} style={{ minWidth: "36rem" }}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>Job</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.slice(0, 40).map((m) => (
                      <tr key={m.id}>
                        <td>{new Date(m.created_at).toLocaleString()}</td>
                        <td>{m.movement_type}</td>
                        <td>{m.qty}</td>
                        <td>{m.job_id ? m.job_id.slice(0, 8) : "—"}</td>
                        <td>{m.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}

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
            <span className={styles.fieldLabel}>Size</span>
            <input
              className={styles.input}
              value={partForm.size}
              onChange={(event) => setPartForm({ ...partForm, size: event.target.value })}
              placeholder="21 in"
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
