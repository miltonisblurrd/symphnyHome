/**
 * Synthetic Inspired Closets Las Vegas demo data for Gavin's executive dashboard prototype.
 * All figures are sample data for layout and priority feedback — not live business data.
 */

export type AttentionSeverity = "critical" | "warning" | "info";
export type JobStage =
  | "Quoted"
  | "Deposit Pending"
  | "Job Check"
  | "Ordering"
  | "Install Scheduled"
  | "Install Complete"
  | "Final Payment"
  | "Complete";

export type ExceptionType =
  | "Unmatched Payment"
  | "Missing Stow Invoice"
  | "Unusual Fee"
  | "Duplicate Risk"
  | "Spiff Approval";

export const gavinDemoMeta = {
  prototypeLabel: "Prototype · sample data",
  company: "Inspired Closets Las Vegas",
  viewer: "Gavin Grundmeier",
  role: "Executive",
  updatedAt: "Jul 16, 2026 · 9:14 AM",
  periodOptions: ["This week", "This month", "This quarter", "YtD", "YoY"] as const,
  marginGate: 45,
  chatBrand: {
    name: "Cubby",
    title: "Ask Cubby",
    badge: "Cubby says",
    intro:
      "Hi Gavin! I'm Cubby — your little ops sidekick. Ask me about jobs, money, margins, or what's lighting up in attention today. Tap a bubble or type whatever's on your mind.",
    placeholder: "What's on your mind, Gavin?",
    sendLabel: "Send",
  },
  feedbackPrompt:
    "Tell Milton what you want first after login, what can move lower, and what is missing.",
} as const;

export type GavinPeriod = (typeof gavinDemoMeta.periodOptions)[number];

export type MetricDelta = {
  value: string;
  direction: "up" | "down" | "flat";
};

export type FinancialPulseSnapshot = {
  sales: number;
  cashCollected: number;
  outstandingBalances: number;
  avgMargin: number;
  unverifiedCosts: number;
  jobsBelowMarginGate: number;
  bankBalance: number;
  spiffsPending: number;
  metricNotes: {
    sales: string;
    cashCollected: string;
    outstanding: string;
    avgMargin: string;
    unverifiedCosts: string;
    belowGate: string;
  };
  deltas?: {
    sales?: MetricDelta;
    cashCollected?: MetricDelta;
    outstanding?: MetricDelta;
    avgMargin?: MetricDelta;
    unverifiedCosts?: MetricDelta;
    belowGate?: MetricDelta;
  };
};

export type SalesVsLaborPoint = {
  date: string;
  label: string;
  actualSales: number;
  actualLabor: number;
  projectedSales: number;
};

