"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ISSUE_TYPES,
  MEDIA_KINDS,
} from "@/lib/inspired-closets-ops-field";
import InspiredClosetsLogo from "@/components/inspired-closets/InspiredClosetsLogo";
import InstallerHomeCalendar from "@/components/inspired-closets/InstallerHomeCalendar";
import InstallerMonthPage from "@/components/inspired-closets/InstallerMonthPage";
import FieldVehicleCard from "@/components/inspired-closets/FieldVehicleCard";
import FieldVehicleTab, {
  type FieldVehicleSnapshot,
} from "@/components/inspired-closets/FieldVehicleTab";
import access from "@/app/inspired-closets/access/access.module.css";
import styles from "./field.module.css";

const LOGO_SRC = "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png";

type FieldTab = "today" | "schedule" | "jobs" | "vehicle" | "me";

type Installer = { id: string; name: string; phone?: string | null; title?: string | null };

type InstallerProfile = {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  hiredAt: string | null;
  title: string;
  initials: string;
  tenureLabel: string;
  onSiteNow: boolean;
  stats: {
    installsCompleted: number;
    activeJobs: number;
    issuesReported: number;
    openIssues: number;
  };
};

type TimeEntry = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_lat: string | null;
  clock_in_lng: string | null;
};

type PacketMaterial = {
  id: string;
  qty: number;
  status: string;
  name: string;
  sku: string;
  size: string | null;
};

type PacketSlip = {
  id: string;
  item_number: string;
  description: string | null;
  qty: number;
  received_qty: number;
  status: string;
};

type Job = {
  id: string;
  stage: string;
  install_date: string | null;
  visit_window?: string | null;
  job_kind?: string | null;
  field_notes?: string | null;
  notes: string | null;
  risk_flag: boolean;
  mine: boolean;
  client: { id: string; name: string; address: string | null; phone: string | null } | null;
  openClock: TimeEntry | null;
  timeEntries?: TimeEntry[];
  packet_materials?: PacketMaterial[];
  packet_slip?: PacketSlip[];
};

type Media = { id: string; kind: string; public_url: string | null; caption: string | null };
type Issue = { id: string; issue_type: string; description: string; status: string };
type Notice = { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null };
type Update = { id: string; title: string; body: string; author_name: string | null; created_at: string };
type TimeOff = { id: string; kind: string; start_date: string; end_date: string; note: string | null; status: string };
type Pay = {
  last_pay_cents: number;
  last_pay_date: string | null;
  next_pay_date: string | null;
  classification: string | null;
  bank_last4: string | null;
  bank_status: string | null;
  home_address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  emergency_relation: string | null;
  truck_label: string | null;
};
type Document = { id: string; kind: string; title: string; public_url: string | null };
type CrewPerson = { id: string; installer_id: string; name: string; status: string };

type OfflineItem = {
  id: string;
  kind: "clock" | "issue";
  payload: Record<string, unknown>;
  createdAt: string;
};

const OFFLINE_KEY = "ic-field-offline-queue";
const NAV: { id: FieldTab; label: string }[] = [
  { id: "today", label: "Home" },
  { id: "schedule", label: "Schedule" },
  { id: "jobs", label: "Jobs" },
  { id: "vehicle", label: "Vehicle" },
];

type FeedEntry =
  | {
      key: string;
      kind: "update";
      id: string;
      title: string;
      body: string;
      created_at: string;
      author_name: string | null;
    }
  | {
      key: string;
      kind: "notice";
      id: string;
      title: string;
      body: string;
      created_at: string;
      read_at: string | null;
    };

function readQueue(): OfflineItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? "[]") as OfflineItem[];
  } catch {
    return [];
  }
}
function writeQueue(items: OfflineItem[]) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(items));
}

