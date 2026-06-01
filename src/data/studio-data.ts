// Symphony Studio - Canonical Data Source
// This file serves as the single source of truth for the MCP server

export const brand = {
  tagline:
    "Symphony Studio helps businesses perform at their best by orchestrating the systems, workflows, and intelligence that drive modern operations.",
  pillars: ["Clarity", "Coordination", "Performance"] as const,
  heroSubhead:
    "We orchestrate the systems, workflows, and intelligence behind how you operate, so talented teams and capable tools perform as one.",
};

/** Symphony metaphor — how we explain what we do (Musicians → Conductor). */
export const symphonyModel = [
  {
    layer: "The Musicians",
    role: "Your tools and systems",
    description:
      "CRMs, calendars, project software, accounting, internal databases, and AI tools. Each is capable alone—but disconnected, they create noise instead of music.",
    examples: ["CRM", "Email & calendar", "Project management", "Accounting", "Internal databases", "AI tools"],
  },
  {
    layer: "The Sheet Music",
    role: "Your workflows and process logic",
    description:
      "The rules, timing, and shared logic everyone follows. Without it, teams improvise—and businesses call that inconsistency, inefficiency, and bottlenecks.",
    examples: ["Process rules", "Routing logic", "Approvals", "Handoffs", "Reporting cadence"],
  },
  {
    layer: "The Performers",
    role: "AI agents in specific roles",
    description:
      "Task-specific intelligence that summarizes, decides, routes, and reports. Performers still need direction—they don't replace the conductor.",
    examples: ["Summarization", "Decision support", "Work routing", "Report generation"],
  },
  {
    layer: "The Orchestra Pit",
    role: "Secure connection to real information",
    description:
      "The governed layer that connects performers to live data and internal systems. Without it, intelligence guesses. With it, intelligence understands.",
    examples: ["Permissioned access", "Audit trails", "Live studio data", "MCP integrations"],
  },
  {
    layer: "The Conductor",
    role: "Symphony Studio",
    description:
      "Not the loudest thing in the room—the thing responsible for coordination, harmony, and performance. We don't sell software, AI, or automation. We orchestrate.",
    examples: ["Cross-system alignment", "Ongoing tuning", "Operational ownership", "Clarity for leadership"],
  },
];

export const services = [
  {
    id: "workflow-automation",
    name: "Workflow & System Orchestration",
    description:
      "We design and operate the sheet music—workflows and logic that align your tools, data, and teams into one coordinated operating system.",
    solves: [
      "Teams working hard but out of sync",
      "Manual handoffs between departments",
      "Disconnected systems and missed follow-ups",
      "Operational bottlenecks and chaos",
    ],
    examples: [
      "Lead intake → qualification → routing → follow-up",
      "Cross-team task orchestration",
      "Reporting and notifications",
      "Approval and escalation flows",
    ],
  },
  {
    id: "ai-agents",
    name: "AI Performers (Decision & Execution)",
    description:
      "We deploy AI agents as directed performers—summarizing, deciding, routing, and reporting within orchestrated workflows, not as disconnected chatbots.",
    solves: [
      "Slow response times",
      "Human bottlenecks on repetitive decisions",
      "Intelligence without coordination (noise)",
    ],
    examples: [
      "Lead qualification agents",
      "Customer support triage",
      "Internal reporting assistants",
      "Ops routing agents",
    ],
  },
  {
    id: "enterprise-orchestration",
    name: "Enterprise Orchestration (The Orchestra Pit)",
    description:
      "For complex or regulated environments, we build the secure orchestration layer—the orchestra pit—that connects AI and workflows to private data and internal systems with governance and auditability.",
    solves: [
      "Why is this taking so long?",
      "Why are teams disconnected?",
      "Why can't leadership see what's happening?",
      "AI blocked by security and fragile integrations",
    ],
    examples: [
      "Secure AI access to internal databases",
      "Permissioned tooling and MCP layers",
      "Human-in-the-loop decision systems",
    ],
  },
];

export const pricing = [
  {
    id: "prelude",
    name: "Prelude",
    price: "$1,750 – $2,500 / month",
    bestFor: "Small service businesses",
    includes: [
      "Ongoing workflow orchestration",
      "1–2 active coordinated workflows at a time",
      "Basic AI performer roles",
      "Monitoring, tuning, and fixes",
      "Monthly optimization cycle",
      "Email support",
    ],
    outcomes: [
      "Clearer coordination across teams",
      "Faster lead response",
      "Fewer missed opportunities",
    ],
  },
  {
    id: "concerto",
    name: "Concerto",
    price: "$3,500 – $5,500 / month",
    bestFor: "Growing teams and scaling operations",
    includes: [
      "Multiple concurrent orchestrated workflows",
      "Advanced AI performers across teams",
      "Priority tuning and optimization",
      "Slack support",
      "Strategic coordination improvements",
    ],
    outcomes: [
      "Operational clarity",
      "Reduced internal friction",
      "Systems that scale with the business",
    ],
  },
  {
    id: "symphony-enterprise",
    name: "Symphony (Enterprise)",
    price: "Custom",
    bestFor: "Enterprise environments requiring security and scale",
    structure: {
      discovery: "$10k–$25k",
      build: "$50k–$200k+",
      managed: "$6k–$15k/month",
    },
    outcomes: [
      "Secure, coordinated AI enablement",
      "Reliable cross-system orchestration",
      "Long-term operational ownership",
    ],
  },
];

