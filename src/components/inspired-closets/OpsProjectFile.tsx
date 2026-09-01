"use client";

import {
  APPOINTMENT_KINDS,
  APPOINTMENT_LOCATIONS,
} from "@/lib/inspired-closets-ops-appointments";
import Link from "next/link";
import { PAYMENT_MILESTONES } from "@/lib/inspired-closets-ops-billing";
import { JOB_KINDS } from "@/lib/inspired-closets-ops-jobs";
import { sourceLabel as leadSourceLabel, stageLabel as leadStageLabel } from "@/lib/inspired-closets-ops-leads";
import styles from "./ops-payroll.module.css";

type Staff = { id: string; name: string; role: string; active: boolean };
type Stage = { id: string; label: string };
type Client = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export type ProjectJob = {
  id: string;
  client_id: string | null;
  lead_id?: string | null;
  designer_id: string | null;
  installer_id?: string | null;
  stage: string;
  contract_cents: number;
  deposit_cents: number;
  collected_cents: number;
  sold_date: string | null;
  install_date: string | null;
  completed_date?: string | null;
  notes: string | null;
  community_ref?: string | null;
  studio_ref?: string | null;
  receive_date?: string | null;
  visit_window?: string | null;
  job_kind?: string | null;
  tentative_install_notes?: string | null;
  proposal_url?: string | null;
  proposal_filename?: string | null;
  client: Client | null;
  designer: Staff | null;
  installer?: Staff | null;
  jobCheckOwner?: Staff | null;
  receiving_open_qty?: number;
  receiving_received_qty?: number;
  receiving_total_qty?: number;
};

export type ProjectLead = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  stage?: string | null;
  community_ref?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  address_raw?: string | null;
  project_area?: string | null;
  notes?: string | null;
};

export type ProjectAppointment = {
  id: string;
  kind: string;
  scheduled_at: string;
  location_type?: string | null;
  status: string;
  designer?: Staff | null;
  installer?: Staff | null;
};

export type ProjectPayment = {
  id: string;
  milestone: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  status: string;
  paid_at?: string | null;
};

export type ProjectFile = {
  job: ProjectJob;
  lead: ProjectLead | null;
  appointments: ProjectAppointment[];
  payments: ProjectPayment[];
};

type MaterialLine = {
  id: string;
  qty: number;
  status: string;
  ext_cents?: number;
  part: { sku: string; name: string; size?: string | null } | null;
};

type MaterialMove = {
  id: string;
  movement_type: string;
  qty: number;
  unit_cost_cents: number | null;
  created_at: string;
  part: { sku: string; name: string } | null;
};

function cents(value: number): string {
  if (!value) return "—";
  return (value / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: value.length === 10 ? undefined : "numeric",
    minute: value.length === 10 ? undefined : "2-digit",
  });
}

function leadName(lead: ProjectLead | null, fallback: string): string {
  if (!lead) return fallback;
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function leadAddress(lead: ProjectLead | null, client: Client | null): string {
  if (lead?.address_raw) return lead.address_raw;
  const fromParts = [lead?.street, lead?.city, lead?.state, lead?.zip].filter(Boolean).join(", ");
  return fromParts || client?.address || "—";
}

function kindLabel(id: string): string {
  return APPOINTMENT_KINDS.find((item) => item.id === id)?.label ?? id;
}

function locationLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return APPOINTMENT_LOCATIONS.find((item) => item.id === id)?.label ?? id;
}

function paymentLabel(id: string): string {
  return PAYMENT_MILESTONES.find((item) => item.id === id)?.label ?? id;
}

function jobKindLabel(id: string | null | undefined): string {
  if (!id) return "New job";
  return JOB_KINDS.find((item) => item.id === id)?.label ?? id;
}

