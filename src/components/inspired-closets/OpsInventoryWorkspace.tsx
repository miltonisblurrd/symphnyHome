"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OpsShell from "@/components/inspired-closets/OpsShell";
import { partIsLowStock } from "@/lib/inspired-closets-ops-inventory";
import { stageLabel } from "@/lib/inspired-closets-ops-jobs";
import styles from "./ops-payroll.module.css";

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

type RtoJob = {
  id: string;
  ready_to_order?: boolean;
  summary_confirmed?: boolean;
  title?: string | null;
  stage: string;
  sold_date?: string | null;
  install_date?: string | null;
  notes?: string | null;
  client: { name: string } | null;
  designer?: { name: string } | null;
  receiving_open_qty?: number;
  receiving_received_qty?: number;
  receiving_total_qty?: number;
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

function formatJobDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OpsInventoryWorkspace() {
  const router = useRouter();
  const [parts, setParts] = useState<Part[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [summary, setSummary] = useState({
    totalParts: 0,
    lowStock: 0,
    excess: 0,
    valueCents: 0,
  });
  const [deskTab, setDeskTab] = useState<"all" | "low" | "rto">("all");
  const [partsFilter, setPartsFilter] = useState<"all" | "low">("all");
  const [listUpdatedAt, setListUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [rtoQuery, setRtoQuery] = useState("");
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
  const [rtoQueue, setRtoQueue] = useState<RtoJob[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (partsFilter === "low") params.set("filter", "low");

      const partsReq = fetch(`/api/inspired-closets/ops/inventory/parts?${params.toString()}`);
      const jobsReq = fetch("/api/inspired-closets/ops/jobs");

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

      const jobsRes = await jobsReq;
      const jobsPayload = (await jobsRes.json()) as ApiResponse;
      if (jobsPayload.ok) {
        const openJobs = (jobsPayload.jobs ?? []).filter(
          (job) => !["closed", "cancelled"].includes(job.stage),
        );
        setJobs(openJobs);
        setRtoQueue(
          (jobsPayload.jobs as RtoJob[] | undefined ?? []).filter(
            (job) => job.ready_to_order && !job.summary_confirmed,
          ),
        );
      }
      setLoading(false);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load inventory.",
      });
      setLoading(false);
    }
  }, [partsFilter]);

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

  const visibleRto = useMemo(() => {
    const q = rtoQuery.trim().toLowerCase();
    return [...rtoQueue]
      .filter((job) => {
        if (!q) return true;
        const hay = [
          job.client?.name,
          job.designer?.name,
          job.title,
          job.stage,
          job.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.client?.name ?? "zzz").localeCompare(b.client?.name ?? "zzz"));
  }, [rtoQueue, rtoQuery]);

  const rtoFacts = useMemo(() => {
    const withInstall = rtoQueue.filter((job) => Boolean(job.install_date)).length;
    const truckShort = rtoQueue.filter((job) => (job.receiving_open_qty ?? 0) > 0).length;
    return { withInstall, truckShort };
  }, [rtoQueue]);

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
    if (!detailOpen && !setupOpen && !moveModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDetailOpen(false);
      setSetupOpen(false);
      setMoveModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen, setupOpen, moveModalOpen]);

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

      <div className={styles.listToolbar}>
        <nav className={styles.tabs} aria-label="Inventory views">
          {(
            [
              ["all", "All parts", null],
              ["low", "Low stock", summary.lowStock || null],
              ["rto", "Ready to order", rtoQueue.length || null],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={`${styles.tab} ${deskTab === id ? styles.tabActive : ""}`}
              onClick={() => {
                setDeskTab(id);
                if (id === "all" || id === "low") setPartsFilter(id);
              }}
            >
              {label}
              {count ? <span className={styles.tabCount}>{count}</span> : null}
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
          {deskTab === "all" || deskTab === "low" ? (
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={() => setSetupOpen(true)}
            >
              Add parts / upload count
            </button>
          ) : null}
        </div>
      </div>

      {deskTab === "rto" ? (
        <section className={styles.panel}>
          <div className={styles.summaryRow}>
            <span>
              <span className={styles.summaryStrong}>{rtoQueue.length}</span> ready to order
            </span>
            {rtoFacts.withInstall > 0 ? (
              <span>
                <span className={styles.summaryStrong}>{rtoFacts.withInstall}</span> with install
              </span>
            ) : null}
            {rtoFacts.truckShort > 0 ? (
              <span>
                <span className={styles.summaryStrong}>{rtoFacts.truckShort}</span> short on truck
              </span>
            ) : null}
          </div>

          <label className={styles.field} style={{ marginBottom: "0.65rem", maxWidth: "28rem" }}>
            <span className={styles.fieldLabel}>Find a job</span>
            <input
              className={styles.input}
              value={rtoQuery}
              onChange={(event) => setRtoQuery(event.target.value)}
              placeholder="Client, designer, notes…"
            />
          </label>

          {loading && rtoQueue.length === 0 ? (
            <p className={styles.empty}>Loading jobs…</p>
          ) : visibleRto.length === 0 ? (
            <p className={styles.empty}>
              {rtoQuery.trim()
                ? "No jobs match that search."
                : "No jobs marked ready to order."}
            </p>
          ) : (
            <table className={styles.table} style={{ minWidth: "56rem" }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Designer</th>
                  <th>Stage</th>
                  <th>Truck</th>
                  <th>Sold</th>
                  <th>Install</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleRto.map((job) => (
                  <tr
                    key={job.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/inspired-closets/ops/projects?id=${job.id}`)}
                  >
                    <td>
                      <strong>{job.client?.name ?? "Job"}</strong>
                      {job.title ? (
                        <span className={styles.jobTitleMark}> · {job.title}</span>
                      ) : null}
                    </td>
                    <td>{job.designer?.name ?? "—"}</td>
                    <td>{stageLabel(job.stage)}</td>
                    <td>
                      {(job.receiving_total_qty ?? 0) > 0 ? (
                        <span
                          title={
                            (job.receiving_open_qty ?? 0) > 0
                              ? "Still short on the packing slip"
                              : "All slip pieces received"
                          }
                        >
                          {job.receiving_received_qty}/{job.receiving_total_qty}
                          {(job.receiving_open_qty ?? 0) > 0 ? " short" : " in"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatJobDate(job.sold_date)}</td>
                    <td>{formatJobDate(job.install_date)}</td>
                    <td className={styles.notesCell} title={job.notes ?? undefined}>
                      {job.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {deskTab === "all" || deskTab === "low" ? (
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
          {summary.valueCents > 0 ? (
            <span>
              On-hand value{" "}
              <span className={styles.summaryStrong}>{centsToDisplay(summary.valueCents)}</span>
            </span>
          ) : null}
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
                const low = partIsLowStock(part);
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
      ) : null}

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
    </OpsShell>
  );
}
