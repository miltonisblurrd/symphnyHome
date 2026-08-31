"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import styles from "./ops-payroll.module.css";

type AttentionKey =
  | "low"
  | "excess"
  | "unallocated"
  | "missing"
  | "unstaged"
  | "slip"
  | "nojob";

type Part = {
  id: string;
  sku: string;
  name: string;
  color: string | null;
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
  item_number: "",
  name: "",
  color: "",
  size: "",
  category: "hardware",
  qty: "",
  unit_cost: "",
  reorder_point: "5",
  vendor: "",
  notes: "",
  is_excess: false,
};

function partTitle(part: { name: string; color?: string | null; size?: string | null }): string {
  return [part.name, part.color, part.size].filter(Boolean).join(" · ");
}

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
  const [filter, setFilter] = useState<"all" | "low">("all");
  const [listUpdatedAt, setListUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [selectedPartId, setSelectedPartId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [partForm, setPartForm] = useState({ ...EMPTY_PART });
  const [moveForm, setMoveForm] = useState({
    type: "adjust" as "receive" | "allocate" | "return" | "adjust" | "scrap" | "sell_excess",
    qty: "",
    job_id: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    color: "",
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
  const [setupOpen, setSetupOpen] = useState(false);
  const [attentionKey, setAttentionKey] = useState<AttentionKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);

      const partsReq = fetch(`/api/inspired-closets/ops/inventory/parts?${params.toString()}`);
      const jobsReq = fetch("/api/inspired-closets/ops/jobs");
      const attentionReq = fetch("/api/inspired-closets/ops/inventory/attention");

      const partsRes = await partsReq;
      const partsPayload = (await partsRes.json()) as ApiResponse;
      if (!partsPayload.ok) throw new Error(partsPayload.error ?? "Failed to load parts.");
      setParts(partsPayload.parts ?? []);
      setCategories(partsPayload.categories ?? []);
      setSummary(
        partsPayload.summary ?? { totalParts: 0, lowStock: 0, excess: 0, valueCents: 0 },
      );
      setSelectedPartId((current) => current || partsPayload.parts?.[0]?.id || "");
      setListUpdatedAt(new Date());
      setLoading(false);

      const [jobsRes, attentionRes] = await Promise.all([jobsReq, attentionReq]);
      const jobsPayload = (await jobsRes.json()) as ApiResponse;
      const attentionPayload = (await attentionRes.json()) as ApiResponse;
      if (jobsPayload.ok) {
        setJobs(
          (jobsPayload.jobs ?? []).filter(
            (job) => !["closed", "cancelled"].includes(job.stage),
          ),
        );
      }
      if (attentionPayload.ok) setAttention(attentionPayload.attention ?? null);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load inventory.",
      });
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
        const hay = `${part.name} ${part.color ?? ""} ${part.size ?? ""} ${part.barcode ?? ""} ${part.vendor ?? ""}`.toLowerCase();
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

  const noJobLines = (attention?.receivingUnassigned ?? []).reduce(
    (sum, row) => sum + row.lines,
    0,
  );
  const pulseCards: Array<{
    key: AttentionKey;
    label: string;
    value: string;
    alert: boolean;
  }> = [
    {
      key: "low",
      label: "Low stock",
      value: String(attention?.lowStock.length ?? 0),
      alert: (attention?.lowStock.length ?? 0) > 0,
    },
    {
      key: "excess",
      label: "Excess value",
      value: centsToDisplay(attention?.excessValueCents ?? 0),
      alert: (attention?.excessCount ?? 0) > 0,
    },
    {
      key: "unallocated",
      label: "Receives w/o allocate",
      value: String(attention?.unallocatedReceives.length ?? 0),
      alert: (attention?.unallocatedReceives.length ?? 0) > 0,
    },
    {
      key: "missing",
      label: "Installs missing materials",
      value: String(attention?.missingMaterials.length ?? 0),
      alert: (attention?.missingMaterials.length ?? 0) > 0,
    },
    {
      key: "unstaged",
      label: "Unstaged next 3 days",
      value: String((attention?.unstagedInstalls ?? []).length),
      alert: (attention?.unstagedInstalls ?? []).length > 0,
    },
    {
      key: "slip",
      label: "Slip lines still out",
      value: String(attention?.receivingOpenLines ?? 0),
      alert: (attention?.receivingOpenLines ?? 0) > 0,
    },
    {
      key: "nojob",
      label: "Received with no job",
      value: String(noJobLines),
      alert: noJobLines > 0,
    },
  ];

  const attentionCopy: Record<AttentionKey, { title: string; empty: string }> = {
    low: { title: "Low stock (below reorder)", empty: "Nothing is below reorder right now." },
    excess: { title: "Excess / dead stock", empty: "No parts flagged as excess." },
    unallocated: {
      title: "Receives this week still unallocated",
      empty: "Every receive this week is allocated.",
    },
    missing: {
      title: "Jobs with $0 materials (likely missing allocate)",
      empty: "Install jobs have material against them.",
    },
    unstaged: {
      title: "Installs in the next 3 days with parts not staged/packed",
      empty: "Nothing unstaged in the next 3 days.",
    },
    slip: { title: "Packing-slip jobs still short", empty: "No open slip lines." },
    nojob: { title: "On a slip with no OS job", empty: "Every slip line is tied to a job." },
  };

  useEffect(() => {
    if (!selectedPart) return;
    setEditForm({
      name: selectedPart.name ?? "",
      color: selectedPart.color ?? "",
      barcode: selectedPart.barcode ?? "",
      unit_cost: (selectedPart.unit_cost_cents / 100).toFixed(2),
      reorder_point: String(selectedPart.reorder_point),
      vendor: selectedPart.vendor ?? "",
      notes: selectedPart.notes ?? "",
      size: selectedPart.size ?? "",
    });
  }, [selectedPart]);

  useEffect(() => {
    if (!detailOpen && !setupOpen && !attentionKey && !moveModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDetailOpen(false);
      setSetupOpen(false);
      setAttentionKey(null);
      setMoveModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen, setupOpen, attentionKey, moveModalOpen]);

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
          item_number: partForm.item_number || null,
          name: partForm.name,
          color: partForm.color || null,
          size: partForm.size || null,
          category: partForm.category,
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
      setNotice({ kind: "info", text: `Added ${payload.part?.name ?? "part"}.` });
      if (payload.part?.id) setSelectedPartId(payload.part.id);
      setSetupOpen(false);
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
            ? `Received ${qty} × ${selectedPart ? partTitle(selectedPart) : "part"}. Stock is up to date.`
            : moveForm.type === "allocate"
              ? `${qty} × ${selectedPart ? partTitle(selectedPart) : "part"} put on the job. Materials cost updated.`
              : `${moveForm.type} recorded for ${selectedPart ? partTitle(selectedPart) : "part"}.`,
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
          name: editForm.name.trim(),
          color: editForm.color || null,
          barcode: editForm.barcode.trim() || null,
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
      setSetupOpen(false);
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
      subtitle="Hardware on the shelf — search an item number, pull to a job, or upload a new count"
    >
      {notice ? (
        <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
          {notice.text}
        </p>
      ) : null}

      <section style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.65rem" }}>
          Needs attention · what’s leaking money
        </p>
        <div className={styles.pulseGrid}>
          {pulseCards.map((card) => (
            <button
              key={card.key}
              type="button"
              className={`${styles.pulseCard} ${card.alert ? styles.pulseCardAlert : ""}`}
              onClick={() => setAttentionKey(card.key)}
            >
              <p className={styles.statCardLabel}>{card.label}</p>
              <p className={styles.statCardValue}>{card.value}</p>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.listToolbar}>
        <nav className={styles.tabs} aria-label="Inventory views">
          {(
            [
              ["all", "All parts"],
              ["low", "Low stock"],
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
        <div className={styles.toolbarRight}>
          <p className={styles.updatedStamp}>
            {listUpdatedAt
              ? `Updated ${listUpdatedAt.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : loading
                ? "Updating…"
                : "—"}
          </p>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => setSetupOpen(true)}
          >
            Add parts / upload count
          </button>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.summaryRow}>
          <span>
            <span className={styles.summaryStrong}>{summary.totalParts}</span> parts
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
            placeholder="Name, color, item #, vendor — valet, black, 3564900"
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
              : "Nothing here yet — use Add parts / upload count."}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Item #</th>
                <th>Color</th>
                <th>Vendor</th>
                <th>Size</th>
                <th>Available</th>
                <th>On jobs</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleParts.map((part) => {
                const low = part.qty_on_hand <= part.reorder_point;
                return (
                  <tr
                    key={part.id}
                    className={low || part.is_excess ? styles.rowHeld : undefined}
                  >
                    <td>
                      <strong>{part.name}</strong>
                    </td>
                    <td className={styles.skuMono}>
                      {part.barcode ?? ""}
                    </td>
                    <td>{part.color ?? ""}</td>
                    <td>{part.vendor ?? "—"}</td>
                    <td>{part.size ?? "—"}</td>
                    <td className={low ? styles.marginBelow : undefined}>
                      <strong>{part.qty_on_hand}</strong>
                    </td>
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
                          setMoveForm({ type: "adjust", qty: "", job_id: "", note: "" });
                          setMoveModalOpen(true);
                          setDetailOpen(false);
                        }}
                      >
                        + Qty
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
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setMoveModalOpen(false)}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-label={
                moveForm.type === "allocate"
                  ? `To job · ${partTitle(selectedPart)}`
                  : moveForm.type === "adjust"
                    ? `Update qty · ${partTitle(selectedPart)}`
                    : `${moveForm.type} · ${partTitle(selectedPart)}`
              }
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHead}>
                <div>
                  <h3 className={styles.modalTitle}>
                    {moveForm.type === "adjust"
                      ? `Update qty · ${partTitle(selectedPart)}`
                      : moveForm.type === "receive"
                        ? `Stock arrived · ${partTitle(selectedPart)}`
                        : moveForm.type === "allocate"
                          ? `Sending to a job · ${partTitle(selectedPart)}`
                          : `${moveForm.type} · ${partTitle(selectedPart)}`}
                  </h3>
                  {moveForm.type === "allocate" ? (
                    <p className={styles.modalSub}>
                      {Math.max(0, selectedPart.qty_on_hand - selectedPart.qty_reserved)} available
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => setMoveModalOpen(false)}
                >
                  Close
                </button>
              </div>
              <form className={styles.formGrid} onSubmit={runMovement}>
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
                      onChange={(event) =>
                        setMoveForm({ ...moveForm, job_id: event.target.value })
                      }
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
            </div>
          </div>
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
              aria-label={`Details ${selectedPart.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHead}>
                <div>
                  <h3 className={styles.modalTitle}>{selectedPart.name}</h3>
                  <p className={styles.modalSub}>
                    {[selectedPart.color, selectedPart.size, selectedPart.barcode]
                      .filter(Boolean)
                      .join(" · ")}
                    {selectedPart.color || selectedPart.size || selectedPart.barcode
                      ? " · "
                      : ""}
                    available {selectedPart.qty_on_hand} ·{" "}
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
                <span className={styles.fieldLabel}>Name</span>
                <input
                  className={styles.input}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Item #</span>
                <input
                  className={styles.input}
                  value={editForm.barcode}
                  onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                  placeholder="Leave blank if there isn’t one"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Color</span>
                <input
                  className={styles.input}
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                />
              </label>
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
              <p className={styles.fieldLabel}>Movement history · {selectedPart.name}</p>
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

      </section>

      {setupOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setSetupOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-label="Add parts / upload count"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <div>
                <h3 className={styles.modalTitle}>Add parts / upload count</h3>
                <p className={styles.modalSub}>
                  Upload more counts (same sheet as the first upload)
                </p>
              </div>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => setSetupOpen(false)}
              >
                Close
              </button>
            </div>
            <p className={styles.empty} style={{ marginTop: 0 }}>
              Re-uploading the same item number — or the same name + color + size — updates the
              count. Blank item numbers stay blank.
            </p>
            {importControls()}
            <form className={styles.formGrid} onSubmit={addPart} style={{ marginTop: "1.1rem" }}>
              <p className={styles.fieldLabel} style={{ gridColumn: "1 / -1", margin: 0 }}>
                Add one part by hand
              </p>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <input
                  className={styles.input}
                  value={partForm.name}
                  onChange={(event) => setPartForm({ ...partForm, name: event.target.value })}
                  placeholder="Jewelry tray"
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Item #</span>
                <input
                  className={styles.input}
                  value={partForm.item_number}
                  onChange={(event) =>
                    setPartForm({ ...partForm, item_number: event.target.value })
                  }
                  placeholder="Leave blank if there isn’t one"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Color</span>
                <input
                  className={styles.input}
                  value={partForm.color}
                  onChange={(event) => setPartForm({ ...partForm, color: event.target.value })}
                  placeholder="black"
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
                  onChange={(event) =>
                    setPartForm({ ...partForm, category: event.target.value })
                  }
                >
                  {(categories.length ? categories : ["hardware"]).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
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
                  onChange={(event) =>
                    setPartForm({ ...partForm, unit_cost: event.target.value })
                  }
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
              <div className={styles.formActions}>
                <button type="submit" className={styles.buttonPrimary} disabled={saving}>
                  {saving ? "Saving…" : "Add part"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {attentionKey ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setAttentionKey(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-label={attentionCopy[attentionKey].title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <div>
                <h3 className={styles.modalTitle}>{attentionCopy[attentionKey].title}</h3>
              </div>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => setAttentionKey(null)}
              >
                Close
              </button>
            </div>
            {attentionKey === "low" ? (
              attention?.lowStock.length ? (
                <ul className={styles.pulseList}>
                  {attention.lowStock.map((part) => (
                    <li key={part.id}>
                      {part.name} · on hand {part.qty_on_hand} / reorder {part.reorder_point} ·{" "}
                      {centsToDisplay(part.value_cents)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{attentionCopy.low.empty}</p>
              )
            ) : null}
            {attentionKey === "excess" ? (
              attention?.excessCount ? (
                <p className={styles.empty} style={{ marginTop: 0 }}>
                  {attention.excessCount} parts flagged ·{" "}
                  {centsToDisplay(attention.excessValueCents)} on the shelf.
                </p>
              ) : (
                <p className={styles.empty}>{attentionCopy.excess.empty}</p>
              )
            ) : null}
            {attentionKey === "unallocated" ? (
              attention?.unallocatedReceives.length ? (
                <ul className={styles.pulseList}>
                  {attention.unallocatedReceives.map((row, idx) => (
                    <li key={`${row.part_id}-${idx}`}>
                      {row.name} · +{row.qty} · {new Date(row.created_at).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{attentionCopy.unallocated.empty}</p>
              )
            ) : null}
            {attentionKey === "missing" ? (
              attention?.missingMaterials.length ? (
                <ul className={styles.pulseList}>
                  {attention.missingMaterials.map((job) => (
                    <li key={job.id}>
                      {job.client_name} · {job.stage.replace(/_/g, " ")} ·{" "}
                      {centsToDisplay(job.contract_cents)}
                      {job.install_date ? ` · install ${job.install_date}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{attentionCopy.missing.empty}</p>
              )
            ) : null}
            {attentionKey === "unstaged" ? (
              (attention?.unstagedInstalls ?? []).length ? (
                <ul className={styles.pulseList}>
                  {(attention?.unstagedInstalls ?? []).map((job) => (
                    <li key={job.id}>
                      {job.client_name}
                      {job.install_date ? ` · ${job.install_date}` : ""} · {job.unstaged}{" "}
                      unstaged
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{attentionCopy.unstaged.empty}</p>
              )
            ) : null}
            {attentionKey === "slip" ? (
              (attention?.receivingShortJobs ?? []).length ? (
                <ul className={styles.pulseList}>
                  {(attention?.receivingShortJobs ?? []).map((job) => (
                    <li key={job.cust_ref}>
                      {job.job_name} · {job.open} lines not fully received
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{attentionCopy.slip.empty}</p>
              )
            ) : null}
            {attentionKey === "nojob" ? (
              (attention?.receivingUnassigned ?? []).length ? (
                <ul className={styles.pulseList}>
                  {(attention?.receivingUnassigned ?? []).map((row) => (
                    <li key={row.label}>
                      {row.label} · {row.lines} lines
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{attentionCopy.nojob.empty}</p>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </OpsShell>
  );
}