export default function OpsProjectFile({
  job,
  file,
  loading,
  stages,
  installers,
  designers,
  jobLines,
  jobMaterials,
  materialsTotal,
  busy,
  onClose,
  onStage,
  onInstallDate,
  onInstaller,
  onDesigner,
  onNotes,
  onUploadProposal,
  onStagePart,
  onDamagePart,
}: {
  job: ProjectJob;
  file: ProjectFile | null;
  loading: boolean;
  stages: Stage[];
  installers: Staff[];
  designers: Staff[];
  jobLines: MaterialLine[];
  jobMaterials: MaterialMove[];
  materialsTotal: number;
  busy: boolean;
  onClose: () => void;
  onStage: (stage: string) => void;
  onInstallDate: (value: string) => void;
  onInstaller: (id: string | null) => void;
  onDesigner: (id: string | null) => void;
  onNotes: (value: string) => void;
  onUploadProposal: (file: File) => void;
  onStagePart: (lineId: string) => void;
  onDamagePart: (lineId: string) => void;
}) {
  const lead = file?.lead ?? null;
  const client = file?.job.client ?? job.client;
  const name = client?.name ?? leadName(lead, "Project");

  return (
    <div className={styles.projectFile} id="project-file">
      <div className={styles.projectFileHead}>
        <div>
          <h2 className={styles.leadName}>{name}</h2>
          <p className={styles.leadContact}>
            {[job.community_ref ? `Community ${job.community_ref}` : null, job.studio_ref ? `Studio ${job.studio_ref}` : null]
              .filter(Boolean)
              .join(" · ") || "Project file"}
          </p>
        </div>
        <div className={styles.formActions} style={{ margin: 0 }}>
          <a className={styles.buttonGhost} href="/inspired-closets/ops/billing">
            Open Payments
          </a>
          <a className={styles.buttonGhost} href="/inspired-closets/ops/appointments?tab=installs">
            Open Calendar
          </a>
          <button type="button" className={styles.buttonGhost} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {loading && !file ? <p className={styles.empty}>Loading project…</p> : null}

      {(job.receiving_total_qty ?? 0) > 0 ? (
        <p
          className={`${styles.notice} ${(job.receiving_open_qty ?? 0) > 0 ? styles.noticeError : ""}`}
          style={{ marginTop: 0 }}
        >
          {(job.receiving_open_qty ?? 0) > 0
            ? `Not install-ready — ${job.receiving_received_qty ?? 0}/${job.receiving_total_qty} pieces received. Finish Receiving before calling this job ready.`
            : `Truck is in — ${job.receiving_received_qty}/${job.receiving_total_qty} pieces received.`}
          {" "}
          <Link href="/inspired-closets/ops/inventory/receiving">Open Receiving</Link>
        </p>
      ) : null}

      <div className={styles.detailSection} style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <p className={styles.detailSectionTitle}>Project</p>
        <div className={styles.detailGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Client</span>
            <input className={styles.input} value={name} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Stage</span>
            <select
              className={styles.input}
              value={job.stage}
              disabled={busy}
              onChange={(e) => onStage(e.target.value)}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Designer</span>
            <select
              className={styles.input}
              value={job.designer_id ?? ""}
              disabled={busy}
              onChange={(e) => onDesigner(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {designers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Installer</span>
            <select
              className={styles.input}
              value={job.installer_id ?? file?.job.installer_id ?? ""}
              disabled={busy}
              onChange={(e) => onInstaller(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {installers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sold date</span>
            <input className={styles.input} value={job.sold_date ?? "—"} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Type</span>
            <input className={styles.input} value={jobKindLabel(job.job_kind ?? file?.job.job_kind)} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Contract</span>
            <input className={styles.input} value={cents(job.contract_cents)} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Deposit</span>
            <input className={styles.input} value={cents(job.deposit_cents)} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Collected</span>
            <input className={styles.input} value={cents(job.collected_cents)} readOnly />
          </label>
          <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              className={styles.input}
              rows={3}
              defaultValue={job.notes ?? ""}
              key={`${job.id}-${job.notes ?? ""}`}
              onBlur={(e) => {
                if (e.target.value !== (job.notes ?? "")) onNotes(e.target.value);
              }}
            />
          </label>
        </div>
      </div>

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Lead</p>
        {lead ? (
          <div className={styles.detailGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input className={styles.input} value={leadName(lead, name)} readOnly />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <input className={styles.input} value={lead.stage ? leadStageLabel(lead.stage) : "—"} readOnly />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Source</span>
              <input className={styles.input} value={lead.source ? leadSourceLabel(lead.source) : "—"} readOnly />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Community ref</span>
              <input className={styles.input} value={lead.community_ref || job.community_ref || "—"} readOnly />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <input className={styles.input} value={client?.phone || "—"} readOnly />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input className={styles.input} value={client?.email || "—"} readOnly />
            </label>
            <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.fieldLabel}>Address</span>
              <input className={styles.input} value={leadAddress(lead, client)} readOnly />
            </label>
            {lead.project_area ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Project area</span>
                <input className={styles.input} value={lead.project_area} readOnly />
              </label>
            ) : null}
            <div className={styles.formActions} style={{ gridColumn: "1 / -1", margin: 0 }}>
              <a className={styles.buttonGhost} href="/inspired-closets/ops/leads">
                Open in Leads
              </a>
            </div>
          </div>
        ) : (
          <p className={styles.empty}>No lead linked to this project yet.</p>
        )}
      </div>

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Schedule</p>
        <div className={styles.detailGrid} style={{ marginBottom: "0.85rem" }}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Install date</span>
            <input
              className={styles.input}
              type="date"
              value={job.install_date ?? ""}
              disabled={busy}
              onChange={(e) => onInstallDate(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Window</span>
            <input className={styles.input} value={job.visit_window || file?.job.visit_window || "—"} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Receive date</span>
            <input className={styles.input} value={file?.job.receive_date || job.receive_date || "—"} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Job check owner</span>
            <input className={styles.input} value={file?.job.jobCheckOwner?.name || "—"} readOnly />
          </label>
        </div>
        {(file?.appointments ?? []).length === 0 ? (
          <p className={styles.empty}>No calendar events on this project yet.</p>
        ) : (
          <table className={styles.table} style={{ minWidth: "36rem" }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Location</th>
                <th>Designer</th>
                <th>Installer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(file?.appointments ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{stamp(row.scheduled_at)}</td>
                  <td>{kindLabel(row.kind)}</td>
                  <td>{locationLabel(row.location_type)}</td>
                  <td>{row.designer?.name ?? "—"}</td>
                  <td>{row.installer?.name ?? "—"}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Payments</p>
        {(file?.payments ?? []).length === 0 ? (
          <p className={styles.empty}>
            No 50 / 40 / 10 ledger rows yet. Open Payments to record the deposit.
          </p>
        ) : (
          <table className={styles.table} style={{ minWidth: "32rem" }}>
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Due</th>
                <th>Paid</th>
                <th>Status</th>
                <th>Paid at</th>
              </tr>
            </thead>
            <tbody>
              {(file?.payments ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{paymentLabel(row.milestone)}</td>
                  <td>{cents(row.amount_due_cents)}</td>
                  <td>{cents(row.amount_paid_cents)}</td>
                  <td>{row.status}</td>
                  <td>{stamp(row.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Proposal & inventory</p>
        <p className={styles.fieldLabel}>
          Signed proposal
          {job.proposal_filename ? ` · ${job.proposal_filename}` : ""}
        </p>
        <div className={styles.formActions} style={{ justifyContent: "flex-start", marginBottom: "0.85rem" }}>
          {job.proposal_url ? (
            <a className={styles.buttonGhost} href={job.proposal_url} target="_blank" rel="noreferrer">
              Open PDF
            </a>
          ) : null}
          <label className={styles.buttonGhost} style={{ cursor: "pointer" }}>
            {job.proposal_url ? "Replace PDF" : "Upload signed PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (next) onUploadProposal(next);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className={styles.fieldLabel}>
          Materials on this project ·{" "}
          <span className={styles.summaryStrong}>{cents(materialsTotal)}</span>
          <a href="/inspired-closets/ops/inventory" style={{ marginLeft: "0.75rem", fontSize: "0.8rem" }}>
            Open Inventory
          </a>
        </p>
        {jobLines.length > 0 ? (
          <table className={styles.table} style={{ minWidth: "32rem", marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th>Part</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Ext</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobLines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.part
                      ? `${line.part.sku}${line.part.size ? ` · ${line.part.size}` : ""} · ${line.part.name}`
                      : "—"}
                  </td>
                  <td>{line.qty}</td>
                  <td>{line.status}</td>
                  <td>{cents(line.ext_cents ?? 0)}</td>
                  <td>
                    {line.status === "reserved" ? (
                      <>
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          onClick={() => onStagePart(line.id)}
                        >
                          Staged
                        </button>{" "}
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          onClick={() => onDamagePart(line.id)}
                        >
                          Damaged
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.empty}>
            No reserved parts yet — Frank should job-check this project so stock vs. order is locked.
          </p>
        )}
        {jobMaterials.length > 0 ? (
          <table className={styles.table} style={{ minWidth: "32rem" }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Part</th>
                <th>Qty</th>
                <th>Ext</th>
              </tr>
            </thead>
            <tbody>
              {jobMaterials.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleDateString()}</td>
                  <td>{m.movement_type}</td>
                  <td>{m.part ? `${m.part.sku} · ${m.part.name}` : "—"}</td>
                  <td>{m.qty}</td>
                  <td>{cents(Math.abs(m.qty) * (m.unit_cost_cents ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
