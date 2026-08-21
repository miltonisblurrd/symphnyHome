# ModulusScan Rebuild Spec — Receiving inside Inspired Closets OS

Reverse-engineered Aug 21, 2026 from the live app (logged in as Craig, Inspired Closets LV org)
and the production frontend bundle. This is everything needed to rebuild receiving as a page
under the Inventory tab, writing into `ic_parts` / `ic_stock_movements` instead of a separate app.

Do NOT store ModulusScan credentials in this repo. Live fixtures from the account are in this
folder (`shipment-1463-items.json`, `shipment-1463-summary.json`).

## What it is

React SPA (Vite, React Router, Tailwind) on Vercel at `modulusscan.app`, installable as a
portrait-locked PWA. Backend is a hosted API at
`https://shipment-scanner-hosted.onrender.com/api` (JWT auth: access + refresh tokens in
localStorage; the server enforces ONE active session per user — a second login displaces the
first with `401 {"detail":"session_displaced"}`).

Pricing: Pro $20/mo (unlimited shipments, 25 users, 500 MB, damage claims), Premium $35,
Richelieu/Häfele add-ons $10 each. IC LV is on Pro with 3 free tries per vendor add-on.
Users: Craig (admin), Bryant (member). 28 lifetime shipments, 12,634 scans, ~477 items/hr pace.

## Core flow (Stow shipments)

1. **Upload packing slip PDF** (`POST /shipments/upload`, multipart). Must be the original
   digital PDF attached to the "Your Custom Storage Solution" shipment email — not a photo/scan.
   Parsing is async: poll `GET /shipments/{id}/parse-status` every 2s until `complete`.
   Parser extracts per line: `item_number` (9-digit Stow code), `so_number`, `cust_ref`
   (e.g. `Wright_072426` — client name + date written by Frank at order time), `job_name`,
   `project_number`, `description` (e.g. `DF 5.9x26.5x20.9 MP`), `qty`, `container_id`
   (pallet, e.g. `7000000048807`), `source_page`.
2. **Review parse** (`/parse-check/:id`): `GET /shipments/{id}/parse-quality` returns per-page
   found/expected counts, missing fields, duplicate item+customer rows, and `known_jobs`.
   Side-by-side with original page snippets: `GET /uploads/{filename}/page-snippet?page=N&item_number=X`.
   Items are editable (`PATCH /shipments/{id}/items/{itemId}`), manual add
   (`POST /shipments/{id}/items`), reparse (`POST /shipments/{id}/reparse`).
3. **Print labels** (`GET /shipments/{id}/labels` → PDF): one label per job with customer name,
   piece count, ship date.
4. **Receive** (`/receive/:id`) — dark mobile screen, three tabs:
   - **Scan**: camera + Tesseract.js OCR (not a barcode lib!). Whitelist `0123456789 ` (plus
     A–Z for vendor SKUs), page-seg mode 6, scans a horizontal band ~36% down the viewport,
     hold-to-scan button. Beep (WebAudio oscillator chirps) + vibrate on hit; different tone
     when the code was already fully received.
   - **Search**: type part of item number / customer / description; +/- buttons check in / undo.
   - **Browse**: items grouped by customer, pallet, or ungrouped. Tap + to check in, hold +
     for rapid multi-qty, swipe right = check in all remaining for the line, swipe left =
     report damage. "All" button per line.
   - **Pallet mode**: pick an active `container_id`; scans auto-resolve to items on that
     pallet, checking in elsewhere still works but flags the mismatch.
5. **Scan write-back**: `POST /shipments/{id}/scan` `{item_number, status:"received"}` or
   batched `POST /shipments/{id}/scan-batch` `{events:[...]}`. Undo:
   `POST /shipments/{id}/items/{itemId}/unreceive`. Scans not matching any line are stored as
   `unknown_scans` and shown on the summary. Multiple people can scan the same shipment at once.
6. **Client-side matcher** (`ShipmentIndex` class): maps by exact `item_number` and a
   normalized code (strip non-alphanumerics); a scanned code can match multiple lines (same
   part on several jobs/pallets) — it picks the first not-fully-received line. Per-line
   `received_qty` increments toward `qty`; line is "received" when full.
7. **Summary** (`/summary/:id`): % complete bar ("127 of 479 pieces received"), stats
   (received / damaged / missing), **By Project** (per job: FOX 28/104, Wright 55/213 …) and
   **By Pallet** groupings, unknown scans, "Items Need Attention".