const periodSnapshots: Record<GavinPeriod, FinancialPulseSnapshot> = {
  "This week": {
    sales: 186400,
    cashCollected: 124850,
    outstandingBalances: 41200,
    avgMargin: 48.2,
    unverifiedCosts: 8200,
    jobsBelowMarginGate: 3,
    bankBalance: 97240,
    spiffsPending: 6400,
    metricNotes: {
      sales: "This week",
      cashCollected: "Podium activity",
      outstanding: "Customer balances",
      avgMargin: "Gate: 45%",
      unverifiedCosts: "Needs itemized invoices",
      belowGate: "3 active jobs blocked",
    },
    deltas: {
      sales: { value: "+8.2%", direction: "up" },
      cashCollected: { value: "+4.1%", direction: "up" },
      outstanding: { value: "+2.4%", direction: "up" },
      avgMargin: { value: "+0.6%", direction: "up" },
      unverifiedCosts: { value: "−12%", direction: "down" },
      belowGate: { value: "−1", direction: "down" },
    },
  },
  "This month": {
    sales: 748200,
    cashCollected: 502400,
    outstandingBalances: 52800,
    avgMargin: 47.8,
    unverifiedCosts: 24600,
    jobsBelowMarginGate: 5,
    bankBalance: 97240,
    spiffsPending: 12800,
    metricNotes: {
      sales: "Jul 1–16 · on pace for $1.42M",
      cashCollected: "67% collected vs sales",
      outstanding: "Open AR across active jobs",
      avgMargin: "Gate: 45% · −0.4 pts vs week",
      unverifiedCosts: "6 vendor invoices open",
      belowGate: "5 active jobs blocked",
    },
    deltas: {
      sales: { value: "+11%", direction: "up" },
      cashCollected: { value: "+6.2%", direction: "up" },
      outstanding: { value: "+3.1%", direction: "up" },
      avgMargin: { value: "−0.4%", direction: "down" },
      unverifiedCosts: { value: "+5%", direction: "up" },
      belowGate: { value: "+2", direction: "up" },
    },
  },
  "This quarter": {
    sales: 2184000,
    cashCollected: 1462800,
    outstandingBalances: 58400,
    avgMargin: 47.4,
    unverifiedCosts: 41200,
    jobsBelowMarginGate: 7,
    bankBalance: 97240,
    spiffsPending: 19200,
    metricNotes: {
      sales: "Q3 to date · +12% vs Q2",
      cashCollected: "67% collection rate",
      outstanding: "Down from $71k at quarter start",
      avgMargin: "Gate: 45% · stable quarter trend",
      unverifiedCosts: "Stow lump sums still recurring",
      belowGate: "7 active jobs blocked",
    },
    deltas: {
      sales: { value: "+12%", direction: "up" },
      cashCollected: { value: "+9%", direction: "up" },
      outstanding: { value: "−18%", direction: "down" },
      avgMargin: { value: "0%", direction: "flat" },
      unverifiedCosts: { value: "+3%", direction: "up" },
      belowGate: { value: "+1", direction: "up" },
    },
  },
  YtD: {
    sales: 4920000,
    cashCollected: 3285000,
    outstandingBalances: 41200,
    avgMargin: 47.1,
    unverifiedCosts: 68400,
    jobsBelowMarginGate: 11,
    bankBalance: 97240,
    spiffsPending: 22400,
    metricNotes: {
      sales: "Jan 1–Jul 16 · 47 jobs sold",
      cashCollected: "67% collected YtD",
      outstanding: "Current open balances",
      avgMargin: "Gate: 45% · +1.1 pts vs 2025 YtD",
      unverifiedCosts: "14 invoices held for review",
      belowGate: "11 jobs blocked YtD",
    },
    deltas: {
      sales: { value: "+18%", direction: "up" },
      cashCollected: { value: "+15%", direction: "up" },
      outstanding: { value: "−22%", direction: "down" },
      avgMargin: { value: "+1.1%", direction: "up" },
      unverifiedCosts: { value: "−8%", direction: "down" },
      belowGate: { value: "−2", direction: "down" },
    },
  },
  YoY: {
    sales: 4920000,
    cashCollected: 3285000,
    outstandingBalances: 41200,
    avgMargin: 47.1,
    unverifiedCosts: 68400,
    jobsBelowMarginGate: 11,
    bankBalance: 97240,
    spiffsPending: 22400,
    metricNotes: {
      sales: "+18.4% vs same period 2025",
      cashCollected: "+15.2% vs LY · pace improving",
      outstanding: "−22% vs LY open AR",
      avgMargin: "+1.3 pts vs LY · spiff gate holding",
      unverifiedCosts: "−8% vs LY · fewer lump sums",
      belowGate: "−2 jobs vs LY below gate",
    },
    deltas: {
      sales: { value: "+18.4%", direction: "up" },
      cashCollected: { value: "+15.2%", direction: "up" },
      outstanding: { value: "−22%", direction: "down" },
      avgMargin: { value: "+1.3%", direction: "up" },
      unverifiedCosts: { value: "−8%", direction: "down" },
      belowGate: { value: "−2", direction: "down" },
    },
  },
};

export function getFinancialPulseForPeriod(period: GavinPeriod): FinancialPulseSnapshot {
  return periodSnapshots[period];
}

/** Default week snapshot — use getFinancialPulseForPeriod when period is selected. */
export const financialPulse = periodSnapshots["This week"];

export const assignablePeople = ["Frank", "Des", "Lulu", "Craig", "Marcus", "Gavin"] as const;

