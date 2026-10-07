# Meta Ads copilot — build plan

This tab lives inside Inspired Closets OS. It is a read-only performance analyst. It does not create, pause, budget, or edit ads.

## Stack decisions

Keep the current OS. Do not start a second Next.js app.

| Concern | Use |
| --- | --- |
| App | Existing Next.js 15 app, `OpsShell`, `/ops/ads` |
| Auth | Existing staff cookie and role gate. Inventory logins cannot open this tab. |
| Database | Supabase. Schema in `src/db/meta-ads-schema.ts`. Apply `drizzle/0032_ic_meta_ads.sql`. |
| Jobs | Existing cron-route style when scheduling starts. Trigger.dev is not in this repo. |
| AI | OpenAI for this analyst only, after metrics exist. The rest of the product stays on Anthropic. |
| UI | OS CSS modules. shadcn is not introduced for this tab. |

## Phases

1. Foundation — Ads nav item, server env checks, read-only contract. Done.
2. Database — `ic_meta_*` tables, migration, Example Home Services demo fixture. Done in code. SQL still needs to be applied in Supabase.
3. Analytics — deterministic metrics, periods, signals, and tests on the demo fixture.
4. Dashboard — attention, opportunities, and insufficient-data states.
5. Meta — OAuth, account discovery, sync, normalization. Confirm the current Graph API version before coding endpoints.
6. Snapshots — persist daily performance without deleting history on a failed sync.
7. Analytics on normalized Meta data.
8. Recommendation rules, dedupe, expiry, confidence from evidence.
9. One OpenAI analyst with structured output. No write tools.
10. Recommendations UI and accept / reject / ignore.
11. Read-only chat.
12. Feedback and observed outcomes.
13. Scheduled sync.
14. Daily summary.
15. Hardening, empty states, reconnection, monitoring.

## Not in V1

Automatic budget changes, pausing, campaign or ad creation, extra ad platforms, and a custom forecasting model.
