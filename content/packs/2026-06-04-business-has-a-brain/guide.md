---
title: "How to Evaluate a Business Brain Without Buying Hype (Step-by-Step)"
slug: business-has-a-brain-guide
audience: Ops leaders and executives evaluating AI assistants for internal ops or customer-facing guidance
outcome: A behavior spec, grounding test results, observability requirements, access matrix draft, and go/no-go criteria separating chatbots from governed brains
estimatedMinutes: 28
---

# How to Evaluate a Business Brain Without Buying Hype

**Who this is for:** Executives and ops leaders asked to "deploy a company brain" while security blocks ungoverned chat and operators distrust fluent wrong answers.

**What you'll have at the end:** Required behaviors per question type, scored grounding tests, logging requirements, an access matrix draft, named conductor ownership, and demo criteria that prioritize MCP **behavior** over code.

## Prerequisites

- [ ] Top ten questions teams actually ask (not hypothetical vendor demos)
- [ ] Systems that must ground answers (CRM, KB, pricing, policies)
- [ ] Security and compliance non-negotiables (data classes, retention, human approval)
- [ ] One journey where AI should assist—not replace—humans
- [ ] Current chatbot or pilot logs, if any
- [ ] Stakeholders who can approve an access matrix (security, ops, revenue owner)

## Step 1 — Define required behaviors per question type

For each question cluster (fit, pricing, routing, policy, status):

- Allowed sources (systems, fields, document types)
- Forbidden sources (exports, shadow spreadsheets, public web)
- Required human escalation paths
- Success = accurate plus current plus within permissions—not "felt helpful"

Write this as a **behavior spec** leadership can review without reading MCP docs. If a vendor cannot map their demo to your spec, you are evaluating a chatbot.

### What if teams disagree on the top ten questions?

Survey operators and support leads; weight by volume and revenue or compliance impact. Include at least two questions that recently caused a wrong routing or policy miss—that is where brains earn or lose trust.

## Step 2 — Test grounding, not eloquence

Run the top ten through candidate tools. Score each answer:

- Accurate vs internal source of truth
- Current (not stale handbook or last quarter's export)
- Admits limits when context is missing
- Penalize fluent wrong answers heavily

Document failures as **pit** gaps (access, permissions, stale truth) or **sheet music** gaps (wrong journey stage, missing escalation)—not "bad model."

Require the vendor to repeat at least three questions live with your wording. Scripted demos that skip tool transparency fail this step.

## Step 3 — Require observability on every answer path

Specify logs: who asked, tools invoked, data classes touched, outcome (answered / escalated / paused). Leadership and security should review samples monthly—not only at go-live.

### What if the vendor cannot show tool traces?

Treat as chatbot-grade until proven otherwise. Production stays blocked until you can audit what the performer touched and why it paused.

## Step 4 — Draft the orchestra pit (access matrix)

List read/write per system by role. Ban ungoverned bulk uploads. Plan revocation when people, vendors, or policies change.

Align with [enterprise orchestration](/enterprise) if regulated data or multiple business units are in scope. The matrix is the contract between security and ops—not a one-time integration diagram.

## Step 5 — Connect brain to one journey's sheet music

Pick intake → qualified → routed (or your loudest pain point). Define where performers may act vs pause vs escalate. Brain answers serve **journeys**, not trivia.

Cross-check [automation vs orchestration](/faq) so task automations do not fight journey rules. MCP behavior only matters inside a journey operators already care about.

## Step 6 — Assign conductor ownership

Name who tunes content, permissions, and workflows monthly—updates when services, tiers, or models change. Without a conductor, the pit goes stale even when MCP wiring is correct.

External conductor option: see [how Symphony works](/how-it-works) for subscription orchestration scope. Internal or external, the role must have calendar time—not a side project after launch.

## Checklist (printable)

- [ ] Behavior spec per question type (sources, forbidden, escalation)
- [ ] Top ten grounding test scored (accuracy, currency, limits)
- [ ] Observability requirements written and sample logs reviewed
- [ ] Access matrix drafted and security engaged
- [ ] Ungoverned CSV or upload paths eliminated or blocked
- [ ] One journey sheet music links performer roles to stages
- [ ] Pause rules when pit access or confidence fails
- [ ] Conductor named with monthly review calendar
- [ ] Demo criteria: behavior first, not code tour
- [ ] "What the brain will not do" list published beside capabilities

## When to get help

If grounding tests fail on fit or pricing questions, or security will not sign off without a clear pit contract, a discovery call maps Symphony MCP **behavior** in your context—grounded answers, limits, escalation—scoped to ninety days of orchestration.

[Book a discovery call](/contact) · [Pricing](/pricing) · [FAQ](/faq)