export const attentionItems = [
  {
    id: "att-1",
    severity: "critical" as AttentionSeverity,
    title: "Nguyen job stalled in Job Check",
    detail: "Deposit cleared 9 days ago. No owner update since Monday.",
    owner: "Frank",
    amount: 18400,
    action: "Assign owner + due date",
    todoLabel: "Set Nguyen Job Check due date for today",
    todoWhy: "Clears the stalled $18.4k job before it slips another week.",
    defaultAssignee: "Frank",
    notifyMessage:
      "Nguyen Job Check is 9 days past deposit. Please complete measurement verification and set a due date today.",
    context:
      "In the live system, this opens the Nguyen job record, payment trail, and job-check status so you can confirm what Frank has and has not done since deposit cleared.",
  },
  {
    id: "att-2",
    severity: "critical" as AttentionSeverity,
    title: "Overdue final balance — Patel",
    detail: "10% completion payment is 6 days late. Podium link sent twice.",
    owner: "Des",
    amount: 2100,
    action: "Escalate reminder",
    todoLabel: "Call Patel today + send final Podium reminder",
    todoWhy: "Collects the overdue $2,100 completion balance.",
    defaultAssignee: "Des",
    notifyMessage:
      "Patel final 10% ($2,100) is 6 days overdue. Please call today and send a final Podium payment reminder.",
    context:
      "Podium shows the balance still open. QuickBooks may not match yet — this is both a collections and reconciliation issue.",
  },
  {
    id: "att-3",
    severity: "warning" as AttentionSeverity,
    title: "Stow invoice missing itemization",
    detail: "Lump sum $6,480 includes possible pallet/freight fees.",
    owner: "Lulu",
    amount: 6480,
    action: "Request itemized invoice",
    todoLabel: "Hold Morales Stow payment until invoice is itemized",
    todoWhy: "Stops unverified pallet/freight fees from hitting the books.",
    defaultAssignee: "Lulu",
    notifyMessage:
      "Please hold Morales Stow payment ($6,480) until we receive a fully itemized invoice including pallet/freight fees.",
    context:
      "This is one of the unverified cost patterns from the finance review — lump sums can hide fees like the $200 pallet charge Gavin flagged.",
  },
  {
    id: "att-4",
    severity: "warning" as AttentionSeverity,
    title: "Spiff blocked by 45% gate — Morales",
    detail: "Projected margin 41.2% after materials and labor.",
    owner: "Gavin",
    amount: 1800,
    action: "Review before approval",
    todoLabel: "Review Morales margin — approve exception or decline spiff",
    todoWhy: "Enforces the 45% gate before money goes out.",
    defaultAssignee: "Gavin",
    notifyMessage:
      "Morales referral spiff ($1,800) is blocked at 41.2% margin. Needs your approve/decline decision.",
    context:
      "The 45% rule is confirmed. This item stays with Gavin unless he explicitly delegates the exception decision.",
  },
  {
    id: "att-5",
    severity: "info" as AttentionSeverity,
    title: "New email lead in Craig inbox",
    detail: "Henderson remodel inquiry arrived 47 minutes ago. Not in Community yet.",
    owner: "Craig → Des",
    amount: null,
    action: "Capture in Community",
    todoLabel: "Enter Henderson lead into Community",
    todoWhy: "Keeps the Craig-inbox lead from going cold outside the system.",
    defaultAssignee: "Des",
    notifyMessage:
      "New Henderson remodel inquiry landed in Craig’s email 47 min ago. Please capture it in Community now.",
    context:
      "This is the Craig-email lead alert from the finance review — leads that never hit Community are invisible to the rest of the pipeline.",
  },
  {
    id: "att-6",
    severity: "info" as AttentionSeverity,
    title: "4 installs this week",
    detail: "Tue–Fri schedule is full. One site-prep risk on Thursday.",
    owner: "Des",
    amount: null,
    action: "Review schedule",
    todoLabel: "Confirm Brooks flooring/site prep before Thursday",
    todoWhy: "Protects this week’s install schedule from a day-of delay.",
    defaultAssignee: "Des",
    notifyMessage:
      "Brooks install is Thursday. Please confirm flooring/site prep is ready before crew arrival.",
    context:
      "Brooks is the Thursday install with site-prep risk. Confirming early avoids a reschedule and customer friction.",
  },
];

