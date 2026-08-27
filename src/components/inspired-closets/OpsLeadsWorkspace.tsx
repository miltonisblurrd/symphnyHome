"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpsShell from "@/components/inspired-closets/OpsShell";
import AddressAutocomplete from "@/components/inspired-closets/AddressAutocomplete";
import {
  AREAS_OF_HOME,
  FORM_TYPES,
  INFLUENCER_TYPES,
  JUNK_REASONS,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TYPES,
  NURTURING_REASONS,
  defaultEventSubject,
  formatLeadAddress,
  joinPersonName,
  sourceLabel,
  sourceNeedsReferralName,
  splitPersonName,
  stageLabel,
} from "@/lib/inspired-closets-ops-leads";
import {
  matchPartnerAccount,
  partnerTypeLabel,
  type IcAccount,
} from "@/lib/inspired-closets-ops-accounts";
import type { AddressParts } from "@/lib/inspired-closets-google-places";
import { CONSULT_OUTCOMES, type IcConsultOutcome } from "@/lib/inspired-closets-ops-appointments";
import styles from "./ops-payroll.module.css";

type Staff = { id: string; name: string; role: string; active: boolean };
type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type Lead = {
  id: string;
  client_id: string | null;
  account_id: string | null;
  source: string;
  stage: string;
  owner_id: string | null;
  designer_id: string | null;
  contact_attempts: number;
  notes: string | null;
  lead_type: string | null;
  influencer_type: string | null;
  form_type: string | null;
  first_name: string | null;
  last_name: string | null;
  referral_name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  community_name: string | null;
  showroom_visit: boolean;
  show_room: string | null;
  areas_of_home: string[] | null;
  nurturing_reason: string | null;
  junk_reason: string | null;
  needs_follow_up_date: string | null;
  contact_preference: string | null;
  converted_job_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  followUpNeeded?: boolean;
  client: Client | null;
  account: IcAccount | null;
  owner: Staff | null;
  designer: Staff | null;
  appointment?: {
    id: string;
    scheduled_at: string;
    kind: string;
    status: string;
  } | null;
};

type Activity = {
  id: string;
  action: string;
  actor_label: string | null;
  actor_id: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
};

type ChatterPost = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  leads?: Lead[];
  lead?: Lead;
  staff?: Staff[];
  accounts?: IcAccount[];
  activity?: Activity[];
  chatter?: ChatterPost[];
  appointments?: Array<{
    id: string;
    scheduled_at: string;
    kind: string;
    status: string;
    location_type: string;
  }>;
};

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  street: "",
  city: "",
  state: "NV",
  zip: "",
  source: "call",
  referral_name: "",
  designer_id: "",
  lead_type: "consumer",
  influencer_type: "",
  form_type: "",
  community_name: "",
  showroom_visit: false,
  notes: "",
  areas_of_home: [] as string[],
  account_id: "",
};

function formatStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Community-style list dates: 8/7/2026 5:14 PM */
function formatListDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelative(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function lastNameFromLead(lead: Partial<Lead> | null | undefined): string {
  if (lead?.last_name?.trim()) return lead.last_name.trim();
  return splitPersonName(lead?.client?.name).last;
}

export default function OpsLeadsWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [accounts, setAccounts] = useState<IcAccount[]>([]);
  const [listView, setListView] = useState<"unscheduled" | "scheduled" | "needs" | "all">(
    "unscheduled",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [chatter, setChatter] = useState<ChatterPost[]>([]);
  const [appointments, setAppointments] = useState<ApiResponse["appointments"]>([]);
  const [detailTab, setDetailTab] = useState<"details" | "activity" | "chatter">("details");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [chatterDraft, setChatterDraft] = useState("");
  const [eventOpen, setEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    kind: "consultation",
    subject: "",
    scheduled_at: "",
    location_type: "on_site",
    location_text: "",
    designer_id: "",
    installer_id: "",
    notes: "",
    log_confirmation: true,
  });
  const [soldOpen, setSoldOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({
    account_mode: "new_customer" as "new_customer" | "existing",
    account_id: "",
    designer_id: "",
    partner_name: "",
    partner_type: "realtor",
  });
  const [partnerDraft, setPartnerDraft] = useState({
    name: "",
    partner_type: "realtor",
    phone: "",
    email: "",
  });
  const [soldForm, setSoldForm] = useState({
    contract: "",
    sold_date: new Date().toISOString().slice(0, 10),
    deposit_intake_status: "pending",
    community_ref: "",
    studio_ref: "",
    job_check_owner_id: "",
    tentative_install_notes: "",
    site_ready_notes: "",
  });
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Partial<Lead> | null>(null);

  const designers = useMemo(
    () => staff.filter((s) => s.role === "designer" || s.role === "front_office" || s.role === "owner"),
    [staff],
  );
  const installers = useMemo(
    () => staff.filter((s) => s.role === "installer"),
    [staff],
  );
  const partnerAccounts = useMemo(
    () => accounts.filter((a) => a.kind === "partner"),
    [accounts],
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: listView });
      const response = await fetch(`/api/inspired-closets/ops/leads?${params}`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load leads.");
      setLeads(payload.leads ?? []);
      setStaff(payload.staff ?? []);
      setAccounts(payload.accounts ?? []);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load leads.",
      });
    } finally {
      setLoading(false);
    }
  }, [listView]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/inspired-closets/ops/leads?id=${id}&chatter=1`);
      const payload = (await response.json()) as ApiResponse;
      if (!payload.ok || !payload.lead) throw new Error(payload.error ?? "Lead not found.");
      setDetail(payload.lead);
      setDraft(payload.lead);
      setActivity(payload.activity ?? []);
      setChatter(payload.chatter ?? []);
      setAppointments(payload.appointments ?? []);
      setStaff(payload.staff ?? []);
      if (payload.accounts) setAccounts(payload.accounts);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to open lead.",
      });
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetail(null);
      setDraft(null);
    }
  }, [selectedId, loadDetail]);

  async function completeConsult(appointmentId: string, outcome: IcConsultOutcome) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: appointmentId,
          action: "complete_consult",
          outcome,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to log consult.");
      setNotice({ kind: "info", text: "Consult logged. Des was pinged on Slack." });
      if (selectedId) await loadDetail(selectedId);
      await loadList();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to log consult.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function createLead(override?: Partial<typeof EMPTY_FORM>) {
    setBusy(true);
    setNotice(null);
    const payload = { ...form, ...override };
    const clientName = joinPersonName(payload.first_name, payload.last_name);
    if (!clientName) {
      setBusy(false);
      setNotice({ kind: "error", text: "First and last name are required." });
      return;
    }
    if (sourceNeedsReferralName(payload.source) && !payload.referral_name.trim()) {
      setBusy(false);
      setNotice({ kind: "error", text: "Referral name is required for this lead source." });
      return;
    }
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          client_name: clientName,
          first_name: payload.first_name.trim(),
          last_name: payload.last_name.trim(),
          referral_name: payload.referral_name.trim() || null,
          designer_id: payload.designer_id || null,
          influencer_type: payload.lead_type === "influencer" ? payload.influencer_type || null : null,
          form_type: payload.form_type || null,
          account_id: payload.account_id || null,
        }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!data.ok) throw new Error(data.error ?? "Failed to create lead.");
      setForm({ ...EMPTY_FORM });
      setNotice({ kind: "info", text: "Lead created." });
      await loadList();
      if (data.lead?.id) setSelectedId(data.lead.id);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create lead.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function patchLead(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ApiResponse;
      if (!data.ok) throw new Error(data.error ?? "Update failed.");
      setNotice({ kind: "info", text: "Saved." });
      await loadList();
      if (selectedId) await loadDetail(selectedId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Update failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveDetail() {
    if (!draft || !selectedId) return;
    await patchLead({
      id: selectedId,
      stage: draft.stage,
      source: draft.source,
      designer_id: draft.designer_id,
      lead_type: draft.lead_type,
      influencer_type: draft.influencer_type,
      form_type: draft.form_type,
      first_name: draft.first_name,
      last_name: draft.last_name,
      referral_name: draft.referral_name,
      street: draft.street,
      city: draft.city,
      state: draft.state,
      zip: draft.zip,
      country: draft.country,
      community_name: draft.community_name,
      showroom_visit: draft.showroom_visit,
      show_room: draft.show_room,
      areas_of_home: draft.areas_of_home ?? [],
      notes: draft.notes,
      nurturing_reason: draft.nurturing_reason,
      junk_reason: draft.junk_reason,
      needs_follow_up_date: draft.needs_follow_up_date,
      contact_preference: draft.contact_preference,
      account_id: draft.account_id || null,
      phone: draft.client?.phone ?? null,
      email: draft.client?.email ?? null,
      client_name:
        joinPersonName(draft.first_name ?? "", draft.last_name ?? "") || draft.client?.name,
    });
  }

  async function postChatter() {
    if (!selectedId || !chatterDraft.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chatter",
          lead_id: selectedId,
          body: chatterDraft.trim(),
        }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!data.ok) throw new Error(data.error ?? "Could not post.");
      setChatterDraft("");
      await loadDetail(selectedId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not post.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function createEvent() {
    if (!selectedId || !eventForm.scheduled_at) return;
    setBusy(true);
    try {
      const when = new Date(eventForm.scheduled_at);
      if (Number.isNaN(when.getTime())) throw new Error("Pick a valid date and time.");
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId,
          action: "schedule_event",
          kind: eventForm.kind,
          subject: eventForm.subject.trim() || null,
          scheduled_at: when.toISOString(),
          location_type: eventForm.location_type,
          location_text: eventForm.location_text.trim() || null,
          log_confirmation: eventForm.kind === "consultation" && eventForm.log_confirmation,
          designer_id:
            eventForm.kind === "install"
              ? draft?.designer_id || null
              : eventForm.designer_id || draft?.designer_id || null,
          installer_id:
            eventForm.kind === "install" ? eventForm.installer_id || null : null,
          notes: eventForm.notes || null,
        }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!data.ok) throw new Error(data.error ?? "Could not create event.");
      setEventOpen(false);
      setEventForm({
        kind: "consultation",
        subject: "",
        scheduled_at: "",
        location_type: "on_site",
        location_text: "",
        designer_id: "",
        installer_id: "",
        notes: "",
        log_confirmation: true,
      });
      setNotice({
        kind: "info",
        text:
          eventForm.kind === "install"
            ? "Install event saved — installer assigned on the job."
            : eventForm.log_confirmation
              ? "Design Event saved — lead is Scheduled. Confirmation logged (Community sends the email; assigned designer is the CC)."
              : "Design Event saved — lead moved to Scheduled.",
      });
      await loadList();
      await loadDetail(selectedId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not create event.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitSoldIntake() {
    if (!selectedId) return;
    const contractCents = Math.round(
      Number(String(soldForm.contract).replace(/[$,\s]/g, "")) * 100,
    );
    if (!Number.isFinite(contractCents) || contractCents <= 0) {
      setNotice({ kind: "error", text: "Enter the contract amount from the sold quote." });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId,
          action: "sell",
          contract_cents: contractCents,
          sold_date: soldForm.sold_date || undefined,
          deposit_intake_status: soldForm.deposit_intake_status,
          community_ref: soldForm.community_ref || null,
          studio_ref: soldForm.studio_ref || null,
          job_check_owner_id: soldForm.job_check_owner_id || null,
          tentative_install_notes: soldForm.tentative_install_notes || null,
          site_ready_notes: soldForm.site_ready_notes || null,
          designer_id: draft?.designer_id || null,
        }),
      });
      const data = (await response.json()) as ApiResponse & { job?: { id: string } };
      if (!data.ok) throw new Error(data.error ?? "Could not save sold intake.");
      const jobId = data.job?.id ?? detail?.converted_job_id ?? null;
      if (proposalFile && jobId) {
        const upload = new FormData();
        upload.set("job_id", jobId);
        upload.set("file", proposalFile);
        const uploaded = await fetch("/api/inspired-closets/ops/jobs/proposal", {
          method: "POST",
          body: upload,
        });
        const uploadedPayload = (await uploaded.json()) as { ok?: boolean; error?: string };
        if (!uploadedPayload.ok) {
          throw new Error(uploadedPayload.error ?? "Sold saved, but proposal upload failed.");
        }
      }
      setSoldOpen(false);
      setProposalFile(null);
      setNotice({
        kind: "info",
        text:
          soldForm.deposit_intake_status === "paid"
            ? "Sold intake saved — Des and Frank got Slack. Deposit is in, so Frank can job-check now."
            : "Sold intake saved — Des and Frank got Slack. Mark the 50% paid in Billing and Frank gets another ping to order.",
      });
      await loadList();
      await loadDetail(selectedId);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save sold intake.",
      });
    } finally {
      setBusy(false);
    }
  }

  function openSoldIntake() {
    setSoldForm({
      contract: "",
      sold_date: new Date().toISOString().slice(0, 10),
      deposit_intake_status: "pending",
      community_ref: detail?.community_name ?? "",
      studio_ref: "",
      job_check_owner_id: "",
      tentative_install_notes: "",
      site_ready_notes: "",
    });
    setProposalFile(null);
    setSoldOpen(true);
  }

  function toggleArea(area: string) {
    if (!draft) return;
    const current = draft.areas_of_home ?? [];
    const next = current.includes(area)
      ? current.filter((a) => a !== area)
      : [...current, area];
    setDraft({ ...draft, areas_of_home: next });
  }

  function toggleFormArea(area: string) {
    setForm((current) => ({
      ...current,
      areas_of_home: current.areas_of_home.includes(area)
        ? current.areas_of_home.filter((item) => item !== area)
        : [...current.areas_of_home, area],
    }));
  }

  function openNewEvent() {
    const last = lastNameFromLead(draft ?? detail);
    const address = formatLeadAddress(draft ?? detail ?? {});
    setEventForm({
      kind: "consultation",
      subject: defaultEventSubject("consultation", last),
      scheduled_at: "",
      location_type: "on_site",
      location_text: address,
      designer_id: draft?.designer_id ?? detail?.designer_id ?? "",
      installer_id: "",
      notes: "",
      log_confirmation: true,
    });
    setEventOpen(true);
  }

  function applyFormAddress(parts: AddressParts) {
    setForm((current) => ({
      ...current,
      street: parts.street || current.street,
      city: parts.city || current.city,
      state: parts.state || current.state,
      zip: parts.zip || current.zip,
    }));
  }

  function applyDraftAddress(parts: AddressParts) {
    setDraft((current) =>
      current
        ? {
            ...current,
            street: parts.street || current.street,
            city: parts.city || current.city,
            state: parts.state || current.state,
            zip: parts.zip || current.zip,
            country: parts.country || current.country,
          }
        : current,
    );
  }

  function openConvert() {
    if (!detail) return;
    const attachedPartner = partnerAccounts.some((a) => a.id === detail.account_id);
    setConvertForm({
      account_mode: attachedPartner ? "existing" : "new_customer",
      account_id: attachedPartner ? (detail.account_id ?? "") : "",
      designer_id: detail.designer_id ?? "",
      partner_name: detail.referral_name ?? "",
      partner_type: "realtor",
    });
    setConvertOpen(true);
  }

  async function addPartnerAccount(input: {
    name: string;
    partner_type: string;
    phone?: string;
    email?: string;
  }): Promise<IcAccount | null> {
    const name = input.name.trim();
    if (!name) {
      setNotice({ kind: "error", text: "Partner name is required." });
      return null;
    }
    const response = await fetch("/api/inspired-closets/ops/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind: "partner",
        partner_type: input.partner_type || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
      }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      account?: IcAccount;
    };
    if (!payload.ok || !payload.account) {
      throw new Error(payload.error ?? "Could not save partner account.");
    }
    setAccounts((current) =>
      current.some((a) => a.id === payload.account!.id)
        ? current
        : [...current, payload.account!].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return payload.account;
  }

  async function createPartnerFromPanel() {
    setBusy(true);
    setNotice(null);
    try {
      const account = await addPartnerAccount(partnerDraft);
      if (!account) {
        setBusy(false);
        return;
      }
      setPartnerDraft({ name: "", partner_type: "realtor", phone: "", email: "" });
      setNotice({ kind: "info", text: `Partner account saved: ${account.name}` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save partner.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function convertToStudio() {
    if (!detail) return;
    setBusy(true);
    setNotice(null);
    try {
      let accountId = convertForm.account_id;
      if (convertForm.account_mode === "existing" && !accountId && convertForm.partner_name.trim()) {
        const created = await addPartnerAccount({
          name: convertForm.partner_name,
          partner_type: convertForm.partner_type,
        });
        accountId = created?.id ?? "";
      }
      const response = await fetch("/api/inspired-closets/ops/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detail.id,
          action: "move_to_studio",
          account_mode: convertForm.account_mode,
          account_id: convertForm.account_mode === "existing" ? accountId || null : undefined,
          designer_id: convertForm.designer_id || null,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not convert.");
      setConvertOpen(false);
      setNotice({ kind: "info", text: "Moved to Studio. Contact stays this person." });
      await loadList();
      await loadDetail(detail.id);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not convert.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (selectedId && detail && draft) {
    return (
      <OpsShell
        title={detail.client?.name ?? "Lead"}
        subtitle="Lead detail · Details · Activity · Chatter"
        actions={
          <>
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={() => setSelectedId(null)}
            >
              ← Back to list
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={busy}
              onClick={() => void saveDetail()}
            >
              Save
            </button>
          </>
        }
      >
        {notice ? (
          <p className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
            {notice.text}
          </p>
        ) : null}

        <div className={styles.leadHeader}>
          <div>
            <h2 className={styles.leadName}>{detail.client?.name}</h2>
            <p className={styles.leadContact}>
              {detail.client?.phone ?? "No phone"}
              {detail.client?.email ? ` · ${detail.client.email}` : ""}
              {detail.zip || detail.street
                ? ` · ${[detail.street, detail.city, detail.state, detail.zip].filter(Boolean).join(", ")}`
                : ""}
              {detail.account?.name
                ? ` · Account: ${detail.account.name}${
                    detail.account.kind === "partner"
                      ? ` (${partnerTypeLabel(detail.account.partner_type) || "Partner"})`
                      : ""
                  }`
                : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.buttonGhost}
              disabled={busy}
              onClick={() => openNewEvent()}
            >
              + New Event
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={busy}
              onClick={openSoldIntake}
            >
              {detail.converted_job_id ? "Update sold intake" : "Sold intake"}
            </button>
            {detail.stage !== "moved_to_studio" ? (
              <button
                type="button"
                className={styles.buttonGhost}
                disabled={busy}
                onClick={openConvert}
              >
                Move to Studio
              </button>
            ) : (
              <span className={`${styles.statusBadge} ${styles.statusPaid}`}>Moved to Studio</span>
            )}
          </div>
        </div>

        <div className={styles.leadTabs}>
          {(["details", "activity", "chatter"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.leadTab} ${detailTab === tab ? styles.leadTabActive : ""}`}
              onClick={() => setDetailTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={styles.leadLayout}>
          <div className={styles.panel}>
            {detailTab === "details" ? (
              <>
                <div className={styles.detailGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Lead Status</span>
                    <select
                      className={styles.input}
                      value={draft.stage ?? "new"}
                      onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
                    >
                      {LEAD_STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Lead Source</span>
                    <select
                      className={styles.input}
                      value={draft.source ?? "instagram"}
                      onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                    >
                      {LEAD_SOURCES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {sourceNeedsReferralName(draft.source ?? "") ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Referral name *</span>
                      <input
                        className={styles.input}
                        value={draft.referral_name ?? ""}
                        onChange={(e) => setDraft({ ...draft, referral_name: e.target.value })}
                        placeholder="Who referred them"
                      />
                    </label>
                  ) : null}

                  {draft.stage === "nurturing" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Lead Nurturing Reason *</span>
                      <select
                        className={styles.input}
                        value={draft.nurturing_reason ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, nurturing_reason: e.target.value })
                        }
                      >
                        <option value="">— Select —</option>
                        {NURTURING_REASONS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {draft.stage === "junk" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Junk Reason *</span>
                      <select
                        className={styles.input}
                        value={draft.junk_reason ?? ""}
                        onChange={(e) => setDraft({ ...draft, junk_reason: e.target.value })}
                      >
                        <option value="">— Select —</option>
                        {JUNK_REASONS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Lead Type</span>
                    <select
                      className={styles.input}
                      value={draft.lead_type ?? "consumer"}
                      onChange={(e) => setDraft({ ...draft, lead_type: e.target.value })}
                    >
                      {LEAD_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {draft.lead_type === "influencer" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Influencer Type</span>
                      <select
                        className={styles.input}
                        value={draft.influencer_type ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, influencer_type: e.target.value })
                        }
                      >
                        <option value="">— None —</option>
                        {INFLUENCER_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Form Type</span>
                    <select
                      className={styles.input}
                      value={draft.form_type ?? ""}
                      onChange={(e) => setDraft({ ...draft, form_type: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {FORM_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Designer</span>
                    <select
                      className={styles.input}
                      value={draft.designer_id ?? ""}
                      onChange={(e) => setDraft({ ...draft, designer_id: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {designers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Partner account</span>
                    <select
                      className={styles.input}
                      value={draft.account_id ?? ""}
                      onChange={(e) => setDraft({ ...draft, account_id: e.target.value || null })}
                    >
                      <option value="">None — customer file at convert</option>
                      {partnerAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                          {account.partner_type ? ` · ${partnerTypeLabel(account.partner_type)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>First name</span>
                    <input
                      className={styles.input}
                      value={draft.first_name ?? splitPersonName(draft.client?.name).first}
                      onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Last name</span>
                    <input
                      className={styles.input}
                      value={draft.last_name ?? splitPersonName(draft.client?.name).last}
                      onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Phone</span>
                    <input
                      className={styles.input}
                      value={draft.client?.phone ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          client: {
                            ...(draft.client ?? {
                              id: "",
                              name: detail.client?.name ?? "",
                              email: null,
                              address: null,
                              phone: null,
                            }),
                            phone: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Email (optional)</span>
                    <input
                      className={styles.input}
                      value={draft.client?.email ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          client: {
                            ...(draft.client ?? {
                              id: "",
                              name: detail.client?.name ?? "",
                              phone: null,
                              address: null,
                              email: null,
                            }),
                            email: e.target.value,
                          },
                        })
                      }
                    />
                  </label>

                  <div className={styles.detailSection}>
                    <p className={styles.detailSectionTitle}>Address Information</p>
                    <div className={styles.detailGrid}>
                      <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                        <span className={styles.fieldLabel}>Street</span>
                        <AddressAutocomplete
                          value={draft.street ?? ""}
                          inputClassName={styles.input}
                          placeholder="Start typing — pick a Google address"
                          onChange={(street) => setDraft({ ...draft, street })}
                          onResolved={applyDraftAddress}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>City</span>
                        <input
                          className={styles.input}
                          value={draft.city ?? ""}
                          onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>State</span>
                        <input
                          className={styles.input}
                          value={draft.state ?? ""}
                          onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Zip</span>
                        <input
                          className={styles.input}
                          value={draft.zip ?? ""}
                          onChange={(e) => setDraft({ ...draft, zip: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Country</span>
                        <input
                          className={styles.input}
                          value={draft.country ?? "United States"}
                          onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                        />
                      </label>
                      <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                        <span className={styles.fieldLabel}>Community Name</span>
                        <input
                          className={styles.input}
                          value={draft.community_name ?? ""}
                          onChange={(e) =>
                            setDraft({ ...draft, community_name: e.target.value })
                          }
                          placeholder="e.g. Sun City Anthem"
                        />
                      </label>
                      <label className={styles.checkRow}>
                        <input
                          type="checkbox"
                          checked={Boolean(draft.showroom_visit)}
                          onChange={(e) =>
                            setDraft({ ...draft, showroom_visit: e.target.checked })
                          }
                        />
                        Showroom Visit
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Show Room</span>
                        <input
                          className={styles.input}
                          value={draft.show_room ?? "Las Vegas Showroom"}
                          onChange={(e) => setDraft({ ...draft, show_room: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>

                  <div className={styles.detailSection}>
                    <p className={styles.detailSectionTitle}>Area of Home</p>
                    <div className={styles.areaPicker}>
                      {AREAS_OF_HOME.map((area) => {
                        const on = (draft.areas_of_home ?? []).includes(area);
                        return (
                          <button
                            key={area}
                            type="button"
                            className={`${styles.areaChip} ${on ? styles.areaChipOn : ""}`}
                            onClick={() => toggleArea(area)}
                          >
                            {area}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                    <span className={styles.fieldLabel}>Project Notes</span>
                    <textarea
                      className={styles.input}
                      rows={3}
                      value={draft.notes ?? ""}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {detailTab === "activity" ? (
              <div className={styles.chatterFeed}>
                {activity.length === 0 ? (
                  <p className={styles.empty}>No activity yet.</p>
                ) : (
                  activity.map((item) => (
                    <article key={item.id} className={styles.chatterItem}>
                      <p className={styles.chatterMeta}>
                        {item.actor_label ?? "Systems"} · {item.action.replace(/_/g, " ")}{" "}
                        <span className={styles.chatterTime}>{formatRelative(item.created_at)}</span>
                      </p>
                      <p className={styles.chatterBody}>
                        {item.changes
                          ? Object.entries(item.changes)
                              .slice(0, 4)
                              .map(([key, val]) => {
                                if (
                                  val &&
                                  typeof val === "object" &&
                                  "from" in val &&
                                  "to" in val
                                ) {
                                  const v = val as { from: unknown; to: unknown };
                                  return `${key}: ${String(v.from ?? "—")} → ${String(v.to ?? "—")}`;
                                }
                                return `${key}: ${typeof val === "string" ? val : JSON.stringify(val)}`;
                              })
                              .join(" · ")
                          : "Updated"}
                      </p>
                    </article>
                  ))
                )}
              </div>
            ) : null}

            {detailTab === "chatter" ? (
              <>
                <div className={styles.chatterCompose}>
                  <input
                    className={styles.input}
                    placeholder="Share an update…"
                    value={chatterDraft}
                    onChange={(e) => setChatterDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.buttonPrimary}
                    disabled={busy || !chatterDraft.trim()}
                    onClick={() => void postChatter()}
                  >
                    Share
                  </button>
                </div>
                <div className={styles.chatterFeed}>
                  {chatter.length === 0 ? (
                    <p className={styles.empty}>No chatter yet — leave a note for the team.</p>
                  ) : (
                    chatter.map((post) => (
                      <article key={post.id} className={styles.chatterItem}>
                        <p className={styles.chatterMeta}>
                          {post.author_name ?? "Team"}{" "}
                          <span className={styles.chatterTime}>
                            {formatRelative(post.created_at)}
                          </span>
                        </p>
                        <p className={styles.chatterBody}>{post.body}</p>
                      </article>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>

          <aside>
            <div className={styles.railCard}>
              <p className={styles.railTitle}>Open activities</p>
              {(appointments ?? []).length === 0 ? (
                <p className={styles.leadContact}>No events yet. Use New Event.</p>
              ) : (
                (appointments ?? []).map((a) => (
                  <div key={a.id} className={styles.leadContact} style={{ marginBottom: "0.7rem" }}>
                    <strong>{a.kind === "install" ? "Install" : "Design"}</strong>
                    <br />
                    {formatStamp(a.scheduled_at)} · {a.status}
                    {a.kind === "consultation" &&
                    a.status !== "completed" &&
                    a.status !== "cancelled" ? (
                      <div className={styles.handoffRow} style={{ marginTop: "0.35rem" }}>
                        {CONSULT_OUTCOMES.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={styles.handoffBtn}
                            disabled={busy}
                            onClick={() => void completeConsult(a.id, item.id)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    ) : a.kind === "consultation" && a.status === "completed" ? (
                      <div className={styles.handoffDone} style={{ marginTop: "0.2rem" }}>
                        Consult logged — Des pinged
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              <button
                type="button"
                className={styles.buttonPrimary}
                style={{ width: "100%", marginTop: "0.65rem" }}
                onClick={() => openNewEvent()}
              >
                New Event
              </button>
            </div>
            <div className={styles.railCard}>
              <p className={styles.railTitle}>Owner</p>
              <p className={styles.leadContact}>{detail.owner?.name ?? "—"}</p>
              <p className={styles.railTitle} style={{ marginTop: "0.75rem" }}>
                Attempts
              </p>
              <p className={styles.leadContact}>{detail.contact_attempts} / 5</p>
              <button
                type="button"
                className={styles.buttonGhost}
                style={{ width: "100%", marginTop: "0.5rem" }}
                disabled={busy}
                onClick={() => void patchLead({ id: detail.id, action: "attempt" })}
              >
                Log no-answer attempt
              </button>
            </div>
          </aside>
        </div>

        {convertOpen ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setConvertOpen(false)}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-label="Convert — Move to Studio"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={styles.modalTitle}>Convert — Move to Studio</h3>
              <p className={styles.leadContact} style={{ marginBottom: "0.75rem" }}>
                Same as Community: pick a partner account, or create a new customer
                account under this person. Contact stays this person (always new).
              </p>
              <div className={styles.detailGrid}>
                <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <span className={styles.fieldLabel}>Account</span>
                  <select
                    className={styles.input}
                    value={convertForm.account_mode}
                    onChange={(e) =>
                      setConvertForm((f) => ({
                        ...f,
                        account_mode: e.target.value as "new_customer" | "existing",
                      }))
                    }
                  >
                    <option value="new_customer">
                      Create new account — this customer
                    </option>
                    <option value="existing">Choose existing partner account</option>
                  </select>
                </label>
                {convertForm.account_mode === "existing" ? (
                  <>
                    <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                      <span className={styles.fieldLabel}>Partner account</span>
                      <select
                        className={styles.input}
                        value={convertForm.account_id}
                        onChange={(e) =>
                          setConvertForm((f) => ({ ...f, account_id: e.target.value }))
                        }
                      >
                        <option value="">— Select or add below —</option>
                        {partnerAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                            {account.partner_type
                              ? ` · ${partnerTypeLabel(account.partner_type)}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Or add partner</span>
                      <input
                        className={styles.input}
                        value={convertForm.partner_name}
                        onChange={(e) =>
                          setConvertForm((f) => ({ ...f, partner_name: e.target.value }))
                        }
                        placeholder="Brian / ABC Homes"
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Partner type</span>
                      <select
                        className={styles.input}
                        value={convertForm.partner_type}
                        onChange={(e) =>
                          setConvertForm((f) => ({ ...f, partner_type: e.target.value }))
                        }
                      >
                        {INFLUENCER_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <p className={styles.leadContact} style={{ gridColumn: "1 / -1" }}>
                    New account name: {detail.client?.name ?? "this customer"}
                  </p>
                )}
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Contact</span>
                  <input
                    className={styles.input}
                    value={`Create new — ${detail.client?.name ?? "this person"}`}
                    readOnly
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Record owner (designer)</span>
                  <select
                    className={styles.input}
                    value={convertForm.designer_id}
                    onChange={(e) =>
                      setConvertForm((f) => ({ ...f, designer_id: e.target.value }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Converted status</span>
                  <input className={styles.input} value="Moved to Studio" readOnly />
                </label>
              </div>
              <div className={styles.formActions} style={{ marginTop: "0.85rem" }}>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => setConvertOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  disabled={
                    busy ||
                    (convertForm.account_mode === "existing" &&
                      !convertForm.account_id &&
                      !convertForm.partner_name.trim())
                  }
                  onClick={() => void convertToStudio()}
                >
                  Convert
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {soldOpen ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setSoldOpen(false)}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-label="Sold Project Intake"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={styles.modalTitle}>Sold project intake</h3>
              <p className={styles.leadContact} style={{ marginBottom: "0.75rem" }}>
                Designer sold in Studio/Community — Des enters what the OS needs (double entry
                OK). Deposit paid unlocks Ready to Schedule.
              </p>
              <div className={styles.detailGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Contract $ *</span>
                  <input
                    className={styles.input}
                    value={soldForm.contract}
                    onChange={(e) => setSoldForm((f) => ({ ...f, contract: e.target.value }))}
                    placeholder="12500"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Sold date</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={soldForm.sold_date}
                    onChange={(e) => setSoldForm((f) => ({ ...f, sold_date: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Deposit status</span>
                  <select
                    className={styles.input}
                    value={soldForm.deposit_intake_status}
                    onChange={(e) =>
                      setSoldForm((f) => ({ ...f, deposit_intake_status: e.target.value }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="link_sent">Podium link sent</option>
                    <option value="check_pending">Check pending</option>
                    <option value="paid">Paid (50%)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Job-check owner</span>
                  <select
                    className={styles.input}
                    value={soldForm.job_check_owner_id}
                    onChange={(e) =>
                      setSoldForm((f) => ({ ...f, job_check_owner_id: e.target.value }))
                    }
                  >
                    <option value="">— Assign —</option>
                    {staff
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Community ref</span>
                  <input
                    className={styles.input}
                    value={soldForm.community_ref}
                    onChange={(e) =>
                      setSoldForm((f) => ({ ...f, community_ref: e.target.value }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Studio ref</span>
                  <input
                    className={styles.input}
                    value={soldForm.studio_ref}
                    onChange={(e) => setSoldForm((f) => ({ ...f, studio_ref: e.target.value }))}
                  />
                </label>
                <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <span className={styles.fieldLabel}>Tentative install window</span>
                  <input
                    className={styles.input}
                    value={soldForm.tentative_install_notes}
                    onChange={(e) =>
                      setSoldForm((f) => ({ ...f, tentative_install_notes: e.target.value }))
                    }
                    placeholder="Week of 8/18 · 2 days"
                  />
                </label>
                <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <span className={styles.fieldLabel}>Site-ready notes</span>
                  <textarea
                    className={styles.input}
                    rows={2}
                    value={soldForm.site_ready_notes}
                    onChange={(e) =>
                      setSoldForm((f) => ({ ...f, site_ready_notes: e.target.value }))
                    }
                    placeholder="Flooring, access, client notes…"
                  />
                </label>
                <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <span className={styles.fieldLabel}>Signed proposal PDF</span>
                  <input
                    className={styles.input}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => setProposalFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className={styles.formActions} style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => setSoldOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  disabled={busy}
                  onClick={() => void submitSoldIntake()}
                >
                  Save sold job
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {eventOpen ? (
          <div className={styles.modalBackdrop} role="presentation" onClick={() => setEventOpen(false)}>
            <div
              className={styles.modal}
              role="dialog"
              aria-label="New Event"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={styles.modalTitle}>New Event</h3>
              <p className={styles.leadContact} style={{ marginBottom: "0.75rem" }}>
                Design Event uses the designer already on this lead. Location comes from the lead
                address. Community still sends the email — check the box to log that it went out.
              </p>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Type</span>
                <select
                  className={styles.input}
                  value={eventForm.kind}
                  onChange={(e) => {
                    const kind = e.target.value;
                    setEventForm((f) => ({
                      ...f,
                      kind,
                      subject: defaultEventSubject(kind, lastNameFromLead(draft ?? detail)),
                      installer_id: "",
                    }));
                  }}
                >
                  <option value="consultation">Design Event</option>
                  <option value="install">Install Event</option>
                </select>
              </label>
              <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                <span className={styles.fieldLabel}>Subject</span>
                <input
                  className={styles.input}
                  value={eventForm.subject}
                  onChange={(e) => setEventForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Riccardo Design Consultation"
                />
              </label>
              <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                <span className={styles.fieldLabel}>When</span>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={eventForm.scheduled_at}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, scheduled_at: e.target.value }))
                  }
                />
              </label>
              <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                <span className={styles.fieldLabel}>Event location</span>
                <input
                  className={styles.input}
                  value={eventForm.location_text}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, location_text: e.target.value }))
                  }
                  placeholder="Filled from the lead address"
                />
              </label>
              <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                <span className={styles.fieldLabel}>Location type</span>
                <select
                  className={styles.input}
                  value={eventForm.location_type}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, location_type: e.target.value }))
                  }
                >
                  <option value="on_site">On site</option>
                  <option value="showroom">Showroom</option>
                  <option value="virtual">Virtual</option>
                </select>
              </label>
              {eventForm.kind === "install" ? (
                <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                  <span className={styles.fieldLabel}>Installer</span>
                  <select
                    className={styles.input}
                    value={eventForm.installer_id}
                    onChange={(e) =>
                      setEventForm((f) => ({ ...f, installer_id: e.target.value }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {installers.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className={styles.field} style={{ marginTop: "0.55rem" }}>
                  <span className={styles.fieldLabel}>Designer</span>
                  <select
                    className={styles.input}
                    value={eventForm.designer_id}
                    onChange={(e) =>
                      setEventForm((f) => ({ ...f, designer_id: e.target.value }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {eventForm.kind === "consultation" ? (
                <label className={styles.checkRow} style={{ marginTop: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={eventForm.log_confirmation}
                    onChange={(e) =>
                      setEventForm((f) => ({ ...f, log_confirmation: e.target.checked }))
                    }
                  />
                  Log confirmation email now (CC {designers.find((d) => d.id === eventForm.designer_id)?.name ?? "assigned designer"}). Community still sends it.
                </label>
              ) : null}
              <div className={styles.formActions} style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => setEventOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  disabled={busy || !eventForm.scheduled_at}
                  onClick={() => void createEvent()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </OpsShell>
    );
  }

  return (
    <OpsShell
      title="Leads"
      subtitle="Active leads · tap a row for the full Community-style detail"
      actions={
        <button type="button" className={styles.buttonGhost} onClick={() => void loadList()}>
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
            ["unscheduled", "Active – Unscheduled"],
            ["scheduled", "Scheduled"],
            ["needs", "Needs follow-up"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${listView === id ? styles.tabActive : ""}`}
            onClick={() => setListView(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.55rem" }}>
          Website forms — same fields as inspiredclosets.com. Submit as the customer, then refresh
          this list.
        </p>
        <div className={styles.formActions}>
          <a className={styles.buttonGhost} href="/inspired-closets/site/consultation" target="_blank" rel="noreferrer">
            Consultation form
          </a>
          <a className={styles.buttonGhost} href="/inspired-closets/site/brochure" target="_blank" rel="noreferrer">
            Brochure form
          </a>
        </div>
      </div>

      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
          Partner accounts — realtor, builder, interior designer. Referral leads convert onto
          one of these instead of a new customer file.
        </p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Partner name</span>
            <input
              className={styles.input}
              value={partnerDraft.name}
              onChange={(e) => setPartnerDraft((f) => ({ ...f, name: e.target.value }))}
              placeholder="Brian / ABC Homes"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Type</span>
            <select
              className={styles.input}
              value={partnerDraft.partner_type}
              onChange={(e) => setPartnerDraft((f) => ({ ...f, partner_type: e.target.value }))}
            >
              {INFLUENCER_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Phone</span>
            <input
              className={styles.input}
              value={partnerDraft.phone}
              onChange={(e) => setPartnerDraft((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <input
              className={styles.input}
              value={partnerDraft.email}
              onChange={(e) => setPartnerDraft((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={busy || !partnerDraft.name.trim()}
              onClick={() => void createPartnerFromPanel()}
            >
              Add partner
            </button>
          </div>
        </div>
        {partnerAccounts.length > 0 ? (
          <p className={styles.leadContact} style={{ marginTop: "0.65rem" }}>
            {partnerAccounts.map((account) => account.name).join(" · ")}
          </p>
        ) : (
          <p className={styles.leadContact} style={{ marginTop: "0.65rem" }}>
            No partners yet. Add one before converting a realtor or builder lead.
          </p>
        )}
      </div>

      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <p className={styles.subtitle} style={{ marginBottom: "0.75rem" }}>
          New lead — same fields Des fills when someone calls in
        </p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>First name *</span>
            <input
              className={styles.input}
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Last name *</span>
            <input
              className={styles.input}
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Phone *</span>
            <input
              className={styles.input}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <input
              className={styles.input}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Lead source</span>
            <select
              className={styles.input}
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {sourceNeedsReferralName(form.source) ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Referral name *</span>
              <input
                className={styles.input}
                value={form.referral_name}
                onChange={(e) => {
                  const referral_name = e.target.value;
                  const match = matchPartnerAccount(referral_name, partnerAccounts);
                  setForm((f) => ({
                    ...f,
                    referral_name,
                    account_id: match?.id ?? f.account_id,
                  }));
                }}
                placeholder="Brian"
              />
            </label>
          ) : null}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Designer</span>
            <select
              className={styles.input}
              value={form.designer_id}
              onChange={(e) => setForm((f) => ({ ...f, designer_id: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {designers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Partner account</span>
            <select
              className={styles.input}
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
            >
              <option value="">None — customer file at convert</option>
              {partnerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.partner_type ? ` · ${partnerTypeLabel(account.partner_type)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.fieldLabel}>Street</span>
            <AddressAutocomplete
              value={form.street}
              inputClassName={styles.input}
              placeholder="350 Kandinsky Court"
              onChange={(street) => setForm((f) => ({ ...f, street }))}
              onResolved={applyFormAddress}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>City</span>
            <input
              className={styles.input}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>State</span>
            <input
              className={styles.input}
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Zip</span>
            <input
              className={styles.input}
              value={form.zip}
              onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
            />
          </label>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.fieldLabel}>Area of home</span>
            <div className={styles.areaPicker} style={{ marginTop: "0.35rem" }}>
              {AREAS_OF_HOME.map((area) => {
                const on = form.areas_of_home.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    className={`${styles.areaChip} ${on ? styles.areaChipOn : ""}`}
                    onClick={() => toggleFormArea(area)}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </div>
          <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.fieldLabel}>Project notes</span>
            <textarea
              className={styles.input}
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="8/26/26 Tommy and wife Stacey called…"
            />
          </label>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.buttonGhost}
              disabled={busy || !form.first_name.trim() || !form.last_name.trim()}
              onClick={() => void createLead({ source: "instagram" })}
            >
              + Instagram lead
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={busy || !form.first_name.trim() || !form.last_name.trim()}
              onClick={() => void createLead()}
            >
              Add lead
            </button>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        {loading ? (
          <p className={styles.empty}>Loading leads…</p>
        ) : leads.length === 0 ? (
          <p className={styles.empty}>No leads in this view.</p>
        ) : (
          <table className={styles.table} style={{ minWidth: "52rem" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Zip</th>
                <th>Account</th>
                <th>Status</th>
                <th>Form Type</th>
                <th>Source</th>
                <th>Designer</th>
                <th>Created Date</th>
                <th>Last Modified</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`${styles.leadRow} ${lead.followUpNeeded ? styles.rowHeld : ""}`}
                  onClick={() => setSelectedId(lead.id)}
                >
                  <td>
                    <strong>{lead.client?.name ?? "—"}</strong>
                  </td>
                  <td>{lead.client?.phone ?? "—"}</td>
                  <td>{lead.zip ?? "—"}</td>
                  <td>{lead.account?.name ?? "—"}</td>
                  <td>{stageLabel(lead.stage)}</td>
                  <td>
                    {FORM_TYPES.find((f) => f.id === lead.form_type)?.label ?? "—"}
                  </td>
                  <td>{sourceLabel(lead.source)}</td>
                  <td>{lead.designer?.name ?? "—"}</td>
                  <td>{formatListDate(lead.created_at)}</td>
                  <td>{formatListDate(lead.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </OpsShell>
  );
}