function getGeo(): Promise<{ lat: string | null; lng: string | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

function formatStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatDuration(clockIn: string, clockOut: string | null, now = Date.now()): string {
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const minutes = Math.round((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
function formatMinutes(mins: number): string {
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  if (hours <= 0) return `${m}m`;
  return `${hours}h ${m}m`;
}
function money(cents: number): string {
  if (!cents) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function stageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

type OfficeFact = { label: string; value: string };

const OFFICE_SPLIT =
  /(?=(?:Order|Crew|Payment type|Payment|Owes|RTO|Podium|Folder|Visit|Scheduled|Date scheduled|Date ordered|Receive|ETA|Install date|Confirmed|Job complete|Job check date|Related install|Zip|Original install|100% ready):\s)/i;

function isBillingNote(value: string) {
  return /invoice|invoiced|check|paid|pif|gc\b|visa|card|billing|owes|\$|deposit/i.test(value);
}

function parseOfficeNotes(notes: string | null | undefined): { facts: OfficeFact[]; site: string[] } {
  if (!notes?.trim()) return { facts: [], site: [] };
  const chunks = notes
    .split(/\n+/)
    .flatMap((line) => line.split(OFFICE_SPLIT))
    .map((part) => part.trim())
    .filter(Boolean);
  const facts: OfficeFact[] = [];
  const site: string[] = [];
  for (const chunk of chunks) {
    if (/^go[- ]?back\b/i.test(chunk) || /^service\b/i.test(chunk)) {
      site.push(chunk.replace(/^[^:]+:\s*/, "").trim() || chunk);
      continue;
    }
    const match = chunk.match(/^([^:]{1,40}):\s*(.+)$/);
    const label = (match?.[1] ?? "Note").trim();
    const value = (match?.[2] ?? chunk).trim();
    if (!value) continue;
    if (/^crew$/i.test(label)) continue;
    if (/^payment$/i.test(label) && !isBillingNote(value)) {
      site.push(value);
      continue;
    }
    if (/^note$/i.test(label)) {
      site.push(value);
      continue;
    }
    facts.push({ label, value });
  }
  return { facts, site };
}

function OfficePacket({ notes }: { notes: string | null | undefined }) {
  const { facts, site } = parseOfficeNotes(notes);
  if (facts.length === 0 && site.length === 0) return null;
  return (
    <div className={styles.packetOffice}>
      {facts.length > 0 ? (
        <dl className={styles.packetFacts}>
          {facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className={styles.packetFact}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {site.length > 0 ? (
        <div className={styles.packetBlock}>
          <h3 className={styles.packetSection}>Site notes</h3>
          <ul className={styles.packetNoteList}>
            {site.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function mediaKindLabel(kind: string) {
  return MEDIA_KINDS.find((row) => row.id === kind)?.label ?? kind;
}

function localYmd(value = new Date()): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function visitWindowEnd(window: string, day: string): Date | null {
  const cleaned = window.replace(/[–—]/g, "-");
  const parts = cleaned.split("-").map((part) => part.trim()).filter(Boolean);
  const endRaw = parts[parts.length - 1];
  if (!endRaw) return null;
  const match = endRaw.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const mer = (match[3] ?? "").toLowerCase();
  const startMer = parts[0]?.match(/(a|p|am|pm)\s*$/i)?.[1]?.toLowerCase() ?? "";
  if (mer.startsWith("p") || (!mer && startMer.startsWith("a") && hour <= 12 && hour !== 12 && hour < 8)) {
    if (hour < 12) hour += 12;
  } else if (mer.startsWith("a") && hour === 12) {
    hour = 0;
  } else if (!mer && hour === 12) {
    hour = 12;
  } else if (!mer && hour <= 7) {
    hour += 12;
  }
  const end = new Date(`${day}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(hour, minute, 0, 0);
  return end;
}

function isPastJob(job: { stage: string; install_date?: string | null; visit_window?: string | null }) {
  if (["install_complete", "final_payment", "closed"].includes(job.stage)) return true;
  const day = job.install_date?.slice(0, 10);
  if (!day) return false;
  const today = localYmd();
  if (day < today) return true;
  if (day > today) return false;
  if (!job.visit_window) return false;
  const end = visitWindowEnd(job.visit_window, day);
  return Boolean(end && Date.now() > end.getTime());
}

function Avatar({
  profile,
  large,
  xl,
}: {
  profile: { avatarUrl?: string | null; initials?: string; name: string };
  large?: boolean;
  xl?: boolean;
}) {
  const sizeClass = xl ? styles.avatarXl : large ? styles.avatarLg : "";
  if (profile.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.avatarUrl} alt="" className={`${styles.avatar} ${sizeClass}`} />
    );
  }
  const initials =
    profile.initials ||
    profile.name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  return (
    <div className={`${styles.avatar} ${styles.avatarFallback} ${sizeClass}`} aria-hidden>
      {initials || "?"}
    </div>
  );
}

function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden fill="none">
      <path
        d="M8.2 8.2 9 6.8A1.2 1.2 0 0 1 10 6.2h4c.4 0 .8.2 1 .6l.8 1.4H18a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10.2a2 2 0 0 1 2-2h2.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.2" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function AvatarPicker({
  profile,
  large,
  xl,
  disabled,
  onPick,
}: {
  profile: { avatarUrl?: string | null; initials?: string; name: string };
  large?: boolean;
  xl?: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.avatarPickBtn} ${xl ? styles.avatarPickBtnXl : ""}`}
      disabled={disabled}
      onClick={onPick}
      aria-label={profile.avatarUrl ? "Change profile photo" : "Add a profile photo"}
    >
      <Avatar profile={profile} large={large} xl={xl} />
      <span className={styles.avatarCam}>
        <CameraGlyph />
      </span>
    </button>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <path
        d="M15 17.5H9m6 0a3 3 0 0 1-6 0m6 0h2.4c.7 0 1.05 0 1.24-.15.16-.13.26-.33.27-.54.02-.24-.16-.53-.52-1.1l-.7-1.1a7.2 7.2 0 0 1-.89-3.46V10a4.8 4.8 0 1 0-9.6 0v1.15c0 1.2-.3 2.39-.89 3.46l-.7 1.1c-.36.57-.54.86-.52 1.1.01.21.11.41.27.54.19.15.54.15 1.24.15H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIcon({ id }: { id: FieldTab }) {
  if (id === "today") {
    return (
      <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1v-9.4Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "schedule") {
    return (
      <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "vehicle") {
    return (
      <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 15.5h16v3.2a1 1 0 0 1-1 1h-1.4M6.4 19.7H5a1 1 0 0 1-1-1V15.5Zm2.2 0h7.2M5.2 15.5l1.6-6.2A2 2 0 0 1 8.7 8h6.8a2 2 0 0 1 1.9 1.3l1.6 6.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="7.4" cy="19.6" r="1.35" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.6" cy="19.6" r="1.35" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg className={styles.tabBarIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="8" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 8V6.2A2.2 2.2 0 0 1 10.2 4h3.6A2.2 2.2 0 0 1 16 6.2V8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FieldApp() {
  const [online, setOnline] = useState(true);
  const [installer, setInstaller] = useState<Installer | null>(null);
  const [myProfile, setMyProfile] = useState<InstallerProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [crew, setCrew] = useState<CrewPerson[]>([]);
  const [crewOptions, setCrewOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [helperId, setHelperId] = useState("");
  const [addInstallerOpen, setAddInstallerOpen] = useState(false);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [reviewMedia, setReviewMedia] = useState<Media[]>([]);
  const [reviewIssues, setReviewIssues] = useState<Issue[]>([]);
  const [reviewCrew, setReviewCrew] = useState<CrewPerson[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [pay, setPay] = useState<Pay | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [hoursThisWeek, setHoursThisWeek] = useState(0);
  const [nextJobId, setNextJobId] = useState<string | null>(null);
  const [vehicleSnap, setVehicleSnap] = useState<FieldVehicleSnapshot | null>(null);
  const [milesOut, setMilesOut] = useState("");
  const [milesBack, setMilesBack] = useState("");
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error" | "ok"; text: string } | null>(null);
  const [mediaKind, setMediaKind] = useState("before");
  const [mediaCaption, setMediaCaption] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [issueType, setIssueType] = useState("site_not_ready");
  const [issueText, setIssueText] = useState("");
  const [fieldNotes, setFieldNotes] = useState("");
  const [tab, setTab] = useState<FieldTab>("today");
  const [bellOpen, setBellOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [jobsShowPacketFirst, setJobsShowPacketFirst] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState("");
  const bellRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [ptoKind, setPtoKind] = useState<"pto" | "sick">("pto");
  const [ptoStart, setPtoStart] = useState("");
  const [ptoEnd, setPtoEnd] = useState("");
  const [ptoNote, setPtoNote] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");
  const [truckLabel, setTruckLabel] = useState("");
  const [routing, setRouting] = useState("");
  const [account, setAccount] = useState("");

  const myJobs = useMemo(() => jobs.filter((job) => job.mine), [jobs]);
  const vehicleJobNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const job of myJobs) map.set(job.id, job.client?.name ?? "Job");
    return map;
  }, [myJobs]);
  const selected = useMemo(() => myJobs.find((job) => job.id === selectedId) ?? null, [myJobs, selectedId]);
  const workJob = useMemo(() => {
    if (selected && !isPastJob(selected)) return selected;
    return myJobs.find((job) => !isPastJob(job)) ?? null;
  }, [myJobs, selected]);
  const pastJobs = useMemo(
    () =>
      myJobs
        .filter((job) => isPastJob(job))
        .sort((a, b) => (b.install_date ?? "").localeCompare(a.install_date ?? "")),
    [myJobs],
  );
  const upcomingJobs = useMemo(
    () =>
      myJobs
        .filter((job) => !isPastJob(job))
        .sort((a, b) => (a.install_date ?? "9999").localeCompare(b.install_date ?? "9999")),
    [myJobs],
  );
  const reviewJob = useMemo(
    () => myJobs.find((job) => job.id === reviewJobId) ?? null,
    [myJobs, reviewJobId],
  );
  const nextJob = useMemo(
    () =>
      myJobs.find((job) => job.id === nextJobId) ??
      myJobs.find((job) => !isPastJob(job)) ??
      myJobs[0] ??
      null,
    [myJobs, nextJobId],
  );
  const clockedJob = useMemo(() => myJobs.find((job) => job.openClock) ?? null, [myJobs]);
  const nextBoardJob = clockedJob ?? upcomingJobs[0] ?? null;
  const laterJobs = useMemo(
    () => upcomingJobs.filter((job) => job.id !== nextBoardJob?.id),
    [upcomingJobs, nextBoardJob],
  );
  const packetJob = clockedJob ?? nextJob;
  const recentJobs = useMemo(
    () =>
      [...myJobs]
        .sort((a, b) => (b.install_date ?? "").localeCompare(a.install_date ?? ""))
        .slice(0, 6),
    [myJobs],
  );
  const feed = useMemo<FeedEntry[]>(() => {
    const items: FeedEntry[] = [
      ...updates.map((item) => ({
        key: `update-${item.id}`,
        kind: "update" as const,
        id: item.id,
        title: item.title,
        body: item.body,
        created_at: item.created_at,
        author_name: item.author_name,
      })),
      ...notices.map((item) => ({
        key: `notice-${item.id}`,
        kind: "notice" as const,
        id: item.id,
        title: item.title,
        body: item.body,
        created_at: item.created_at,
        read_at: item.read_at,
      })),
    ];
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [notices, updates]);
  const meProfile = useMemo(() => {
    if (myProfile) return myProfile;
    if (!installer) return null;
    return {
      id: installer.id,
      name: installer.name,
      phone: installer.phone ?? null,
      avatarUrl: null,
      hiredAt: null,
      title: installer.title || "Installer",
      initials: installer.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join(""),
      tenureLabel: "Installer",
      onSiteNow: false,
      stats: { installsCompleted: 0, activeJobs: 0, issuesReported: 0, openIssues: 0 },
    } satisfies InstallerProfile;
  }, [installer, myProfile]);

  const loadHome = useCallback(async () => {
    try {
      const response = await fetch("/api/inspired-closets/field/home");
      if (response.status === 401) {
        setInstaller(null);
        return;
      }
      const payload = (await response.json()) as {
        ok?: boolean;
        installer?: Installer;
        nextJob?: { id: string } | null;
        hoursThisWeekMinutes?: number;
        notices?: Notice[];
        unreadCount?: number;
        updates?: Update[];
        pay?: Pay | null;
        documents?: Document[];
        onSiteNow?: boolean;
      };
      if (!payload.ok) return;
      if (payload.installer) setInstaller(payload.installer);
      setNextJobId(payload.nextJob?.id ?? null);
      setHoursThisWeek(payload.hoursThisWeekMinutes ?? 0);
      setNotices(payload.notices ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
      setUpdates(payload.updates ?? []);
      setPay(payload.pay ?? null);
      setDocuments(payload.documents ?? []);
      if (payload.pay) {
        setHomeAddress(payload.pay.home_address ?? "");
        setEmergencyName(payload.pay.emergency_name ?? "");
        setEmergencyPhone(payload.pay.emergency_phone ?? "");
        setEmergencyRelation(payload.pay.emergency_relation ?? "");
        setTruckLabel(payload.pay.truck_label ?? "");
      }
    } catch {
      /* auto-sync / HMR — keep the last good screen */
    }
  }, []);

  const loadVehicle = useCallback(async () => {
    try {
      const response = await fetch("/api/inspired-closets/field/vehicle");
      if (response.status === 401) return;
      const payload = (await response.json()) as FieldVehicleSnapshot & { ok?: boolean };
      if (!payload.ok) return;
      setVehicleSnap(payload);
    } catch {
      /* keep last truck snapshot */
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/inspired-closets/field/jobs");
      if (response.status === 401) {
        setInstaller(null);
        setJobs([]);
        return;
      }
      const payload = (await response.json()) as { ok?: boolean; installer?: Installer; jobs?: Job[] };
      if (!payload.ok) return;
      setInstaller(payload.installer ?? null);
      setJobs(payload.jobs ?? []);
      const mine = (payload.jobs ?? []).filter((job) => job.mine);
      const firstActive = mine.find((job) => !isPastJob(job))?.id ?? mine[0]?.id ?? null;
      setSelectedId((current) => current ?? firstActive);
    } catch {
      /* keep last jobs */
    }
  }, []);

  const loadProfiles = useCallback(async (staffId: string) => {
    try {
      const response = await fetch(`/api/inspired-closets/field/profiles?id=${staffId}`);
      const payload = (await response.json()) as { ok?: boolean; profile?: InstallerProfile | null };
      if (payload.ok) setMyProfile(payload.profile ?? null);
    } catch {
      /* keep last profile */
    }
  }, []);

  const loadPto = useCallback(async () => {
    try {
      const response = await fetch("/api/inspired-closets/field/pto");
      const payload = (await response.json()) as { ok?: boolean; timeOff?: TimeOff[] };
      if (payload.ok) setTimeOff(payload.timeOff ?? []);
    } catch {
      /* keep last PTO */
    }
  }, []);

  const loadJobExtras = useCallback(async (jobId: string) => {
    try {
      const [mediaRes, issuesRes, crewRes] = await Promise.all([
        fetch(`/api/inspired-closets/field/media?jobId=${jobId}`),
        fetch(`/api/inspired-closets/field/issues?jobId=${jobId}`),
        fetch(`/api/inspired-closets/field/crew?jobId=${jobId}`),
      ]);
      const mediaPayload = (await mediaRes.json()) as { ok?: boolean; media?: Media[] };
      const issuesPayload = (await issuesRes.json()) as { ok?: boolean; issues?: Issue[] };
      const crewPayload = (await crewRes.json()) as {
        ok?: boolean;
        crew?: CrewPerson[];
        installers?: Array<{ id: string; name: string }>;
      };
      if (mediaPayload.ok) setMedia(mediaPayload.media ?? []);
      if (issuesPayload.ok) setIssues(issuesPayload.issues ?? []);
      if (crewPayload.ok) {
        setCrew(crewPayload.crew ?? []);
        setCrewOptions(crewPayload.installers ?? []);
      }
    } catch {
      /* keep last extras */
    }
  }, []);

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) return;
    const remaining: OfflineItem[] = [];
    for (const item of queue) {
      try {
        const url =
          item.kind === "clock" ? "/api/inspired-closets/field/clock" : "/api/inspired-closets/field/issues";
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (!response.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    if (remaining.length < queue.length) {
      await loadJobs();
      await loadHome();
    }
  }, [loadHome, loadJobs]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushQueue]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const session = await fetch("/api/inspired-closets/field/auth");
        const payload = (await session.json()) as { installer?: Installer | null };
        if (!payload.installer) {
          setInstaller(null);
          return;
        }
        setInstaller(payload.installer);
        await Promise.all([
          loadHome(),
          loadJobs(),
          loadPto(),
          loadProfiles(payload.installer.id),
          loadVehicle(),
        ]);
        await flushQueue();
      } catch (error) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to start Installers.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [flushQueue, loadHome, loadJobs, loadProfiles, loadPto, loadVehicle]);

  useEffect(() => {
    if (!installer) return;
    function refreshCalendar() {
      void loadHome();
      void loadJobs();
      void loadPto();
      void loadVehicle();
      void flushQueue();
    }
    function onFocus() {
      refreshCalendar();
    }
    function onVisible() {
      if (document.visibilityState === "visible") refreshCalendar();
    }
    const timer = window.setInterval(() => {
      refreshCalendar();
    }, 15_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flushQueue, installer, loadHome, loadJobs, loadPto, loadVehicle]);

  useEffect(() => {
    if (workJob?.id) {
      void loadJobExtras(workJob.id);
      setFieldNotes(workJob.field_notes ?? "");
      const today = new Date().toISOString().slice(0, 10);
      const row = vehicleSnap?.miles?.find(
        (item) => item.job_id === workJob.id && item.drive_date === today,
      );
      setMilesOut(row ? String(row.miles_out) : "");
      setMilesBack(row ? String(row.miles_back) : "");
    }
  }, [loadJobExtras, vehicleSnap, workJob]);

  const hasOpenClock = jobs.some((job) => Boolean(job.openClock));
  useEffect(() => {
    if (!hasOpenClock) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [hasOpenClock]);

  async function finishSignIn(response: Response) {
    const payload = (await response.json()) as { ok?: boolean; error?: string; installer?: Installer };
    if (!payload.ok || !payload.installer) throw new Error(payload.error ?? "Sign-in failed.");
    setInstaller(payload.installer);
    setPassword("");
    setTab("today");
    await Promise.all([
      loadHome(),
      loadJobs(),
      loadPto(),
      loadProfiles(payload.installer.id),
    ]);
  }

  async function signIn() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/field/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      await finishSignIn(response);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Sign-in failed." });
    } finally {
      setBusy(false);
    }
  }

  async function signInTest() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/inspired-closets/field/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      await finishSignIn(response);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Test login failed." });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/inspired-closets/field/auth", { method: "DELETE" });
    setInstaller(null);
    setMyProfile(null);
    setJobs([]);
    setTab("today");
    setBellOpen(false);
    setProfileMenuOpen(false);
  }

  async function clock(action: "in" | "out", job = workJob) {
    if (!job) return;
    setBusy(true);
    setNotice(null);
    const geo = await getGeo();
    const payload = { job_id: job.id, action, lat: geo.lat, lng: geo.lng };
    try {
      if (!navigator.onLine) {
        const queue = readQueue();
        queue.push({ id: crypto.randomUUID(), kind: "clock", payload, createdAt: new Date().toISOString() });
        writeQueue(queue);
        setNotice({ kind: "info", text: `Offline — clock ${action} saved. It’ll sync on its own.` });
        return;
      }
      const response = await fetch("/api/inspired-closets/field/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Clock failed.");
      setNotice({ kind: "ok", text: action === "in" ? "Clocked in." : "Clocked out." });
      await loadJobs();
      await loadHome();
      if (installer) await loadProfiles(installer.id);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Clock failed." });
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!workJob) return;
    const form = new FormData();
    form.set("job_id", workJob.id);
    form.set("kind", mediaKind);
    if (mediaCaption.trim()) form.set("caption", mediaCaption.trim());
    form.set("file", file);
    const response = await fetch("/api/inspired-closets/field/media", { method: "POST", body: form });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!data.ok) throw new Error(data.error ?? "Upload failed.");
  }

  async function uploadPhotos(files: FileList | File[]) {
    if (!workJob) return;
    const list = Array.from(files).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (list.length === 0) {
      setNotice({ kind: "error", text: "Choose a photo or video." });
      return;
    }
    setPhotoBusy(true);
    setBusy(true);
    try {
      for (const file of list) {
        await uploadPhoto(file);
      }
      setMediaCaption("");
      setNotice({
        kind: "ok",
        text: list.length === 1 ? "Photo saved to the job." : `${list.length} photos saved to the job.`,
      });
      await loadJobExtras(workJob.id);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setPhotoBusy(false);
      setBusy(false);
    }
  }

  function openAvatarPicker() {
    setProfileMenuOpen(false);
    avatarInputRef.current?.click();
  }

  async function uploadAvatar(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setNotice({ kind: "error", text: "Keep the photo under 8 MB." });
      return;
    }
    if (file.type && !file.type.startsWith("image/")) {
      setNotice({ kind: "error", text: "Choose a photo." });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/inspired-closets/field/profiles", { method: "POST", body: form });
      const data = (await response.json()) as { ok?: boolean; error?: string; avatarUrl?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not update photo.");
      if (data.avatarUrl) {
        setMyProfile((current) => (current ? { ...current, avatarUrl: data.avatarUrl! } : current));
      }
      if (installer) await loadProfiles(installer.id);
      setNotice({ kind: "ok", text: "Photo updated." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not update photo." });
    } finally {
      setBusy(false);
    }
  }

  async function reportIssue() {
    if (!workJob || !issueText.trim()) return;
    setBusy(true);
    const payload = { job_id: workJob.id, issue_type: issueType, description: issueText.trim() };
    try {
      if (!navigator.onLine) {
        const queue = readQueue();
        queue.push({ id: crypto.randomUUID(), kind: "issue", payload, createdAt: new Date().toISOString() });
        writeQueue(queue);
        setIssueText("");
        setNotice({ kind: "info", text: "Offline — issue saved. It’ll sync on its own." });
        return;
      }
      const response = await fetch("/api/inspired-closets/field/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not report issue.");
      setIssueText("");
      setNotice({ kind: "ok", text: "Issue flagged for the office." });
      await loadJobExtras(workJob.id);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not report issue." });
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!workJob) return;
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: workJob.id, action: "notes", field_notes: fieldNotes }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not save notes.");
      setNotice({ kind: "ok", text: "Notes saved." });
      await loadJobs();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save notes." });
    } finally {
      setBusy(false);
    }
  }

  async function completeJob() {
    if (!workJob) return;
    if (!window.confirm(`Mark ${workJob.client?.name ?? "this job"} complete?`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: workJob.id, action: "complete" }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not complete job.");
      setNotice({ kind: "ok", text: "Install complete." });
      await loadJobs();
      await loadHome();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not complete job." });
    } finally {
      setBusy(false);
    }
  }

  async function requestHelper() {
    if (!workJob || !helperId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/crew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: workJob.id, installer_id: helperId }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not request helper.");
      setHelperId("");
      setAddInstallerOpen(false);
      setNotice({ kind: "ok", text: "Request sent to Craig, Des, and Gavin." });
      await loadJobExtras(workJob.id);
      await loadHome();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not request helper." });
    } finally {
      setBusy(false);
    }
  }

  async function openReview(jobId: string) {
    setReviewJobId(jobId);
    setReviewBusy(true);
    try {
      const [mediaRes, issuesRes, crewRes] = await Promise.all([
        fetch(`/api/inspired-closets/field/media?jobId=${jobId}`),
        fetch(`/api/inspired-closets/field/issues?jobId=${jobId}`),
        fetch(`/api/inspired-closets/field/crew?jobId=${jobId}`),
      ]);
      const mediaPayload = (await mediaRes.json()) as { ok?: boolean; media?: Media[] };
      const issuesPayload = (await issuesRes.json()) as { ok?: boolean; issues?: Issue[] };
      const crewPayload = (await crewRes.json()) as { ok?: boolean; crew?: CrewPerson[] };
      if (mediaPayload.ok) setReviewMedia(mediaPayload.media ?? []);
      if (issuesPayload.ok) setReviewIssues(issuesPayload.issues ?? []);
      if (crewPayload.ok) setReviewCrew(crewPayload.crew ?? []);
    } catch {
      setReviewMedia([]);
      setReviewIssues([]);
      setReviewCrew([]);
    } finally {
      setReviewBusy(false);
    }
  }

  function openJobSurface(jobId: string) {
    const job = myJobs.find((row) => row.id === jobId);
    setTab("jobs");
    setJobsShowPacketFirst(true);
    if (job && isPastJob(job)) {
      void openReview(jobId);
      return;
    }
    setSelectedId(jobId);
    setReviewJobId(null);
  }

  function openScheduledJob(jobId: string) {
    setSelectedId(jobId);
    setReviewJobId(null);
    setJobsShowPacketFirst(true);
  }

  function jobKindClass(kind: string | null | undefined) {
    if (kind === "service") return styles.chipService;
    if (kind === "go_back") return styles.chipGoBack;
    return styles.chipNew;
  }

  function jobKindLabel(kind: string | null | undefined) {
    if (kind === "service") return "Service";
    if (kind === "go_back") return "Go-back";
    return "New";
  }

  function goToTab(next: FieldTab) {
    setTab(next);
    setBellOpen(false);
    setProfileMenuOpen(false);
    if (next === "jobs") setJobsShowPacketFirst(false);
    if (next === "today" || next === "schedule" || next === "jobs") {
      void loadJobs();
      void loadHome();
    }
  }

  async function saveVehicleLog(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as FieldVehicleSnapshot & { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not save.");
      setVehicleSnap(payload);
      setNotice({ kind: "ok", text: "Saved on your truck." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveJobMiles(jobId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "miles",
          job_id: jobId,
          miles_out: Number(milesOut) || 0,
          miles_back: Number(milesBack) || 0,
        }),
      });
      const payload = (await response.json()) as FieldVehicleSnapshot & { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not save miles.");
      setVehicleSnap(payload);
      setNotice({ kind: "ok", text: "Miles saved for this job." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save miles.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitPto() {
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/pto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: ptoKind, start_date: ptoStart, end_date: ptoEnd || ptoStart, note: ptoNote }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not send request.");
      setPtoNote("");
      setNotice({ kind: "ok", text: "Sent to Gavin. You’ll get a bell when he answers." });
      await loadPto();
      await loadHome();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not send request." });
    } finally {
      setBusy(false);
    }
  }

  async function saveMe(extra?: Record<string, string>) {
    setBusy(true);
    try {
      const response = await fetch("/api/inspired-closets/field/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home_address: homeAddress,
          emergency_name: emergencyName,
          emergency_phone: emergencyPhone,
          emergency_relation: emergencyRelation,
          truck_label: truckLabel,
          ...extra,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; pay?: Pay };
      if (!data.ok) throw new Error(data.error ?? "Could not save.");
      setPay(data.pay ?? null);
      if (extra?.account_number) {
        setAccount("");
        setRouting("");
        setNotice({ kind: "ok", text: "Sent to Lulu. We only keep last 4 here." });
      } else {
        setNotice({ kind: "ok", text: "Saved." });
      }
      await loadHome();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  async function markNoticesRead() {
    await fetch("/api/inspired-closets/field/home", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_notices" }),
    });
    setUnreadCount(0);
    setNotices((current) =>
      current.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() })),
    );
  }

  function toggleBell() {
    const next = !bellOpen;
    setBellOpen(next);
    setProfileMenuOpen(false);
    if (next && unreadCount > 0) void markNoticesRead();
  }

  function goToFeedItem(key: string) {
    setBellOpen(false);
    setProfileMenuOpen(false);
    setTab("today");
    setHighlightId(key);
  }

  useEffect(() => {
    if (!bellOpen && !profileMenuOpen) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (bellRef.current?.contains(target) || profileMenuRef.current?.contains(target)) return;
      setBellOpen(false);
      setProfileMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setBellOpen(false);
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [bellOpen, profileMenuOpen]);

  useEffect(() => {
    if (!addInstallerOpen && !reviewJobId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAddInstallerOpen(false);
        setReviewJobId(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addInstallerOpen, reviewJobId]);

  useEffect(() => {
    if (!highlightId || tab !== "today") return;
    const node = document.getElementById(highlightId);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlightId, tab]);

  const noticeEl = notice ? (
    <p
      className={`${styles.notice} ${
        notice.kind === "error" ? styles.noticeError : notice.kind === "ok" ? styles.noticeOk : ""
      }`}
    >
      {notice.text}
    </p>
  ) : null;

  if (loading) {
    return <main className={access.page} />;
  }

  if (!installer) {
    return (
      <main className={access.page}>
        <div className={access.card}>
          <div className={access.header}>
            <div className={access.brandBlock}>
              <Image
                src={LOGO_SRC}
                alt="Inspired Closets"
                width={88}
                height={81}
                className={access.logo}
                priority
                unoptimized
              />
              <p className={access.eyebrow}>Inspired Closets · private preview</p>
            </div>
            <h1 className={access.title}>Installer Login</h1>
            <p className={access.lead}>
              Sign in with your phone number and password
            </p>
          </div>
          <form
            className={access.form}
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <input
              className={access.input}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-label="Phone number"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone number"
              required
            />
            <input
              className={access.input}
              type="password"
              autoComplete="current-password"
              aria-label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
            />
            {notice?.kind === "error" ? <p className={access.error}>{notice.text}</p> : null}
            <button
              className={access.button}
              type="submit"
              disabled={busy || !phone.trim() || !password.trim()}
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              className={access.buttonGhost}
              type="button"
              disabled={busy}
              onClick={() => void signInTest()}
            >
              Continue as test installer
            </button>
          </form>
        </div>
      </main>
    );
  }

  const profile = meProfile;

  return (
    <div className={styles.page}>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className={styles.avatarFileInput}
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadAvatar(file);
          event.target.value = "";
        }}
      />
      {!online ? (
        <div className={styles.offlineBanner}>You’re offline — clocks and issues will sync when you’re back.</div>
      ) : null}

      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
        <div className={styles.topbarLeft}>
          <button
            type="button"
            className={styles.topbarLogo}
            aria-label="Home"
            onClick={() => goToTab("today")}
          >
            <InspiredClosetsLogo compact />
          </button>
          <nav className={styles.topbarNav} aria-label="Installers">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.topbarLink} ${tab === item.id ? styles.topbarLinkActive : ""}`}
                onClick={() => goToTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className={styles.topbarActions}>
          <div className={styles.menuAnchor} ref={bellRef}>
            <button
              type="button"
              className={`${styles.bellBtn} ${bellOpen ? styles.bellBtnOpen : ""}`}
              onClick={toggleBell}
              aria-label="Notifications"
              aria-expanded={bellOpen}
            >
              <BellIcon />
              {unreadCount > 0 ? <span className={styles.bellDot}>{unreadCount}</span> : null}
            </button>
            {bellOpen ? (
              <div className={styles.dropdown} role="menu" aria-label="Notifications">
                <p className={styles.dropdownTitle}>Notifications</p>
                {feed.length === 0 ? (
                  <p className={styles.dropdownEmpty}>Nothing new yet.</p>
                ) : (
                  feed.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => goToFeedItem(item.key)}
                    >
                      <span
                        className={`${styles.feedTag} ${
                          item.kind === "update" ? styles.feedTagCompany : styles.feedTagPersonal
                        }`}
                      >
                        {item.kind === "update" ? "Company update" : "Personal"}
                      </span>
                      <strong>{item.title}</strong>
                      <span>{formatStamp(item.created_at)}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <div className={styles.menuAnchor} ref={profileMenuRef}>
            {profile ? (
              <button
                type="button"
                className={styles.avatarBtn}
                aria-label="Account"
                aria-expanded={profileMenuOpen}
                onClick={() => {
                  setProfileMenuOpen((open) => !open);
                  setBellOpen(false);
                }}
              >
                <Avatar profile={profile} />
              </button>
            ) : null}
            {profileMenuOpen ? (
              <div className={`${styles.dropdown} ${styles.dropdownNarrow}`} role="menu">
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={openAvatarPicker}
                >
                  Change photo
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setTab("me");
                    setProfileMenuOpen(false);
                  }}
                >
                  View profile
                </button>
                <button type="button" className={styles.dropdownItem} onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
        </div>
      </header>

      <div className={styles.shell}>
      <div className={`${styles.body} ${tab === "today" || tab === "vehicle" ? styles.bodyHome : ""} ${tab === "schedule" ? styles.bodyMonth : ""} ${tab === "jobs" ? styles.bodyJobs : ""}`}>
      {noticeEl}

      {tab === "today" && profile ? (
        <div className={styles.homeGrid}>
          <div className={styles.homeLeft}>
          <section className={`${styles.dashCard} ${styles.profileCol}`}>
            <div className={styles.profileHero}>
              <AvatarPicker profile={profile} xl disabled={busy} onPick={openAvatarPicker} />
              <div className={styles.profileCopy}>
                <h2 className={styles.profileNameLg}>{profile.name}</h2>
                <p className={styles.profileRole}>{profile.title}</p>
                <span className={`${styles.statusPill} ${clockedJob ? styles.statusOn : ""}`}>
                  {clockedJob
                    ? `On site · ${formatDuration(clockedJob.openClock!.clock_in_at, null, nowTick)}`
                    : "Off the clock"}
                </span>
              </div>
            </div>
            <dl className={`${styles.statList} ${styles.profileStats}`}>
              <div>
                <dt>Phone</dt>
                <dd>{profile.phone ?? "No phone"}</dd>
              </div>
              <div>
                <dt>On the crew</dt>
                <dd>{profile.tenureLabel}</dd>
              </div>
              <div>
                <dt>Installs done</dt>
                <dd>{profile.stats.installsCompleted}</dd>
              </div>
            </dl>
            <div className={styles.profileActions}>
              <button
                type="button"
                className={styles.btnOk}
                disabled={busy || !nextJob || Boolean(clockedJob)}
                onClick={() => void clock("in", nextJob ?? undefined)}
              >
                Clock in
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={busy || !clockedJob}
                onClick={() => void clock("out", clockedJob ?? undefined)}
              >
                Clock out
              </button>
            </div>
          </section>

          <div className={styles.homeCal}>
            <InstallerHomeCalendar
              jobs={myJobs}
              timeOff={timeOff}
              onOpenJob={(jobId) => openJobSurface(jobId)}
            />
          </div>
          </div>

          <div className={styles.feedStack}>
          <div className={styles.vehicleCol}>
            <FieldVehicleCard snapshot={vehicleSnap} busy={busy} onLog={saveVehicleLog} />
          </div>
          <section className={`${styles.dashCard} ${styles.feedCol}`} aria-label="Updates and notices">
            <p className={styles.colLabel}>Updates</p>
            {feed.length === 0 ? (
              <p className={styles.empty}>
                Company notes and your PTO, crew, and pay replies will land here.
              </p>
            ) : (
              <div className={styles.feedList}>
                {feed.map((item) => (
                  <article
                    key={item.key}
                    id={item.key}
                    className={`${styles.feedCard} ${highlightId === item.key ? styles.feedCardFocus : ""} ${
                      item.kind === "notice" && !item.read_at ? styles.feedCardUnread : ""
                    }`}
                  >
                    <div className={styles.feedCardTop}>
                      <span
                        className={`${styles.feedTag} ${
                          item.kind === "update" ? styles.feedTagCompany : styles.feedTagPersonal
                        }`}
                      >
                        {item.kind === "update" ? "Company update" : "Personal notification"}
                      </span>
                      <time className={styles.historyDate}>{formatStamp(item.created_at)}</time>
                    </div>
                    <h3 className={styles.jobName}>{item.title}</h3>
                    <p className={styles.jobMeta} style={{ whiteSpace: "pre-wrap" }}>
                      {item.body}
                    </p>
                    {item.kind === "update" && item.author_name ? (
                      <p className={styles.feedAuthor}>{item.author_name}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
          </div>

          <div className={styles.quickStack}>
          <aside className={`${styles.dashCard} ${styles.quickCol}`}>
            <p className={styles.colLabel}>Quick context</p>
            <dl className={styles.statList}>
              <div>
                <dt>Next job</dt>
                <dd>{nextJob?.client?.name ?? "None on deck"}</dd>
                <p className={styles.statHint}>
                  {nextJob
                    ? [formatDay(nextJob.install_date), nextJob.visit_window].filter(Boolean).join(" · ") || "Date TBD"
                    : "When Des books you, it shows here."}
                </p>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.packetBtn}`}
                  disabled={!packetJob}
                onClick={() => {
                  if (!packetJob) return;
                  openJobSurface(packetJob.id);
                }}
                >
                  Open job packet
                </button>
              </div>
              <div>
                <dt>Hours this week</dt>
                <dd>{formatMinutes(hoursThisWeek)}</dd>
              </div>
            </dl>
            <p className={styles.colLabel}>Recent jobs</p>
            {recentJobs.length === 0 ? (
              <p className={styles.empty}>No jobs on your list yet.</p>
            ) : (
              <ul className={styles.recentList}>
                {recentJobs.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      className={styles.recentItem}
                      onClick={() => openJobSurface(job.id)}
                    >
                      <strong>{job.client?.name ?? "Job"}</strong>
                      <span>
                        {formatDay(job.install_date)} · {stageLabel(job.stage)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          </div>
        </div>
      ) : null}

      {tab === "schedule" ? (
        <InstallerMonthPage
          jobs={myJobs}
          timeOff={timeOff}
          onOpenJob={(jobId) => openJobSurface(jobId)}
        />
      ) : null}

      {tab === "vehicle" ? (
        <FieldVehicleTab
          snapshot={vehicleSnap}
          busy={busy}
          jobNames={vehicleJobNames}
          onLog={saveVehicleLog}
        />
      ) : null}

      {tab === "jobs" && !jobsShowPacketFirst ? (
        <div className={styles.jobsBoard}>
          {nextBoardJob ? (
            <button
              type="button"
              className={`${styles.dashCard} ${styles.jobsHero}`}
              onClick={() => openScheduledJob(nextBoardJob.id)}
            >
              <div className={styles.jobsHeroTop}>
                <p className={styles.colLabel}>Next job</p>
                <span className={`${styles.chip} ${jobKindClass(nextBoardJob.job_kind)}`}>
                  {jobKindLabel(nextBoardJob.job_kind)}
                </span>
              </div>
              <h2 className={styles.jobsHeroName}>{nextBoardJob.client?.name ?? "Job"}</h2>
              <p className={styles.jobsHeroMeta}>
                {[formatDay(nextBoardJob.install_date), nextBoardJob.visit_window, stageLabel(nextBoardJob.stage)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {nextBoardJob.client?.address ? (
                <p className={styles.jobsHeroMeta}>{nextBoardJob.client.address}</p>
              ) : null}
              <span className={styles.jobsHeroCta}>Open job packet</span>
            </button>
          ) : (
            <section className={`${styles.dashCard} ${styles.jobsHero}`}>
              <p className={styles.colLabel}>Next job</p>
              <h2 className={styles.jobsHeroName}>Nothing on deck</h2>
              <p className={styles.jobsHeroMeta}>When Des books you, the next install lands here.</p>
            </section>
          )}

          {laterJobs.length > 0 ? (
            <section>
              <p className={styles.colLabel}>Coming up</p>
              <div className={styles.jobsPair}>
                {laterJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className={`${styles.dashCard} ${styles.jobTile}`}
                    onClick={() => openScheduledJob(job.id)}
                  >
                    <div className={styles.jobsHeroTop}>
                      <p className={styles.colLabel}>{stageLabel(job.stage)}</p>
                      <span className={`${styles.chip} ${jobKindClass(job.job_kind)}`}>
                        {jobKindLabel(job.job_kind)}
                      </span>
                    </div>
                    <h3 className={styles.jobTileName}>{job.client?.name ?? "Job"}</h3>
                    <p className={styles.jobMeta}>
                      {[formatDay(job.install_date), job.visit_window].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <p className={styles.colLabel}>Past jobs</p>
            {pastJobs.length === 0 ? (
              <p className={styles.empty}>Completed installs will show here.</p>
            ) : (
              <div className={styles.jobsQuad}>
                {pastJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className={`${styles.dashCard} ${styles.jobTile} ${styles.jobTilePast}`}
                    onClick={() => void openReview(job.id)}
                  >
                    <p className={styles.colLabel}>{stageLabel(job.stage)}</p>
                    <h3 className={styles.jobTileName}>{job.client?.name ?? "Job"}</h3>
                    <p className={styles.jobMeta}>{formatDay(job.install_date)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === "jobs" && jobsShowPacketFirst ? (
        <div className={styles.jobsPacketView} id="installer-job-packet">
          <div className={styles.packetToolbar}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setJobsShowPacketFirst(false)}
            >
              ← All jobs
            </button>
            {workJob ? (
              <div className={styles.packetToolbarActions}>
                <span className={`${styles.chip} ${jobKindClass(workJob.job_kind)}`}>
                  {jobKindLabel(workJob.job_kind)}
                </span>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setAddInstallerOpen(true)}
                >
                  Add installer
                </button>
              </div>
            ) : null}
          </div>

          {workJob ? (
            <>
              <nav className={styles.packetJump} aria-label="Packet sections">
                {[
                  { id: "packet-brief", label: "Brief" },
                  { id: "packet-photos", label: "Photos" },
                  { id: "packet-notes", label: "Notes" },
                  { id: "packet-parts", label: "Parts" },
                  { id: "packet-issue", label: "Issue" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.packetJumpBtn}
                    onClick={() =>
                      document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className={styles.packetLayout}>
                <div className={styles.packetBriefCol}>
                  <section className={styles.dashCard} id="packet-brief">
                    <p className={styles.colLabel}>Job packet</p>
                    <h2 className={styles.packetTitle}>{workJob.client?.name ?? "Job"}</h2>
                    <p className={styles.packetLead}>
                      {[workJob.install_date ? formatDay(workJob.install_date) : null, workJob.visit_window]
                        .filter(Boolean)
                        .join(" · ") || "Date TBD"}
                    </p>
                    {(workJob.client?.phone || workJob.client?.address) ? (
                      <div className={styles.packetActions}>
                        {workJob.client?.phone ? (
                          <a className={styles.packetActionBtn} href={`tel:${workJob.client.phone}`}>
                            Call
                          </a>
                        ) : null}
                        {workJob.client?.address ? (
                          <a
                            className={styles.packetActionBtn}
                            href={`https://maps.google.com/?q=${encodeURIComponent(workJob.client.address)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Directions
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    {workJob.client?.address ? (
                      <p className={styles.packetAddress}>{workJob.client.address}</p>
                    ) : null}
                    {workJob.client?.phone ? (
                      <p className={styles.packetAddress}>
                        <a href={`tel:${workJob.client.phone}`}>{workJob.client.phone}</a>
                      </p>
                    ) : null}

                    <OfficePacket notes={workJob.notes} />

                    <div className={styles.packetBlock}>
                      <h3 className={styles.packetSection}>Crew</h3>
                      <p className={styles.packetBody}>
                        {crew.length > 0
                          ? crew.map((person) => person.name).join(", ")
                          : "Just you so far."}
                      </p>
                    </div>
                  </section>

                  <section className={`${styles.dashCard} ${styles.packetOpsCard}`} id="packet-parts">
                    <h3 className={styles.packetSection}>Parts</h3>
                    {(workJob.packet_materials ?? []).length > 0 ? (
                      <ul className={styles.packetPartList}>
                        {(workJob.packet_materials ?? []).map((line) => (
                          <li key={line.id}>
                            <strong>{line.name}</strong>
                            {line.size ? ` · ${line.size}` : ""}
                            {` · ${line.qty}`}
                            {` · ${line.status}`}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {(workJob.packet_slip ?? []).length > 0 ? (
                      <ul className={styles.packetPartList}>
                        {(workJob.packet_slip ?? []).map((line) => (
                          <li key={line.id}>
                            #{line.item_number}
                            {line.description ? ` · ${line.description}` : ""}
                            {` · ${line.received_qty}/${line.qty} on the truck`}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {(workJob.packet_materials ?? []).length === 0 &&
                    (workJob.packet_slip ?? []).length === 0 ? (
                      <p className={styles.packetEmpty}>
                        Warehouse hasn&apos;t kitted this job yet. Parts show here after Receiving and To
                        job.
                      </p>
                    ) : null}

                    <div className={styles.packetParts}>
                      <h3 className={styles.packetSection}>Miles today</h3>
                      <div className={styles.twoCol}>
                        <label className={styles.field} style={{ marginTop: 0 }}>
                          <span className={styles.label}>Out</span>
                          <input
                            className={styles.input}
                            inputMode="numeric"
                            value={milesOut}
                            onChange={(e) => setMilesOut(e.target.value)}
                            placeholder="0"
                          />
                        </label>
                        <label className={styles.field} style={{ marginTop: 0 }}>
                          <span className={styles.label}>Back</span>
                          <input
                            className={styles.input}
                            inputMode="numeric"
                            value={milesBack}
                            onChange={(e) => setMilesBack(e.target.value)}
                            placeholder="0"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        style={{ marginTop: "0.55rem" }}
                        disabled={busy || !vehicleSnap?.vehicle}
                        onClick={() => void saveJobMiles(workJob.id)}
                      >
                        Save miles
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`${styles.btn} ${styles.packetBtn}`}
                      disabled={busy || isPastJob(workJob)}
                      onClick={() => void completeJob()}
                    >
                      Mark install complete
                    </button>
                  </section>
                </div>

                <div className={styles.packetDocCol}>
                  <section className={`${styles.dashCard} ${styles.packetDocCard}`} id="packet-photos">
                    <div className={styles.packetDocHead}>
                      <div>
                        <p className={styles.colLabel}>Document the job</p>
                        <h3 className={styles.packetSection}>Photos</h3>
                        <p className={styles.jobMeta}>
                          Before, during, after — stays on this job for the office.
                        </p>
                      </div>
                      <span className={styles.packetCount}>{media.length}</span>
                    </div>

                    <div className={styles.kindChips} role="group" aria-label="Photo type">
                      {MEDIA_KINDS.map((kind) => (
                        <button
                          key={kind.id}
                          type="button"
                          className={`${styles.kindChip} ${mediaKind === kind.id ? styles.kindChipActive : ""}`}
                          onClick={() => setMediaKind(kind.id)}
                        >
                          {kind.label}
                        </button>
                      ))}
                    </div>

                    <label className={styles.field}>
                      <span className={styles.label}>Caption (optional)</span>
                      <input
                        className={styles.input}
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                        placeholder="What should the office know?"
                      />
                    </label>

                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*,video/*"
                      capture="environment"
                      multiple
                      className={styles.avatarFileInput}
                      disabled={busy || photoBusy}
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files?.length) void uploadPhotos(files);
                        e.target.value = "";
                      }}
                    />

                    <div className={styles.photoActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.photoPrimary}`}
                        disabled={busy || photoBusy}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {photoBusy ? "Uploading…" : "Take / add photos"}
                      </button>
                    </div>

                    {media.length > 0 ? (
                      <div className={styles.mediaGrid}>
                        {media.map((item) =>
                          item.public_url ? (
                            <figure key={item.id} className={styles.mediaFigure}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.public_url}
                                alt={item.caption || item.kind}
                                className={styles.mediaThumb}
                              />
                              <figcaption className={styles.mediaCaption}>
                                <span>{mediaKindLabel(item.kind)}</span>
                                {item.caption ? <span>{item.caption}</span> : null}
                              </figcaption>
                            </figure>
                          ) : null,
                        )}
                      </div>
                    ) : (
                      <p className={styles.packetEmpty}>No photos yet — snap the room before you start.</p>
                    )}
                  </section>

                  <section className={styles.dashCard} id="packet-notes">
                    <h3 className={styles.packetSection}>Your notes</h3>
                    <p className={styles.jobMeta}>
                      What you did, what’s left, what the customer said.
                    </p>
                    <textarea
                      className={`${styles.textarea} ${styles.packetNotesArea}`}
                      value={fieldNotes}
                      onChange={(e) => setFieldNotes(e.target.value)}
                      placeholder="Site notes, what’s left, what the customer said…"
                    />
                    <button
                      type="button"
                      className={styles.btn}
                      style={{ marginTop: "0.65rem" }}
                      disabled={busy}
                      onClick={() => void saveNotes()}
                    >
                      Save notes
                    </button>
                  </section>

                  <section className={styles.dashCard} id="packet-issue">
                    <h3 className={styles.packetSection}>Report an issue</h3>
                    <select
                      className={styles.select}
                      value={issueType}
                      onChange={(e) => setIssueType(e.target.value)}
                    >
                      {ISSUE_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className={styles.textarea}
                      style={{ marginTop: "0.55rem" }}
                      value={issueText}
                      onChange={(e) => setIssueText(e.target.value)}
                      placeholder="Site not ready, missing hardware…"
                    />
                    <button
                      type="button"
                      className={`${styles.btnDanger} ${styles.full}`}
                      style={{ marginTop: "0.65rem", width: "100%" }}
                      disabled={busy || !issueText.trim()}
                      onClick={() => void reportIssue()}
                    >
                      Flag to office
                    </button>
                    {issues.map((issue) => (
                      <p key={issue.id} className={styles.jobMeta}>
                        · {issue.issue_type.replace(/_/g, " ")} — {issue.description}
                      </p>
                    ))}
                  </section>
                </div>
              </div>
            </>
          ) : (
            <section className={styles.dashCard}>
              <p className={styles.colLabel}>Job packet</p>
              <h2 className={styles.jobName}>No install on deck</h2>
              <p className={styles.jobMeta}>When Des books you, the packet lands here.</p>
            </section>
          )}
        </div>
      ) : null}

      {addInstallerOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setAddInstallerOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modalCard}
            role="dialog"
            aria-labelledby="add-installer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <div>
                <p className={styles.colLabel}>Crew</p>
                <h2 id="add-installer-title" className={styles.jobName}>Add Installer</h2>
                <p className={styles.jobMeta}>
                  Pick who you need. Craig, Des, and Gavin get it in Slack. If they approve, that
                  installer lands on this job and both calendars update.
                </p>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setAddInstallerOpen(false)}>
                Close
              </button>
            </div>
            {crew.length > 0 ? (
              <div className={styles.modalCrew}>
                {crew.map((person) => (
                  <p key={person.id} className={styles.jobMeta}>
                    {person.name}
                    {person.status !== "approved" ? ` · ${person.status}` : ""}
                  </p>
                ))}
              </div>
            ) : (
              <p className={styles.jobMeta}>Just you so far.</p>
            )}
            <label className={styles.field}>
              <span className={styles.label}>Choose installer</span>
              <select className={styles.select} value={helperId} onChange={(e) => setHelperId(e.target.value)}>
                <option value="">Choose someone</option>
                {crewOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`${styles.btn} ${styles.packetBtn}`}
              disabled={busy || !helperId}
              onClick={() => void requestHelper()}
            >
              Send to Craig, Des, and Gavin
            </button>
          </div>
        </div>
      ) : null}

      {reviewJob ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setReviewJobId(null)}
          role="presentation"
        >
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-labelledby="past-packet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <div>
                <p className={styles.colLabel}>Job packet</p>
                <h2 id="past-packet-title" className={styles.packetTitle}>{reviewJob.client?.name ?? "Job"}</h2>
                {reviewJob.client?.address ? (
                  <p className={styles.packetLead}>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(reviewJob.client.address)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {reviewJob.client.address}
                    </a>
                  </p>
                ) : null}
                <p className={styles.packetLead}>
                  {reviewJob.client?.phone ? (
                    <a href={`tel:${reviewJob.client.phone}`}>{reviewJob.client.phone}</a>
                  ) : null}
                  {reviewJob.client?.phone && (reviewJob.install_date || reviewJob.visit_window) ? " · " : null}
                  {[reviewJob.install_date ? formatDay(reviewJob.install_date) : null, reviewJob.visit_window]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setReviewJobId(null)}>
                Close
              </button>
            </div>
            {reviewBusy ? <p className={styles.packetEmpty}>Loading packet…</p> : null}
            <OfficePacket notes={reviewJob.notes} />
            <div className={styles.packetBlock}>
              <h3 className={styles.packetSection}>Crew</h3>
              <p className={styles.packetBody}>
                {reviewCrew.length > 0 ? reviewCrew.map((person) => person.name).join(", ") : "Just you"}
              </p>
            </div>
            <div className={styles.packetBlock}>
              <h3 className={styles.packetSection}>Your notes</h3>
              {reviewJob.field_notes ? (
                <p className={styles.packetBody} style={{ whiteSpace: "pre-wrap" }}>{reviewJob.field_notes}</p>
              ) : (
                <p className={styles.packetEmpty}>None on this job.</p>
              )}
            </div>
            <div className={styles.packetBlock}>
              <h3 className={styles.packetSection}>Photos</h3>
              {reviewMedia.length > 0 ? (
                <div className={styles.mediaGrid}>
                  {reviewMedia.map((item) =>
                    item.public_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={item.id} src={item.public_url} alt={item.caption || item.kind} className={styles.mediaThumb} />
                    ) : null,
                  )}
                </div>
              ) : (
                <p className={styles.packetEmpty}>No photos saved.</p>
              )}
            </div>
            <div className={styles.packetBlock}>
              <h3 className={styles.packetSection}>Issues</h3>
              {reviewIssues.length === 0 ? (
                <p className={styles.packetEmpty}>No issues reported.</p>
              ) : (
                <ul className={styles.packetNoteList}>
                  {reviewIssues.map((issue) => (
                    <li key={issue.id}>
                      {issue.issue_type.replace(/_/g, " ")} — {issue.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "me" && profile ? (
        <>
          <section className={styles.card}>
            <div className={styles.meHead}>
              <AvatarPicker profile={profile} large disabled={busy} onPick={openAvatarPicker} />
              <div>
                <h2 className={styles.jobName}>{profile.name}</h2>
                <p className={styles.jobMeta}>
                  {profile.title} · {profile.tenureLabel}
                </p>
                <p className={styles.jobMeta}>{profile.phone ?? "No phone"}</p>
                <p className={styles.jobMeta}>This week {formatMinutes(hoursThisWeek)}</p>
              </div>
            </div>
            <button type="button" className={styles.avatarUpload} disabled={busy} onClick={openAvatarPicker}>
              Change photo
            </button>
          </section>

          <section className={styles.card}>
            <h3 className={styles.jobName}>Pay</h3>
            <p className={styles.jobMeta}>
              Last pay {money(pay?.last_pay_cents ?? 0)}
              {pay?.last_pay_date ? ` · ${formatDay(pay.last_pay_date)}` : ""}
            </p>
            <p className={styles.jobMeta}>Next pay {formatDay(pay?.next_pay_date ?? null)}</p>
            <p className={styles.jobMeta}>
              {pay?.classification === "1099" ? "1099" : pay?.classification === "w2" ? "W-2" : "Classification TBD"}
              {pay?.bank_last4 ? ` · account ···${pay.bank_last4}` : " · no deposit on file"}
            </p>
            <label className={styles.field}>
              <span className={styles.label}>Routing</span>
              <input className={styles.input} inputMode="numeric" value={routing} onChange={(e) => setRouting(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Account</span>
              <input className={styles.input} inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value)} />
            </label>
            <button
              type="button"
              className={styles.btnGhost}
              style={{ marginTop: "0.65rem" }}
              disabled={busy || account.replace(/\D/g, "").length < 4}
              onClick={() => void saveMe({ routing_number: routing, account_number: account })}
            >
              Send new deposit info to Lulu
            </button>
          </section>

          <section className={styles.card}>
            <h3 className={styles.jobName}>PTO / sick</h3>
            <div className={styles.twoCol}>
              <label className={styles.field} style={{ marginTop: 0 }}>
                <span className={styles.label}>Type</span>
                <select className={styles.select} value={ptoKind} onChange={(e) => setPtoKind(e.target.value as "pto" | "sick")}>
                  <option value="pto">PTO</option>
                  <option value="sick">Sick</option>
                </select>
              </label>
              <label className={styles.field} style={{ marginTop: 0 }}>
                <span className={styles.label}>Start</span>
                <input className={styles.input} type="date" value={ptoStart} onChange={(e) => setPtoStart(e.target.value)} />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>End</span>
              <input className={styles.input} type="date" value={ptoEnd} onChange={(e) => setPtoEnd(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Note</span>
              <input className={styles.input} value={ptoNote} onChange={(e) => setPtoNote(e.target.value)} placeholder="Optional" />
            </label>
            <button type="button" className={styles.btn} style={{ marginTop: "0.75rem" }} disabled={busy || !ptoStart} onClick={() => void submitPto()}>
              Send to Gavin
            </button>
            {timeOff.map((row) => (
              <p key={row.id} className={styles.jobMeta}>
                {row.kind === "sick" ? "Sick" : "PTO"} {formatDay(row.start_date)}
                {row.end_date !== row.start_date ? ` → ${formatDay(row.end_date)}` : ""} · {row.status}
              </p>
            ))}
          </section>

          <section className={styles.card}>
            <h3 className={styles.jobName}>Home & emergency</h3>
            <label className={styles.field}>
              <span className={styles.label}>Home address</span>
              <input className={styles.input} value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Emergency name</span>
              <input className={styles.input} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Emergency phone</span>
              <input className={styles.input} inputMode="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Relation</span>
              <input className={styles.input} value={emergencyRelation} onChange={(e) => setEmergencyRelation(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Truck today</span>
              <input className={styles.input} value={truckLabel} onChange={(e) => setTruckLabel(e.target.value)} placeholder="Van 2 / white box" />
            </label>
            <button type="button" className={styles.btn} style={{ marginTop: "0.75rem" }} disabled={busy} onClick={() => void saveMe()}>
              Save
            </button>
          </section>

          <section className={styles.card}>
            <h3 className={styles.jobName}>Documents</h3>
            {documents.length === 0 ? (
              <p className={styles.jobMeta}>Handbook and W-2 / 1099 will live here. Lulu uploads tax forms later.</p>
            ) : (
              documents.map((doc) =>
                doc.public_url ? (
                  <a key={doc.id} className={styles.docLink} href={doc.public_url}>
                    {doc.title}
                  </a>
                ) : (
                  <p key={doc.id} className={styles.jobMeta}>
                    {doc.title} — not uploaded yet
                  </p>
                ),
              )
            )}
          </section>

          <button type="button" className={`${styles.btnGhost} ${styles.full}`} style={{ width: "100%" }} onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : null}
      </div>
      </div>

      <nav className={styles.tabBar} aria-label="Installers">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.tabBarBtn} ${tab === item.id ? styles.tabBarBtnOn : ""}`}
            onClick={() => goToTab(item.id)}
          >
            <TabIcon id={item.id} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