export const jobs = [
  {
    id: "JOB-2408",
    customer: "Nguyen",
    price: 18400,
    stage: "Job Check" as JobStage,
    designer: "Alicia",
    installer: "TBD",
    depositStatus: "Received",
    balanceOwed: 9200,
    margin: 52.1,
    risk: "Stalled 9 days",
    owner: "Frank",
    nextAction: "Complete measurement verification",
  },
  {
    id: "JOB-2411",
    customer: "Patel",
    price: 21000,
    stage: "Final Payment" as JobStage,
    designer: "Marcus",
    installer: "Luis",
    depositStatus: "Received",
    balanceOwed: 2100,
    margin: 49.4,
    risk: "Overdue 6 days",
    owner: "Des",
    nextAction: "Collect completion balance",
  },
  {
    id: "JOB-2414",
    customer: "Morales",
    price: 27800,
    stage: "Ordering" as JobStage,
    designer: "Alicia",
    installer: "TBD",
    depositStatus: "Received",
    balanceOwed: 13900,
    margin: 41.2,
    risk: "Below 45% gate",
    owner: "Craig",
    nextAction: "Confirm Studio order + margin review",
  },
  {
    id: "JOB-2417",
    customer: "Brooks",
    price: 15200,
    stage: "Install Scheduled" as JobStage,
    designer: "Jordan",
    installer: "Diego",
    depositStatus: "Received",
    balanceOwed: 7600,
    margin: 51.8,
    risk: "Site prep Thursday",
    owner: "Des",
    nextAction: "Confirm flooring ready",
  },
  {
    id: "JOB-2419",
    customer: "Kim",
    price: 9600,
    stage: "Deposit Pending" as JobStage,
    designer: "Marcus",
    installer: "TBD",
    depositStatus: "Awaiting",
    balanceOwed: 9600,
    margin: 55.0,
    risk: "Agreement signed, no deposit",
    owner: "Marcus",
    nextAction: "Send / confirm Podium deposit link",
  },
  {
    id: "JOB-2420",
    customer: "Rivera",
    price: 22400,
    stage: "Quoted" as JobStage,
    designer: "Jordan",
    installer: "TBD",
    depositStatus: "Not started",
    balanceOwed: 22400,
    margin: null,
    risk: "Follow-up due today",
    owner: "Jordan",
    nextAction: "Close or schedule next step",
  },
  {
    id: "JOB-2402",
    customer: "Chen",
    price: 18750,
    stage: "Install Complete" as JobStage,
    designer: "Alicia",
    installer: "Luis",
    depositStatus: "Received",
    balanceOwed: 1875,
    margin: 47.6,
    risk: "Final 10% due",
    owner: "Des",
    nextAction: "Trigger final payment from Slack completion",
  },
  {
    id: "JOB-2398",
    customer: "Walsh",
    price: 31200,
    stage: "Complete" as JobStage,
    designer: "Marcus",
    installer: "Diego",
    depositStatus: "Received",
    balanceOwed: 0,
    margin: 46.1,
    risk: "None",
    owner: "Lulu",
    nextAction: "Close books + archive docs",
  },
];

export const financeExceptions = [
  {
    id: "ex-1",
    type: "Unmatched Payment" as ExceptionType,
    customer: "Patel",
    amount: 2100,
    detail: "Podium shows paid. QuickBooks still open.",
    status: "Needs match",
  },
  {
    id: "ex-2",
    type: "Missing Stow Invoice" as ExceptionType,
    customer: "Morales",
    amount: 6480,
    detail: "Order placed in Studio. No itemized invoice received.",
    status: "Waiting on Stow",
  },
  {
    id: "ex-3",
    type: "Unusual Fee" as ExceptionType,
    customer: "Brooks",
    amount: 200,
    detail: "Pallet fee previously buried in lump sum.",
    status: "Flagged",
  },
  {
    id: "ex-4",
    type: "Duplicate Risk" as ExceptionType,
    customer: "Vendor · Dixon",
    amount: 1250,
    detail: "Same payout amount appears on two dates in payroll records.",
    status: "Review",
  },
  {
    id: "ex-5",
    type: "Spiff Approval" as ExceptionType,
    customer: "Morales",
    amount: 1800,
    detail: "Referral spiff requested. Margin 41.2% — blocked by 45% gate.",
    status: "Blocked",
  },
];

export const leads = [
  {
    id: "LD-881",
    name: "Henderson remodel",
    source: "Craig email",
    stage: "New",
    owner: "Unassigned",
    age: "47 min",
    designer: "—",
    risk: "Not in Community",
  },
  {
    id: "LD-879",
    name: "Sato · 3 closets",
    source: "Phone",
    stage: "Needs follow-up",
    owner: "Des",
    age: "2 days",
    designer: "—",
    risk: "Attempt 2 of 5",
  },
  {
    id: "LD-874",
    name: "Owens · garage + pantry",
    source: "Google",
    stage: "Appointment set",
    owner: "Des",
    age: "1 day",
    designer: "Alicia",
    risk: "Confirm day-of",
  },
  {
    id: "LD-870",
    name: "Prieto",
    source: "Instagram",
    stage: "New",
    owner: "Des",
    age: "5 hrs",
    designer: "—",
    risk: "Manual Community entry",
  },
  {
    id: "LD-865",
    name: "Ballard referral",
    source: "Referral",
    stage: "Schedule",
    owner: "Des",
    age: "3 days",
    designer: "Marcus",
    risk: "Source accuracy check",
  },
];