export const capabilities = {
  systemIntegration: [
    "CRMs (the musicians)",
    "Calendars & scheduling",
    "Billing & invoicing systems",
    "Internal databases",
    "Legacy systems",
    "APIs and webhooks",
  ],
  automation: [
    "Event-driven workflows (sheet music)",
    "Conditional logic & routing",
    "Approval flows",
    "Notifications and reporting",
    "Error handling and retries",
  ],
  ai: [
    "Task-specific AI performers",
    "Structured decision logic",
    "AI-assisted reporting",
    "Controlled action execution",
  ],
  enterprise: [
    "Access control",
    "Auditability",
    "Governance",
    "Human-in-the-loop workflows",
    "Security-first orchestration layer",
  ],
};

export const caseStudies = [
  {
    id: "hvac-service",
    title: "Service Business (HVAC)",
    clientType: "Local HVAC company",
    problem: "Talented teams and good tools—but missed calls and slow handoffs meant lost revenue",
    solution: [
      "Orchestrated lead capture and routing across sales and ops",
      "AI-assisted follow-up within defined workflows",
      "Centralized scheduling coordination",
    ],
    outcome: [
      "Faster, coordinated response times",
      "Increased booked jobs",
      "Less chaos between departments",
    ],
  },
  {
    id: "agency-growth",
    title: "Growth Company (Agency)",
    clientType: "Multi-client digital agency",
    problem: "Everyone was working; disconnected tools and manual reporting meant leadership couldn't see the whole performance",
    solution: [
      "Orchestrated internal workflows across client delivery",
      "AI-generated performance summaries within one reporting pipeline",
      "Unified visibility for decision-makers",
    ],
    outcome: [
      "Improved internal visibility and coordination",
      "Less manual reconciliation",
      "Faster, clearer decision-making",
    ],
  },
  {
    id: "enterprise-ops",
    title: "Enterprise Operations Team",
    clientType: "Enterprise operations group",
    problem: "Teams were talented and busy—but AI initiatives stalled on access, security, and lack of coordination",
    solution: [
      "Secure orchestration layer (orchestra pit) for governed data access",
      "Permissioned AI performers connected to internal systems",
      "Human-in-the-loop controls at every critical decision",
    ],
    outcome: [
      "Responsible, coordinated AI deployment",
      "Improved operational efficiency",
      "Increased stakeholder trust",
    ],
  },
];

export const contact = {
  email: "hello@symphonystudio.io",
  booking: "https://symphonystudio.io/enterprise",
  location: "Remote / US-based",
  cta: "Book a discovery call",
};

export const faq = [
  {
    question: "What does Symphony Studio actually do?",
    answer:
      "We orchestrate. Most businesses don't have a software problem—they have a coordination problem. We align your tools, workflows, and intelligence so talented teams perform as one coordinated operating system. We don't sell software, AI, or automation—we sell coordination.",
  },
  {
    question: "Is this a one-time project or ongoing service?",
    answer:
      "Symphony is an ongoing relationship, not a one-time rehearsal. Businesses change—new people, new processes, new software. Every performance requires tuning, adjustment, and coordination. That's why we operate on a subscription model with continuous ownership.",
  },
  {
    question: "Do you replace internal teams?",
    answer:
      "No. Individual talent means nothing without coordination. We act as the conductor—your teams remain the musicians. We reduce friction and chaos so people can focus on higher-value work.",
  },
  {
    question: "Why don't you list specific tools or platforms?",
    answer:
      "Because orchestration is about outcomes, not vendors. Your CRM, calendar, and project tools are instruments—we help them play together. We select tools based on fit, not marketing.",
  },
  {
    question: "How long does it take to see results?",
    answer:
      "Most clients see meaningful improvements in coordination and response time within the first 30 days.",
  },
  {
    question: "Why is Enterprise pricing custom?",
    answer:
      "Enterprise environments vary widely in scope, security, and complexity. Accurate pricing requires discovery so coordination, governance, and reliability match your reality.",
  },
  {
    question: "How do you handle sensitive data?",
    answer:
      "Through controlled access, permissions, audit trails, and security-first orchestration—the orchestra pit that connects intelligence to real information without guessing.",
  },
  {
    question: "Is Symphony Studio a good fit for very small teams?",
    answer:
      "Yes—especially service businesses where everyone wears multiple hats and coordination breakdowns show up immediately as missed leads and chaos.",
  },
  {
    question: "What makes Symphony Studio different from automation agencies?",
    answer:
      "Most agencies build automations and disappear. Most AI companies sell intelligence. We orchestrate operations over time—clarity, coordination, performance. Intelligence without coordination creates noise; coordination creates performance.",
  },
  {
    question: "How do we get started?",
    answer:
      "Choose a subscription tier or book an enterprise discovery call. We'll learn where coordination breaks down today and what performance should look like.",
  },
];