8. **Missing items**: per-shipment `GET /shipments/{id}/missing-items` only proposes candidates
   after ≥70% of pallets are scanned (`threshold_pct: 0.7`, `waiting_for_pallets`). Global
   `GET /missing-items` lists unreceived lines across shipments (this is the "did the slides
   ever show up" view). Items can be explicitly marked `missing` / back to `expected`.
9. **Damage claims** (`POST /damage-claims`, multipart): shipment_item_id, description,
   damaged_qty, claim_type (DAMAGED / …), submitted_by, reorder?, claim_for_credit?, photos[].
   Draft → submitted lifecycle, ZIP download of evidence, urgency endpoint. IC has 0 claims.
10. **Job aliases** (`POST /shipments/{id}/aliases`): rename ugly cust_refs for display.
11. **Home** (`/`): shipment list with status pill (Not started / Receiving / All received),
    per-shipment vendor badge, x/y received, active scan time and items/hour.

Multi-vendor: Richelieu 🔶 / Häfele 🔴 drop-ship slips ride the same pipeline (saved from
Studio Store → Order History → Print → PDF), with vendor SKU matching (`vendor_sku` on items,
OCR whitelist widens to alphanumerics). `https://studio.inspiredclosets.com/store/ccf/add/`
is referenced for the reorder flow.

Other org features: team stats, weekly digest (off), production status board + leaderboard
(feature-flagged off for IC), storage stats, feedback → Slack.

## Live account snapshot (Aug 21)

- 15 shipments, all Stow. Active truck: notice `80129014` (uploaded today,
  `20260821_171209_80129014.PDF`, 6 pages, 196 lines / 479 pieces, 127 received, 7 pallets,
  4 scanned). Jobs on it: FOX_071526 28/104, Johnson_073126 21/54, McCaw_072726 23/100,
  New_Cart_81947 0/8, Wright_072426 55/213.
- Complete example: `80126222` — 482/482 across Duran/Faurot/Sequeiira, 9 pallets.
- ~95 historical cust_refs (ALLEN-071326, CAVANAUGH-072126, CRISOLOGO #2, HALLES-072726 …).
- Real open misses: CAVANAUGH 1× `VT 16x18.4x3/4 RH WH`, HALLES/HENDRICKS, ROSS/WALLAS,
  CRISOLOGO #2, HARDING/MORRIS lines still `expected` on old shipments.

## Full API surface (for parity checklist)

Auth: login, signup, refresh, me, verify-email, resend-verification, change-password,
reset-password, invite/signup.
Shipments: upload, list, get, patch (ship_date…), delete, stuck-delete, reparse, items (GET/
POST/PUT/PATCH), unreceive, scan, scan-batch, summary, parse-status, parse-quality, issues,
missing-items, aliases (GET/POST/DELETE), labels PDF, pdf delete, page-snippet, uploads.
Lookup: `GET /lookup?q=` (matches item numbers across all shipments; not job names),
`GET /cust-refs?limit=`.
Damage claims: CRUD + manual, submit/unsubmit, urgency, download-zip.
Org: users, invites, crew, plan, team-stats, digest-settings/send-now, production-settings/reset.
Billing: prices, checkout, portal, change-plan, addon. Misc: storage, app-config, feedback.

## Mapping into Inspired Closets OS

New page under Inventory: `/inspired-closets/ops/inventory/receive` (mobile-first, dark like
the field app), button on the Inventory workspace.

| ModulusScan | IC OS |
| --- | --- |
| shipment (packing slip) | new `ic_shipments` table (notice, ship_date, vendor, pdf, status) |
| shipment item line | new `ic_shipment_items` (item_number, cust_ref, description, qty, received_qty, container_id, part link) |
| cust_ref / job_name | match to `ic_jobs` via client name (Frank already writes it on the order) |
| scan → received | `ic_stock_movements` type `receive` (+ optional auto-reserve to the matched job) |
| damaged | movement `scrap` + `ic_field_issues`-style claim record with photos |
| missing / unknown scans | attention feed + Slack notify (`/api/inspired-closets/notify`) |
| % per job | job staging truth — feeds install-readiness instead of "Bryant says 100%" |
| labels PDF | same, per-job label sheet |

PDF parsing: parse Stow slip server-side (route handler with a PDF text extractor, fall back
to Claude for messy pages — Anthropic SDK already in the repo). Keep parse-review + reparse.
Scanning: hold-to-scan camera OCR via tesseract.js (proven on Stow labels), numeric whitelist,
beep/vibrate, batch queue with offline retry (field app already has an offline queue pattern).

Guardrails from the Aug 20 meeting that ModulusScan does NOT have (our edge):
- receiving writes real inventory (on-hand), not a standalone checklist
- receive without a matching job/PO gets flagged
- install can't be marked "100% ready" while job lines are unreceived
- notifications to Frank/Bryant/Craig on shortages, not just a summary screen