export const schedule = {
  consultations: [
    { when: "Today · 11:00 AM", customer: "Owens", designer: "Alicia", location: "On-site" },
    { when: "Tomorrow · 2:00 PM", customer: "Prieto", designer: "Jordan", location: "Showroom" },
  ],
  installs: [
    { when: "Tue · All day", customer: "Ellis", installer: "Luis", note: "On track" },
    { when: "Thu · 8:00 AM", customer: "Brooks", installer: "Diego", note: "Confirm flooring" },
    { when: "Fri · 9:00 AM", customer: "Diaz", installer: "Luis", note: "2-day install" },
  ],
};

export const activityFeed = [
  {
    id: "act-1",
    time: "8:52 AM",
    text: "Podium deposit received for Kim — waiting QuickBooks entry.",
  },
  {
    id: "act-2",
    time: "8:41 AM",
    text: "Craig inbox lead detected: Henderson remodel.",
  },
  {
    id: "act-3",
    time: "Yesterday",
    text: "Stow lump-sum invoice flagged for Morales — itemization requested.",
  },
  {
    id: "act-4",
    time: "Yesterday",
    text: "Nguyen job marked at risk: Job Check overdue.",
  },
  {
    id: "act-5",
    time: "Mon",
    text: "Spiff for Morales blocked — margin below 45%.",
  },
];

export const chatPrompts = [
  "What needs my attention today?",
  "Which jobs are below 45% margin?",
  "Who still owes money?",
  "What Stow costs are unverified?",
  "Which installs are at risk this week?",
  "Any duplicate payment risks?",
];

/** Synthetic daily series for the Sales vs Labor chart — not live business data. */
export const salesVsLabor: SalesVsLaborPoint[] = [
  { date: "2026-07-13", label: "Mon", actualSales: 18200, actualLabor: 6400, projectedSales: 17000 },
  { date: "2026-07-14", label: "Tue", actualSales: 24600, actualLabor: 8200, projectedSales: 22000 },
  { date: "2026-07-15", label: "Wed", actualSales: 21400, actualLabor: 7800, projectedSales: 23000 },
  { date: "2026-07-16", label: "Thu", actualSales: 29800, actualLabor: 9100, projectedSales: 26000 },
  { date: "2026-07-17", label: "Fri", actualSales: 32100, actualLabor: 9800, projectedSales: 28000 },
  { date: "2026-07-18", label: "Sat", actualSales: 18400, actualLabor: 5200, projectedSales: 16000 },
  { date: "2026-07-19", label: "Sun", actualSales: 9200, actualLabor: 2100, projectedSales: 8000 },
  { date: "2026-07-20", label: "Mon", actualSales: 20500, actualLabor: 7100, projectedSales: 19000 },
  { date: "2026-07-21", label: "Tue", actualSales: 26700, actualLabor: 8600, projectedSales: 24000 },
  { date: "2026-07-22", label: "Wed", actualSales: 0, actualLabor: 0, projectedSales: 25000 },
  { date: "2026-07-23", label: "Thu", actualSales: 0, actualLabor: 0, projectedSales: 27000 },
  { date: "2026-07-24", label: "Fri", actualSales: 0, actualLabor: 0, projectedSales: 29000 },
];

export const pipelineCounts = {
  Quoted: jobs.filter((j) => j.stage === "Quoted").length,
  "Deposit Pending": jobs.filter((j) => j.stage === "Deposit Pending").length,
  "Job Check": jobs.filter((j) => j.stage === "Job Check").length,
  Ordering: jobs.filter((j) => j.stage === "Ordering").length,
  "Install Scheduled": jobs.filter((j) => j.stage === "Install Scheduled").length,
  "Install Complete": jobs.filter((j) => j.stage === "Install Complete").length,
  "Final Payment": jobs.filter((j) => j.stage === "Final Payment").length,
  Complete: jobs.filter((j) => j.stage === "Complete").length,
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
