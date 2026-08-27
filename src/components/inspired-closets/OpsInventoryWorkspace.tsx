"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  receivingShortJobs?: Array<{
    job_name: string;
    cust_ref: string;
    open: number;
  }>;
  receivingOpenLines?: number;
  receivingUnassigned?: Array<{ label: string; lines: number }>;
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
  const [vendorFilter, setVendorFilter] = useState("all");
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
  const importFileRef = useRef<HTMLInputElement>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showAttention, setShowAttention] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);

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
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPart = useMemo(
    () => parts.find((part) => part.id === selectedPartId) ?? null,
    [parts, selectedPartId],
  );

  const vendors = useMemo(() => {
    const names = new Set<string>();
    for (const part of parts) {
      const vendor = part.vendor?.trim();
      if (vendor) names.add(vendor);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [parts]);

  const visibleParts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parts
      .filter((part) => vendorFilter === "all" || (part.vendor ?? "").trim() === vendorFilter)
      .filter((part) => {
        if (!q) return true;
        const hay = `${part.sku} ${part.name} ${part.size ?? ""} ${part.location ?? ""} ${part.barcode ?? ""} ${part.vendor ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const vendorCmp = (a.vendor ?? "zzz").localeCompare(b.vendor ?? "zzz");
        if (vendorCmp !== 0) return vendorCmp;
        return a.name.localeCompare(b.name);
      });
  }, [parts, query, vendorFilter]);

  const deskSummary = useMemo(() => {
    const pieces = parts.reduce((sum, part) => sum + (part.qty_on_hand ?? 0), 0);
    return { pieces, vendors: vendors.length };
  }, [parts, vendors.length]);

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
    if (!detailOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen]);

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
      setMoveForm({ type: moveForm.type, qty: "", job_id: "", note: "" });
      setMoveModalOpen(false);
      setNotice({
        kind: "info",
        text:
          moveForm.type === "receive"
            ? `Received ${qty} × ${selectedPart?.sku ?? "part"}. Stock is up to date.`
            : moveForm.type === "allocate"
              ? `${qty} × ${selectedPart?.sku ?? "part"} put on the job. Materials cost updated.`
              : `${moveForm.type} recorded for ${selectedPart?.sku ?? "part"}.`,
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

  async function runImport(source?: { text?: string; file?: File }) {
    const file = source?.file;
    const text = (source?.text ?? importCsv).trim();
    if (!file && !text) {
      setNotice({
        kind: "error",
        text: "Choose the Excel file, or copy the Warehouse count tab and paste it first.",
      });
      return;
    }
    setImporting(true);
    setNotice(null);
    try {
      let response: Response;
      if (file) {
        const body = new FormData();
        body.append("file", file);
        response = await fetch("/api/inspired-closets/ops/inventory/import", {
          method: "POST",
          body,
        });
      } else {
        response = await fetch("/api/inspired-closets/ops/inventory/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: text }),
        });
      }
      const raw = await response.text();
      let payload: {
        ok: boolean;
        error?: string;
        created?: number;
        updated?: number;
        errors?: string[];
      };
      try {
        payload = JSON.parse(raw) as typeof payload;
      } catch {
        throw new Error(raw.slice(0, 180) || "Import failed.");
      }
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

  function importControls() {
    return (
      <>
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv,text/csv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void runImport({ file });
          }}
        />
        <textarea
          className={styles.input}
          rows={5}
          value={importCsv}
          onChange={(e) => setImportCsv(e.target.value)}
          placeholder="Or paste here from Excel — copy the Warehouse count tab, including the header row"
          style={{ fontFamily: "monospace", fontSize: "0.8rem", width: "100%" }}
        />
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={importing}
            onClick={() => importFileRef.current?.click()}
          >
            {importing ? "Importing…" : "Choose Excel / CSV"}
          </button>
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={importing}
            onClick={() => void runImport()}
          >
            {importing ? "Importing…" : "Import pasted rows"}
          </button>
        </div>
      </>
    );
  }

  return (
    <OpsShell
      title="Inventory"
      subtitle="Hardware on the shelf — search an item number, pull to a job, or open receiving when a truck hits the dock"
      actions={
        <>
          <Link href="/inspired-closets/ops/inventory/receiving" className={styles.buttonPrimary}>
            Receiving / scan
          </Link>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </>
      }
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      {!loading && parts.length === 0 && !query.trim() && filter === "all" ? (
        <section className={styles.panel} style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.15rem" }}>
            Start here: load what’s in the warehouse
          </h2>
          <p className={styles.empty} style={{ marginTop: 0 }}>
            Hit <strong>Choose Excel / CSV</strong> and pick the warehouse count file. After
            this, daily work is <strong>Receiving / scan</strong> when a truck arrives and{" "}
            <strong>To job</strong> when parts are pulled.
          </p>
          {importControls()}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={() => setShowSetup((v) => !v)}
            >
              {showSetup ? "Hide single-part form" : "Or add one part by hand"}
            </button>
          </div>
        </section>
      ) : (
        <section className={styles.panel} style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.95rem" }}>
              <strong>{deskSummary.pieces}</strong> pieces on the shelf · truck arrives →{" "}
              <Link href="/inspired-closets/ops/inventory/receiving">Receiving</Link>
              . Pull for a client → <strong>To job</strong>.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => setShowAttention((v) => !v)}
              >
                {showAttention ? "Hide" : "Needs attention"}
                {attention
                  ? ` (${
                      attention.lowStock.length +
                      attention.missingMaterials.length +
                      (attention.unstagedInstalls ?? []).length +
                      (attention.receivingOpenLines ?? 0)
                    })`
                  : ""}
              </button>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => setShowSetup((v) => !v)}
              >
                {showSetup ? "Hide setup" : "Add parts / upload count"}
              </button>
            </div>
          </div>
        </section>
      )}

      {showAttention && attention ? (
        <section className={styles.panel} style={{ marginBottom: "1rem" }}>
          <p className={styles.subtitle} style={{ marginBottom: "0.65rem" }}>
            Needs attention · what’s leaking money
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
            <span>
              Slip lines still out{" "}
              <span className={styles.summaryStrong}>{attention.receivingOpenLines ?? 0}</span>
            </span>
            <span>
              Received with no job{" "}
              <span className={styles.summaryStrong}>
                {(attention.receivingUnassigned ?? []).reduce((sum, row) => sum + row.lines, 0)}
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
          {(attention.receivingShortJobs ?? []).length > 0 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <p className={styles.fieldLabel}>Packing-slip jobs still short</p>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                {(attention.receivingShortJobs ?? []).slice(0, 8).map((job) => (
                  <li key={job.cust_ref} style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                    {job.job_name} · {job.open} lines not fully received
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(attention.receivingUnassigned ?? []).length > 0 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <p className={styles.fieldLabel}>On a slip with no OS job</p>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                {(attention.receivingUnassigned ?? []).slice(0, 8).map((row) => (
                  <li key={row.label} style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                    {row.label} · {row.lines} lines
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {showSetup && !(parts.length === 0 && !query.trim() && filter === "all") ? (
        <section className={styles.panel} style={{ marginBottom: "1rem" }}>
          <p className={styles.subtitle} style={{ marginBottom: "0.5rem" }}>
            Upload more counts (same sheet as the first upload)
          </p>
          <p className={styles.empty} style={{ marginTop: 0 }}>
            Re-uploading a SKU trues up its count — it never duplicates.
          </p>
          {importControls()}
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
            <span className={styles.summaryStrong}>{summary.totalParts}</span> SKUs
          </span>
          <span>
            <span className={styles.summaryStrong}>{deskSummary.vendors}</span> vendors
          </span>
          <span>
            <span className={styles.summaryStrong}>{deskSummary.pieces}</span> on hand
          </span>
          <span>
            <span className={styles.summaryStrong}>{summary.lowStock}</span> low stock
          </span>
          <span>
            On-hand value{" "}
            <span className={styles.summaryStrong}>{centsToDisplay(summary.valueCents)}</span>
          </span>
        </div>

        <label className={styles.field} style={{ marginBottom: "0.65rem", maxWidth: "28rem" }}>
          <span className={styles.fieldLabel}>Find a part</span>
          <input
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Item #, name, vendor — 3564900, valet, Richelieu"
          />
        </label>
        <div className={styles.filterChips}>
          <button
            type="button"
            className={`${styles.chip} ${vendorFilter === "all" ? styles.chipOn : ""}`}
            onClick={() => setVendorFilter("all")}
          >
            All vendors
          </button>
          {vendors.map((vendor) => (
            <button
              key={vendor}
              type="button"
              className={`${styles.chip} ${vendorFilter === vendor ? styles.chipOn : ""}`}
              onClick={() => setVendorFilter(vendor)}
            >
              {vendor}
            </button>
          ))}
        </div>

        {loading ? (
          <p className={styles.empty}>Loading inventory…</p>
        ) : visibleParts.length === 0 ? (
          <p className={styles.empty}>
            {query.trim() || vendorFilter !== "all"
              ? "No parts match that search."
              : "Nothing here yet — use the Start here box above to load the warehouse count."}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Part</th>
                <th>Item #</th>
                <th>Vendor</th>
                <th>Size</th>
                <th>Bin</th>
                <th>Available</th>
                <th>On hand</th>
                <th>On jobs</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleParts.map((part) => {
                const low = part.qty_on_hand <= part.reorder_point;
                const avail = Math.max(0, part.qty_on_hand - part.qty_reserved);
                return (
                  <tr
                    key={part.id}
                    className={low || part.is_excess ? styles.rowHeld : undefined}
                  >
                    <td>
                      <strong>{part.sku}</strong>
                      <div className={styles.mutedLine}>{part.name}</div>
                    </td>
                    <td className={styles.skuMono}>{part.barcode || part.sku}</td>
                    <td>{part.vendor ?? "—"}</td>
                    <td>{part.size ?? "—"}</td>
                    <td>{part.location ?? "—"}</td>
                    <td>
                      <strong>{avail}</strong>
                    </td>
                    <td className={low ? styles.marginBelow : undefined}>{part.qty_on_hand}</td>
                    <td>{part.qty_reserved}</td>
                    <td>
                      {low ? (
                        <span className={`${styles.statusBadge} ${styles.statusHeld}`}>
                          order more
                        </span>
                      ) : null}{" "}
                      {part.is_excess ? (
                        <span className={`${styles.statusBadge} ${styles.statusPayable}`}>
                          excess
                        </span>
                      ) : null}
                      {!low && !part.is_excess ? (
                        <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>ok</span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className={styles.buttonPrimary}
                        style={{ marginRight: "0.35rem" }}
                        onClick={() => {
                          setSelectedPartId(part.id);
                          setMoveForm({ type: "receive", qty: "", job_id: "", note: "" });
                          setMoveModalOpen(true);
                          setDetailOpen(false);
                        }}
                      >
                        + Receive
                      </button>
                      <button
                        type="button"
                        className={styles.buttonPrimary}
                        style={{ marginRight: "0.35rem" }}
                        onClick={() => {
                          setSelectedPartId(part.id);
                          setMoveForm({ type: "allocate", qty: "", job_id: "", note: "" });
                          setMoveModalOpen(true);
                          setDetailOpen(false);
                        }}
                      >
                        → To job
                      </button>
                      <button
                        type="button"
                        className={styles.buttonGhost}
                        onClick={() => {
                          setSelectedPartId(part.id);
                          setDetailOpen(selectedPartId === part.id ? !detailOpen : true);
                          setMoveModalOpen(false);
                        }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {moveModalOpen && selectedPart ? (
          <form
            className={styles.formGrid}
            onSubmit={runMovement}
            style={{
              marginTop: "1rem",
              padding: "1rem",
              border: "2px solid currentColor",
              borderRadius: "0.75rem",
            }}
          >
            <p
              className={styles.fieldLabel}
              style={{ gridColumn: "1 / -1", margin: 0, fontSize: "0.95rem" }}
            >
              {moveForm.type === "receive"
                ? `Receiving stock · ${selectedPart.sku}`
                : moveForm.type === "allocate"
                  ? `Sending to a job · ${selectedPart.sku} (${Math.max(
                      0,
                      selectedPart.qty_on_hand - selectedPart.qty_reserved,
                    )} available)`
                  : `${moveForm.type} · ${selectedPart.sku}`}
              {selectedPart.size ? ` · ${selectedPart.size}` : ""}
            </p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>What happened?</span>
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
                <option value="receive">Stock arrived (receive)</option>
                <option value="allocate">Pulled for a job (allocate)</option>
                <option value="return">Came back from a job (return)</option>
                <option value="adjust">Fix the count (+/-)</option>
                <option value="scrap">Damaged / scrap</option>
                <option value="sell_excess">Sold excess</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>How many?</span>
              <input
                className={styles.input}
                value={moveForm.qty}
                onChange={(event) => setMoveForm({ ...moveForm, qty: event.target.value })}
                placeholder={moveForm.type === "adjust" ? "+5 or -2" : "1"}
                autoFocus
                required
              />
            </label>
            {(moveForm.type === "allocate" || moveForm.type === "return") && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Which job?</span>
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
              <span className={styles.fieldLabel}>Note (optional)</span>
              <input
                className={styles.input}
                value={moveForm.note}
                onChange={(event) => setMoveForm({ ...moveForm, note: event.target.value })}
                placeholder="Pallet #, Stow invoice…"
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.buttonPrimary} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => setMoveModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {detailOpen && selectedPart ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setDetailOpen(false)}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-label={`Details ${selectedPart.sku}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHead}>
                <div>
                  <h3 className={styles.modalTitle}>
                    {selectedPart.sku}
                    {selectedPart.size ? ` · ${selectedPart.size}` : ""}
                  </h3>
                  <p className={styles.modalSub}>
                    {selectedPart.name} · available{" "}
                    {Math.max(0, selectedPart.qty_on_hand - selectedPart.qty_reserved)} · on
                    hand {selectedPart.qty_on_hand} · on jobs {selectedPart.qty_reserved} ·{" "}
                    {centsToDisplay(selectedPart.qty_on_hand * selectedPart.unit_cost_cents)} on
                    shelf
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => setDetailOpen(false)}
                >
                  Close
                </button>
              </div>
            <form className={styles.formGrid} onSubmit={savePartEdit}>
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
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => void toggleExcess(selectedPart)}
                >
                  {selectedPart.is_excess ? "Clear excess flag" : "Mark as excess / dead stock"}
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
            </div>
          </div>
        ) : null}

        {showSetup ? (
          <form className={styles.formGrid} onSubmit={addPart}>
            <p className={styles.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
              Add one part by hand
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
        ) : null}
      </section>
    </OpsShell>
  );
}