// Deep Context - Philosophy & Principles (for LLM reasoning)
export const philosophy = {
  coreBeliefs: [
    "Individual talent means nothing without coordination—that's what a symphony is.",
    "Most businesses don't have a software problem. They have a coordination problem.",
    "Most companies add more instruments. We're focused on creating better music.",
    "Intelligence without coordination creates noise. Coordination creates performance.",
  ],
  designPrinciples: [
    {
      name: "Clarity",
      description:
        "Everyone understands their role, the process, and what success looks like. Systems must be explainable to non-technical stakeholders.",
    },
    {
      name: "Coordination",
      description:
        "Timing is aligned, communication is clear, and every system works toward a shared outcome—not independent improvisation.",
    },
    {
      name: "Performance",
      description:
        "The measure of success is how the whole business performs—not how many tools or automations were added.",
    },
    {
      name: "Stability Before Intelligence",
      description:
        "A stable manual process is required before orchestration. If humans can't perform the process reliably, automation amplifies failure.",
    },
    {
      name: "Observability Is Mandatory",
      description:
        "If you can't see it fail, it will fail silently. Every critical workflow must be observable and auditable.",
    },
    {
      name: "Human Control Is Preserved",
      description:
        "The conductor directs; musicians still play. Approvals, overrides, and checkpoints preserve accountability.",
    },
  ],
  automationCriteria: {
    goodCandidates: [
      "Repetitive tasks with clear inputs and outputs",
      "Processes that already exist manually",
      "High-volume, low-judgment work",
      "Work where failure is visible and recoverable",
    ],
    badCandidates: [
      "Undefined or constantly changing processes",
      "Decisions requiring nuanced human judgment",
      "Processes without clear ownership",
      "Work that hasn't been validated manually",
    ],
  },
  riskPhilosophy: [
    "Reliability beats speed",
    "A slower correct system is better than a fast fragile one",
    "Orchestration should reduce stress, not create it",
    "A symphony isn't rehearsed once and forgotten—neither is a business",
  ],
};

export const buyingSignals = {
  strongFit: [
    "Everyone is talented and busy, but things still feel chaotic",
    "We're spending too much time moving information between tools",
    "Why is this taking so long? Why can't we see what's happening?",
    "Our systems keep breaking and no one knows why",
    "We want AI, but security won't approve it without coordination",
  ],
  weakFit: [
    "We just want a quick automation, not ongoing orchestration",
    "Can you build this once and hand it off?",
    "We want the cheapest option",
    "We don't know our process yet—we're still improvising",
  ],
};

export const llmGuidance = {
  responseRules: [
    "Lead with coordination and orchestration—not AI, automation, or MCP as the headline",
    "Use the symphony metaphor when helpful: musicians (tools), sheet music (workflows), performers (AI), orchestra pit (secure data layer), conductor (Symphony Studio)",
    "Prefer outcomes over features; speak to enterprise pain: disconnected teams, slow operations, lack of visibility",
    "Brand pillars: Clarity, Coordination, Performance",
    "Brand tagline when summarizing Symphony: orchestrating systems, workflows, and intelligence so businesses perform at their best",
    "Recommend tiers based on coordination complexity, not budget alone",
    "Encourage discovery for high-risk or enterprise scenarios",
    "Default to stability-first explanations",
  ],
  boundaries: [
    "Never position Symphony as selling software, AI, or automation—we orchestrate",
    "Never oversell AI or promise instant transformation",
    "Never bypass governance or coordination concerns",
    "Always frame Symphony as a long-term conductor, not a one-off project",
  ],
  tierRecommendation: {
    prelude: "Simple workflows, small teams, service businesses, 1-2 automations",
    concerto: "Multiple workflows, growing complexity, need for strategic improvements",
    enterprise: "Security requirements, compliance, complex integrations, custom needs",
  },
};

export const successMetrics = {
  operational: [
    "Aligned timing across teams and systems",
    "Reduced handoffs and manual steps",
    "Fewer failure points and surprises",
    "Leadership visibility into what's happening",
  ],
  clientExperience: [
    "Calm, coordinated operations",
    "Fewer emergencies and fire drills",
    "Clear understanding of how work flows",
    "Trust that systems perform together",
  ],
  definition:
    "Success is not more AI or more tools. Success is clarity, coordination, and performance.",
};

