# Inspired Closets OS — Leads + Jobs Cleanup Master Plan (9/28/2026)

Goal: get the OS accurate before Des, Craig, the designers, Frank and Bryant start testing.

Sources of truth:

| Source | What it's the truth for |
|---|---|
| Community "Active Leads – Scheduled" PDF (9/28, 11 rows) | Scheduled leads. Only 5 are in scope (see 3.1). |
| Community "Active Leads – Unscheduled" PDF (9/28, 25 rows) | Unscheduled leads. The export is cut off ("more records available"). |
| Google Calendar PDF (Aug 30 – Dec 31, 124 pages) | Design consultations: date, time, designer, address. |
| `SERVICES COPY REVISED 12-15 (1).xlsx` | Install jobs: install date, amount, designer, job complete, sent Podium, owes, notes. Newest info for projects. |

Ground rules for every phase:

1. **No merging duplicates.** Duplicates get flagged. The only exception is a person who is already in the OS: we fill in blank fields on that record rather than creating a second copy.
2. **Nothing is hard-deleted.** Removals set `deleted_at`, so everything can be restored.
3. **Every phase runs as a dry run first** and prints exactly what it will do. It is applied only after sign-off.
4. **Leads:** blanks get filled; conflicts get flagged. **Jobs: the Excel sheet is the source of truth.** Wherever the sheet has a value, the OS takes it, including reopening closed jobs. The only exception is a blank cell on the sheet: a blank never erases an OS value.
5. **Snapshot before applying.** The affected tables (`ic_leads`, `ic_clients`, `ic_jobs`, `ic_appointments`, `ic_staff`, `ic_lead_chatter`) are exported to JSON, so any phase can be rolled back.
6. **Re-running is safe.** Each script checks what already exists, so running it twice creates nothing twice.

---

## Phase 0 — Safety and setup

- 0.1 Snapshot the tables above to `.tmp/snapshots/2026-09-28/*.json`.
- 0.2 Add `.tmp/` to `.gitignore`. It holds customer data and must not be committed.
- 0.3 Reuse the converted Excel sheets in `.tmp/services/*.csv` (converted with openpyxl, cached values, dates as M/D/YY).
- 0.4 Tag every row these scripts create or change with a batch id (`import_batch = "2026-09-28-cleanup"`, stored in notes or `community_created_by`), so the whole batch can be found and undone together.

## Phase 1 — Remove fake and test data

Soft-delete these clients and everything attached to them:

| Client | Leads | Jobs | Appointments |
|---|---|---|---|
| Jade Amaya (blurrdinfo@gmail.com) | 2 ("Jade Amaya", "Des Amaya") | 2 (ordered, deposit pending) | included in the 6 below |
| Milton test (blurrdinfo@gmail.com) | 1 | 0 | |
| Des Test | 1 | 0 | |
| TEST CLIENT — DES LEADS | 1 | 0 | |
| TEST CLIENT — FIELD APP | 0 | 0 | |

- 1.1 Soft-delete the 6 appointments attached to them, then the 2 jobs, then the leads' chatter, then the 5 leads, then the 5 clients.
- 1.2 Keep these; they are real people, not fake data:
  - Staff record "Milton" (installer)
  - "DES AMAYA" as the lead owner on Community leads
- 1.3 Verify afterwards: searching "amaya", "test" or "blurrd" in leads, clients and jobs returns nothing.

## Phase 2 — Schema and reference data

### 2.1 Staff member field on leads

- The lead's owner links to a staff record through `designer_id` (and `owner_id`) instead of relying on the free-text `lead_owner_name`.
- Add **Des Amaya** as staff with role `front_office`.
- Map Community owner names to staff records:

| Community owner | Staff record |
|---|---|
| Des Amaya | Des Amaya (new) |
| Cissy Valdez | CISS |
| Rebekah Larson | Rebekah Larson |
| Sandy Scamman | SAND |
| Yvonne Duval | YVON |
| Gavin Grundmeier | GAVIN |

- Show this as **"Staff member"** on the lead page and the leads list, as a dropdown of active staff.
- `lead_owner_name` stays as the original Community text, for reference.

### 2.2 Designer name aliases (fixes the 344 unlinked jobs)

- Add an alias list so sheet names link to staff:

| Sheet name | Staff record |
|---|---|
| YVONNE | YVON |
| CISSY | CISS |
| MONICA | MONI |
| SUMMER | SUMM |
| SANDY | SAND |
| REBEKAH, BEX, BECKA | Rebekah Larson |
| TANIA | TANIA |
| CRAIG | CRAIG |
| GAVIN | GAVIN |
| JERISSA | JERISSA |

| NAVI | NAVI (new designer staff record) |
| ESP | ESP (new designer staff record) |

- NAVI and ESP are created as `designer` staff under those names (approved). Their full names can be filled in later on the staff page.
- Fix `matchStaff` in `scripts/import-ic-jobs-from-services.ts` and `matchStaffId` in `src/lib/inspired-closets-ops-lead-import.ts` to use this alias list, so future imports link correctly.

### 2.3 Lead sources that match Community exactly

- Migration: add these values to `ic_lead_source`:

| New value | Label |
|---|---|
| `pinterest` | Pinterest |
| `showroom_walk_in` | Showroom Walk-In |
| `self_generated` | Self-Generated |
| `web` | Web |
| `online` | Online |
| `paid_instagram_ads` | Paid Instagram Ads |
| `google_business_profile` | Google Business Profile |

- These existing values stay: Other, Organic Search, Paid Search, Facebook, Instagram.
- Add the new labels to `LEAD_SOURCES` in `src/lib/inspired-closets-ops-leads.ts`, in the same wording Community uses.
- Update `mapSource` in the lead importer so these map one to one instead of falling back to "Other".
- Existing OS leads whose `source_raw` holds one of these words get their `source` corrected to the exact value.

### 2.4 "Confirm match" flag

This reuses the "Confirm and merge with client" pattern from `OpsProjectFile.tsx`.

- New table `ic_lead_match_candidates`: `id`, `lead_id`, `target_type` (job | client | lead), `target_id`, `matched_fields` (jsonb, e.g. `{last_name: "SMITH", phone: null}`), `mismatched_fields`, `reason`, `status` (pending | linked | kept_separate), `resolved_by`, `resolved_at`.
- **Lead page:** a badge reading "Confirm to link with job" (or "…with client" / "…possible duplicate lead"), with a side-by-side panel showing what matches and what doesn't.
  - **Link** sets `ic_jobs.lead_id` (or `ic_leads.client_id`) and marks the flag resolved.
  - **Keep separate** marks it `kept_separate` so it never comes back.
- **Leads list:** a "Needs confirmation (N)" filter or tab, so all flags can be worked through in one place.
- **Duplicate-lead flags** (6.3) use the same table with `target_type = lead`. Nothing is ever merged automatically.

## Phase 3 — Leads from the Community PDFs

### 3.1 Scheduled leads: only these 5

All five are on the calendar. Each gets the "Scheduled" stage, a staff member, an appointment and an address.

| Lead | Phone | Email | Source (Form) | Created / Modified | Staff | Consultation | Address |
|---|---|---|---|---|---|---|---|
| Ken Smith | 702-501-8487 | smithkr0924@gmail.com | Facebook (Consultation request) | 9/27 / 9/28 | Yvonne | Tue 9/29 2:00pm on-site | 4242 Helena Hideaway Ct, Las Vegas NV 89129 |
| Cassi Wright | 702-682-7448 | cassijowright@mac.com | Web (Consultation request) | 9/24 / 9/28 | Yvonne | Mon 9/28 1:30pm on-site | 12540 Alpine Creek Pl, Las Vegas NV 89138 |
| Heidi Meier | 801-529-2925 | summerluvin96@yahoo.com | Online | 9/28 / 9/28 | Rebekah | Wed 9/30 11:00am on-site | 4862 Shady Ridge Dr, Las Vegas NV 89135 |
| Kelly Fountain | 310-489-9464 | kellytfountain@gmail.com | Facebook (Consultation request) | 9/23 / 9/23 | Rebekah | Wed 9/30 12:45pm on-site | 6152 Royal Topaz Ct, Las Vegas NV 89149 |
| Duane Thomas | 678-772-8723 | duane.thomasatl@gmail.com | Other | 9/17 / 9/17 | Cissy | Thu 10/1 3:30pm on-site | 91 Alta Cascata Pl, Henderson NV 89011 |

- Cassi Wright also gets a second appointment: showroom (front) with Yvonne on **Tue 10/13 at 8:30am**. The calendar says 8:30pm; this was confirmed as 8:30am.
- Ken Smith is created as a new lead **and** flagged "Confirm to link with job":
  - Candidates: the "K. SMITH" job (quoted) and the "SMITH, K." job (install scheduled).
  - What matches: last name and first initial.
  - Why it's unconfirmed: neither job has a phone or email to compare.
- Excluded from this pass: Sinard, Yee, Squatrito, Kilbury, plus Barillas and Hetzel (see 3.3). Squatrito's email note (sandys@inspiredclosetslv.com goes in notes) only applies if Squatrito is added later.

### 3.2 Unscheduled leads: all 24 new ones

Stage mapping:

| Community status | OS stage | Contact attempts |
|---|---|---|
| 1st Attempt – No Response | attempt_1 | 1 |
| 4th Attempt – No Response | attempt_4 | 4 |
| Needs Follow Up | follow_up | 0 |

Every field is carried over: name, phone, email, zip, form type, exact source, Community created and last-modified dates, staff member, and original status text (`stage_raw`).

| Lead | Status | Source | Form | Zip | Staff |
|---|---|---|---|---|---|
| Sophie Jensen | 1st Attempt | Instagram | Consultation request | 89107 | Des |
| Cassandra Hardy | 1st Attempt | Facebook | Consultation request | 89031 | Des |
| Emma Carlins | 1st Attempt | Paid Search | Consultation request | 60601 | Des |
| Angie Lee | 4th Attempt | Web | Brochure download | 89148 | Des |
| Tracy Fluker | 4th Attempt | Facebook | Consultation request | 89128 | Des |
| Carol Cable | Needs Follow Up | Web | Brochure download | 89141 | Des |
| Jolene Tupper | Needs Follow Up | Organic Search | Consultation request | 89135 | Rebekah |
| Jennifer Hoge | Needs Follow Up | Paid Instagram Ads | Brochure download | 89113 | Des |
| Lance Hurst | Needs Follow Up | Web | Consultation request | 89113 | Cissy |
| Lovetta Adams | Needs Follow Up | Paid Search | Consultation request | 89086 | Yvonne |
| Sandra Rebolledo | Needs Follow Up | Paid Search | Brochure download | 89010 | Des |
| Carol Mayorga | Needs Follow Up | Organic Search | Consultation request | 89131 | Des |
| Trish Rowan | Needs Follow Up | Paid Search | Brochure download | 89060 | Des |
| Cyndy Sharp | Needs Follow Up | Instagram | Consultation request | 89149 | Des |
| Jaime Wallace-Yang | Needs Follow Up | Paid Instagram Ads | Brochure download | 89143 | Des |
| Debby Bunn | Needs Follow Up | Instagram | — | — | Des |
| Nancy Benton | Needs Follow Up | Organic Search | Brochure download | 89143 | Des |
| Connie Smith | Needs Follow Up | Facebook | — | — | Des |
| Shawn Gonsalves | Needs Follow Up | Paid Search | Consultation request | 89119 | Des |
| Sara Oatt | Needs Follow Up | Paid Search | Brochure download | 89143 | Des |
| Ida Peetz | Needs Follow Up | Facebook | Consultation request | 89141 | Des |
| Laeo Boat | Needs Follow Up | Web | Consultation request | 89120 | Des |
| Rhonda Wyman-Patterson | Needs Follow Up | Instagram | — | 89123 | Des |
| Leslie Toy | Needs Follow Up | Instagram | — | 89034 | Des |

- None of these 24 appear on the calendar, which confirms they are unscheduled. No appointments are created for them.
- Sophie Jensen is created and flagged "Confirm to link with job" against the "JENSEN" job (quoted). The match is last name only; the job has no phone or email.
- Connie Smith is checked against the Smith jobs: first name and initial don't match, so she is not flagged.

### 3.3 People already in the OS (confirmed by matching phone number)

Nothing new is created for these. Blank fields are filled from Community; filled fields stay as they are.

| Person | OS today | Fill if blank |
|---|---|---|
| Rosacruz G. Barillas | Lead, Scheduled | Email pqestrella25@gmail.com, source Pinterest, form Consultation request, created 8/13, modified 8/21, staff Cissy |
| Mr./Mrs. Hetzel | Lead, Scheduled | Email elizabethmyers1958@gmail.com, source Other, created 8/24, staff Gavin |
| Kyle Hagen | Lead, Needs Follow Up | Email k.hagen1@icloud.com, zip 89135, source Google Business Profile, form Brochure download, created 8/18, modified 8/26, staff Des |

- Neither Barillas nor Hetzel is on the calendar, so no appointment is added. They go in the report as "Scheduled in Community, no consultation on the calendar".

## Phase 4 — Jobs from the Excel sheet

### 4.1 Link designers (the 344 jobs)

- Using the alias list from 2.2, set `designer_id` wherever the sheet names a designer, NAVI and ESP included.
- Where the OS has a different designer, the sheet wins. Hiller changes from Tania to Gavin.

### 4.2 Jobs that moved from Jobs In Warehouse to Installed Jobs (about 28)

- Match by name and key them to the existing OS job, so no new job is created.
- Update from the Installed Jobs row: install date, 100% ready date, job complete (which sets the stage), amount, sent Podium, owes, and notes. The sheet wins.
- Jobs: Allison Black-Hermosa, Seidner, Demattei A/O, Hendricks A/O, Cudahy, Strawser, Georgina Vaughan Photography, Nam, Hiler, Watson A/O, Shroff, Keller, Mahoney, Brown, Sin City Rehab-La Mesa Dr, Coats, Westpoint-Yanke, Divino (7/2 6/11 7-11), Macdonald #3, Brown Element Doors, Twist, Dixon (7/6), North, Ascaya #114, Frye, Wheeler, Krell, Maxwell, Lake Mead Micro Business, Puno, Friedman.
- Update the job's `workbook_ref` to the new tab, so the next import matches it straight away.
- Jobs in the OS that aren't on either tab (Weldy 8/7, Prieto, Signature Homes Model, Semone Gell Personal, Shroff #2, Rainbow Club Casino GB, Parker SVC, Maningo punch, Holley punch) are left untouched and listed in the report.

### 4.3 Updates on existing jobs (about 96)

**Applied, with the sheet winning over the OS:**
- Install date, taken from Installed Jobs, Jobs In Warehouse, or All Sold Jobs "Scheduled". Job-tracking visits are the service or punch-list trips after the install. They're recorded as visit notes on the job, or as their own service jobs (4.4), and they don't replace the original install date.
- Received/ETA date, completed date, sent Podium, owes, payment type, and payment notes.
- New notes lines, added below the existing notes with a "Sheet 9/28:" prefix. Existing notes are never replaced.
- Owes: the sheet's figure replaces the OS "Owes" line.
- Examples:
  - Nelson: install 10/29–10/30, owes $7,680.
  - Peterson #3: install 10/2, owes $6,000, "repair drawer".
  - Crockett: "installing drawers 9/25", owes $3,950.
  - Signature Homes Element Doors: install 9/29.
  - Sussman: ship date moved up to 9/24.
  - Gallager: install 10/19.
  - Westpoint-Otuwa: November install, super Andy Hunter 702-419-0384.
  - Whittemore: install 10/26, JC 9/28.

**Amounts: the sheet wins.** Seven jobs change:

| Job | OS today | Sheet |
|---|---|---|
| Linnebur | $19,000 | $18,573.78 |
| Mavronas | $4,000 | $2,700 |
| Crockett | $7,900 | $7,500 |
| Feeney | $430 | $24,900 |
| Gesualdo | $5,700 | $14,600 |
| Sherwood | $8,640 | $8,460 |
| Allen | $13,710 | $13,710.33 |

- Pohlman ($14,777.99), Vargas ($34,000) and Silberman-Luke ($1,000) **keep their OS amounts**. The sheet's amount cell is blank for them, not $0, and a blank never erases a value.
- The $34,000 for Vargas lives on the new Westpoint-Vargas row (4.4).

**Stages: the sheet wins, including reopening closed jobs.**

Closed in the OS, but the sheet shows money owed or the job incomplete, so they are **reopened**:
- **Final payment:** Dossa, Northington, Northington #2, White, Fetaz, Berk, Koentopp, Solan, Musum-Duffy, Holiday, Bledsoe, Siamas, Schreiber, George II, Madrazo, Jennings, Wallace, Maningo, Linnebur, Feeney.
- **Install scheduled:** Urmaza Garage Add-On, Dunn and Divino. Their completed date is cleared.
- **Ordered:** Maningo Go Back. Its install and completed dates are cleared.
- Holley (final payment → install scheduled, completed date cleared).
- Westpoint-Otuwa (ordered → quoted, November install).

**Moving forward:**
- quoted → ordered or install scheduled, where the sheet has an order date. Examples: Vieira, Sandoval, Ochsner, Skinner, Northern, Lobo, Gallager, Landis, Westpoint-Nayer, Moshe, O Hearn, Sussman, Shin A/O, Teer, Diola.
- ordered or install scheduled → final payment or closed, where the sheet says COMPLETE, or PIF with owes $0. Examples: Holley 7/10, Demattei 7/20, Fredricksen, Foth, Pollard, Johnson.

**Install dates: the sheet wins, earlier or later.** Examples:
- Moffitt 10/26 → 4/8, completed 4/8
- Hendricks 9/11 → 8/7
- Rainbow Club Casino GB 1/19 → 1/8
- Kidd 4/14 → 4/15
- Mavronas 4/22 → 7/27
- About 45 more

Every change is saved on the job as a "Sheet 9/28: was X, now Y" note line, so the old value can always be seen.

**Designers: the sheet wins** (4.1).

### 4.4 New sold jobs not in the OS (about 30)

Each is created with its client, designer, amount, install date, owes and notes. It is then linked to an existing lead when the name matches one clearly (6.1), or flagged if it only partly matches (6.2).

| Job | Designer | Amount | Install | Owes | Lead / calendar link |
|---|---|---|---|---|---|
| Long | Yvonne | $21,489.30 | 9/29 | $10,744.65 | Lead Hailee Long; consultation 8/31 |
| Chong | Tania | $7,850 | 9/29 | $3,925 | Lead Jason Chong; showroom 9/1 |
| Cushman | Craig | $1,325.27 | 10/12 | $662.78 | Lead Emily & Beau Cushman (already has 2 jobs, so flag, don't auto-link) |
| Braunger | Cissy | $13,600 | 10/15 | $6,800 | Lead Jeff Braunger (2 leads, so flag) |
| Braunger-Elements | — | $0 | 10/15 | — | Child of Braunger |
| Pang | Monica | $13,610 | 10/14 | $6,805 | Lead Joyce Pang (2 leads, so flag) |
| Schlobohm | Monica | $6,400 | 10/13 | $3,200 | Consultation 9/9 (no lead, so create lead, see Phase 5) |
| Howatt | Yvonne | $19,000 | — | $9,500 | Lead Pam Howatt; consultation 9/16 |
| Hobson | Rebekah | $6,700 | — | $3,350 | Consultation 9/11 |
| Donaldson | Cissy | $6,150 | — | $3,075 | Consultation 9/22 |
| Wilson | Sandy | $15,600 | — | $7,800 | Consultation 9/11 |
| Hohenshil | Rebekah | $44,000 | — | $22,000 | Appointment 9/26 |
| Kurle | Cissy | $40,000 | — | $30,000 | Showroom 9/4, 9/22 |
| Privman | Summer | $10,880.55 | 10/15 | $6,542.84 | Lead Susan Privman (2 leads, so flag) |
| Bae | Yvonne | $4,352.26 | 10/16 | $2,176.13 | Lead Sally Bae |
| James | Rebekah | $2,270 | 10/19 | $1,135 | Lead Rachel James |
| Pluchino 4 | Rebekah | $8,285 | 10/19 | $4,142.50 | Existing Pluchino job (closed), same client |
| Westpoint-Vargas | Craig | $34,000 | — | $34,000 | Existing Vargas job ($34,000 in the OS); flag as possibly the same job |
| Signature Homes Model/Jessup | Gavin | $20,000 | 9/10 | $10,000 | Existing "Signature Homes Model" job; flag as possible same job |
| Friedman (warehouse) | Rebekah | $5,445 | 9/22 | $2,722.50 | Existing Friedman job; flag |
| Northern #2 | Craig | $1,500 | 10/6 | $746 | Same client as Northern |
| O Hearn-Elements | Monica | $0 | 10/14 | — | Child of O Hearn |
| Westpoint-Nayer-Element Doors / -Garage | Craig | $0 | 10/5 | — | Children of Westpoint-Nayer |
| Lobo Element Doors | — | $0 | 10/2 | — | Child of Lobo |
| Dixon A/O Faces | Rebekah | $450 | 10/9 | $0 | Same client as Dixon |
| Moffitt 1MM | Gavin | $3,000 | 10/26 | $3,000 | Same client as Moffitt |
| Twist Add On Shelves | Rebekah | $0 | — | — | Same client as Twist |
| Luke | Craig | $1,000 | — | $400 | Flag against Silberman-Luke |
| Sanchez | Craig | $2,000 | — | $0 | — |
| Bell | Summer | $5,214.77 | — | $0 | — |
| Hartfield | Yvonne | $2,076.35 | 8/26 | $1,038.17 | Existing Hartfield job (closed); flag |
| Kalinowski | Summer | $4,500 | — | $2,250 | — |
| Roseburgh | Yvonne | $2,000 | — | $0 | — |
| Ascaya #115 | Craig | $0 | — | — | Same builder as Ascaya #114 |
| Prieto (installed) | ESP | $350 | 9/14 | $75 | Existing Prieto job; flag |

**Not created:**
- Misspelled repeats from the job-tracking tab: Oshner (= Ochsner), Occulee (= Oculee), Mahony (= Mahoney), Simmons (no data). Their visit dates are added as notes on the correct job.
**Created as service jobs (approved):** the 12 service visits from the job-tracking tab.
- Each one uses job kind `service`, the visit date as its scheduled date, the installer crew and the payment notes from the row.
- Each links to the client's original install job when exactly one install shares the last name, and is flagged otherwise.

| Service job | Visit date |
|---|---|
| Erikson SVC | 8/24 |
| Lefebvre SVC | 8/25 |
| Ganuza SVC | 8/27 |
| Chu SVC | 8/28 and 8/31 |
| Vaher SVC | 8/28 |
| Okko SVC | 8/28 and 8/31 |
| Fine SVC | 9/8 |
| Gordon SVC | 9/11 |
| Solbach SVC | 9/21 |
| Nemiroff SVC | 9/24 |

- Chu and Okko each had two visits. Each becomes **one** service job with both visit dates, so there are 10 service jobs covering 12 visits.
- Past visits are marked as done.

### 4.5 Job review list

The sheet wins, so this is a **change log**, not a list of things waiting for approval. It's a single report, `.tmp/review-jobs-2026-09-28.md`, plus a "Changed by sheet 9/28" filter on the Jobs page. Each row shows the OS value before, the sheet value after, and which tab it came from. It covers:
- Every amount, stage, install date and designer change, including the reopened jobs
- Jobs in the OS that aren't on any tab (left untouched)
- Pairs flagged "possibly the same job"

## Phase 5 — Consultations from the calendar

Rules:
- Each consultation becomes an appointment with kind `consultation`, the time from the calendar in Pacific time, the designer, and the address.
- Location: "@ address" means `on_site`; "SR FRONT" or "SR BACK" means `showroom`; "call" or "zoom" means `virtual`.
- Status: past dates are `completed`, future dates are `scheduled`, and anything marked cancelled is `cancelled`.

### 5.1 Scheduled leads

The 5 in 3.1, plus Cassi Wright's 10/13 showroom follow-up.

### 5.2 Past consultations for leads already in the OS

Add the appointment and advance the lead's stage from "New":

| Lead | Date / time | Designer | Location | New stage |
|---|---|---|---|---|
| Hailee Long | 8/31 12pm; showroom 9/4 10am; JC 9/7 | Yvonne | 8278 Sweetwater Creek Way 89113 | Moved to Studio (sold job Long) |
| Alex Brant | 9/2 10am | Cissy | 643 Ridgeview Bend St, Henderson 89015 | Scheduled (completed consult) |
| Michael Wasserburger | 9/2 12pm; showroom 9/4, 9/18 | Cissy | 10772 White Granite Ave 89135 | Scheduled |
| Quentin Wheaton | 9/3 10am | Yvonne | 10049 Copper Edge Rd 89148 | Scheduled |
| Tawny Bakke | 9/4 9am; showroom 9/11 | Rebekah | 9045 W Rosada Way 89149 | Scheduled (already, on the lead flagged as a duplicate) |
| Courtney Feldscher | 9/4 11:30am | Sandy | 10706 Monaco Beach Ave 89166 | Scheduled |
| Pam Howatt | 9/16 12pm; showroom 9/23; job check 9/25 | Yvonne | 5272 Villa Vecchio Ct 89141 | Moved to Studio (sold job Howatt) |
| Jason Chong | 9/1 1pm | Tania | 353 E Bonneville Ave 89101 | Moved to Studio (sold job Chong) |
| Sharan Ochsner | job check 9/1; showroom 8/30 | Yvonne | — | Already Moved to Studio |
| Susan Privman | showroom 9/7; job check 9/16 | Summer | 11280 Granite Ridge | Moved to Studio (sold job Privman) |
| Emily & Beau Cushman | 9/2 8am | Craig | 2925 Wigwam Pkwy #1421 | Already Moved to Studio |
| Chris Johnson | 9/11 1:30pm; showroom 9/15; job check 9/18 | Yvonne | 2496 Grassy Spring Pl 89135 | Already Moved to Studio |

### 5.3 Past consultations with no lead in the OS

These 22 people had a consultation on the calendar but were never entered in Community or the OS. **Approved: create a lead for each one.** Each gets:
- **Client:** name as written on the calendar (last name only when that's all it shows; "Sherri & Trey Wilson", "Renee Nichols", "Angela Porello", "Steve Hohenshil", "Soo Uh" and "Jamie & Marlon" as written), plus the address split into street, city, state and zip.
- **Lead:** source "Other" and `stage_raw = "From calendar"`. The staff member is the designer on the calendar; Jamie & Marlon has none listed, so it stays unassigned and is flagged. The created date is the first consultation date.
- **Stage:**
  - Moved to Studio when there's a sold job on the sheet: Schlobohm, Wilson, Hobson, Donaldson, Hohenshil, Kurle.
  - Canceled Appointment for Andrews.
  - Scheduled for everyone else, since the consultation took place.
- **Appointments:** every calendar entry for that person (the consultation, showroom visits and job checks), each with its date, time, designer, location and status.
- **Notes:** the calendar text word for word (for example "Dibari Kitchen Client", "Steve Hohenshil 460153", "Wilson – Sherri & Trey"), so nothing is lost.
- **Job link:** to the sold job when there is one (6.1). Moore is flagged against the existing "Moore" jobs instead (6.2).
- **Missing details:** phone and email stay blank, since the calendar doesn't have them. Each lead gets a "Missing phone/email — from calendar" tag, so Des can fill them in from Community.

| Name | Date / time | Designer | Address | Sold job on the sheet? |
|---|---|---|---|---|
| Padilla | 8/30 1pm | Yvonne | 344 E Rush Ave 89183 | — |
| Renee Nichols | 9/2 11:30am; showroom 9/5 | Sandy | — | — |
| Dibari (kitchen) | 9/4 10:30am | Rebekah | 11391 Peaks Landing Ave 89138 | — |
| Schlobohm | 9/9 4:30pm | Monica | 9857 Masterful Dr 89148 | Yes |
| Wilson (Sherri & Trey) | 9/11 2:30pm; showroom 9/17; JC 9/22 | Sandy | 4095 Russian Rider Dr 89122 | Yes |
| Hobson | 9/11 1pm; showroom 9/12 | Rebekah | 477 Cliff Terrace Ave 89138 | Yes |
| Miele | 9/12 9am | Rebekah | 2837 Red Springs Dr 89135 | — |
| Beckman | 9/14 8am | Yvonne | 10012 Mirada Dr 89144 | — |
| Rahman | 9/17 1pm; showroom 9/23 | Yvonne | 4814 Shady Ridge Dr 89135 | — |
| Soo Uh | 9/17 9am; showroom 9/21 | Rebekah | 12006 Girasole Ave 89138 | — |
| Mallori | 9/21 12pm | Yvonne | 12381 Brantley Cove Dr 89138 | — |
| Angela Porello | 9/21 1pm | Rebekah | 22 Carolina Cherry Dr | — |
| Donaldson | 9/22 10am; JC 9/25 | Cissy | 12613 Penfield Ave 89138 | Yes |
| Andrews | 9/22 1pm, **cancelled** | Monica | 5945 Palmilla St, N. Las Vegas 89031 | — |
| Blitz | 9/23 2pm; showroom 9/30 | Monica | 1273 Anamarie Ln, Henderson 89002 | — |
| Ronski | 9/24 12pm; showroom 9/24 5pm | Monica | 9425 Steeplehill Dr 89117 | — |
| Cana | 9/25 6pm | Sandy | 9217 Quartz Hills Ave 89178 | — |
| Moore | 9/25 9am | Cissy | 704 Everett Ridge Ave, N. Las Vegas 89084 | Existing "Moore" job; flag |
| Richter | 9/26 11am | Sandy | 8221 Impatiens Ave 89131 | — |
| Steve Hohenshil | 9/26 10am | Rebekah | 230 Tarragona Breeze Ave 89138 | Yes |
| Jamie & Marlon | 9/28 12pm | — | 11958 Girasole Ave 89138 | — |
| Kurle | showroom 9/4, 9/22 | Cissy | — | Yes |

### 5.4 Calendar entries that are not consultations

These are **not imported**: time off, meetings, "available" blocks, networking events, and personal appointments.

Job checks and final measures that match a job are added to that job's notes, not created as consultations. These are Ochsner, Skinner, Long, Northern, Privman, Howatt, Donaldson, Whittemore, Nelson, Whelan, O Hearn, Seberry, Pohlman, Vargas, Moffitt and Heinrich.

## Phase 6 — Connect leads to jobs

- **6.1 Auto-link.** Set `ic_jobs.lead_id` when a job has no lead and exactly one lead matches on last name, **plus** at least one of: phone, email, address, designer, or a calendar consultation before the sold date. Candidates: Long, Chong, Howatt, Bae, James.
- **6.2 Flag ("Confirm to link with job").** Used when the match is last name only, when there's more than one candidate, or when the lead already has jobs. Candidates:
  - Ken Smith ↔ K. SMITH / SMITH, K.
  - Sophie Jensen ↔ JENSEN
  - Cushman ↔ Cushman (warehouse)
  - Braunger, Pang and Privman (two leads each)
  - Moore ↔ Moore / Johnny Moore-Laundry
  - Hartfield, Friedman, Prieto, Luke ↔ Silberman-Luke
  - Signature Homes Model ↔ Model/Jessup
  - Westpoint-Vargas ↔ Vargas
- **6.3 Duplicate leads already in the OS.** Flag, don't merge. Each pair shows side by side:
  - Tawny Bakke (Scheduled + New)
  - Jeff Braunger (Moved to Studio + New)
  - Joyce Pang (Moved to Studio + New)
  - Susan Privman (Scheduled + New)
  - Sharan Ochsner (Scheduled + Moved to Studio)
  - Chris Johnson (Moved to Studio ×2)
- **6.4 No common info.** Nothing is linked, and the pair is listed in the report for you to decide.

## Phase 7 — Verify, then hand off

- 7.1 Automated checks after each phase:
  - No fake or test records remain.
  - 51 new leads were created: 5 scheduled and 24 unscheduled from Community, plus 22 from the calendar.
  - Every calendar lead has at least one appointment and the "from calendar" tag.
  - Barillas, Hetzel and Hagen each still have exactly 1 lead.
  - Every PDF lead has a staff member and its exact source.
  - Each scheduled lead has exactly 1 upcoming appointment.
  - No job lost an amount because of a blank cell on the sheet.
  - Every job matches the sheet on stage, amount, install date, designer and owes. Re-running the diff shows 0 differences.
  - 10 service jobs cover the 12 job-tracking visits.
  - NAVI and ESP exist as staff, and every sheet designer is linked.
  - No duplicate `workbook_ref` values.
- 7.2 Click-through in the browser: Leads list (filters, "Needs confirmation"), each of the 5 scheduled leads, Des's lead view, Jobs page (designers showing), and the Calendar (9/28 – 10/1).
- 7.3 Final report for you:
  - Counts per phase
  - Every flag with its reason
  - The job review list
  - The Unscheduled PDF is cut off at 25; send page 2 and the rest go in the same way.
- 7.4 Rollback: restore from the Phase 0 snapshot using the batch id.

## Order of execution

Phase 0, then 1, then 2, then 3, then 5, then 4, then 6, then 7.

Leads and appointments go in before jobs, so that new jobs can link to leads that already exist.

## Decisions (9/28)

1. **NAVI and ESP:** add them as designer staff (2.2).
2. **Calendar consultations with no lead:** create a lead for each of the 22, with all their calendar info and appointments (5.3).
3. **The sheet is the source of truth for jobs.** It wins on stage (including reopening closed jobs), amount, install date, designer, owes and notes (4.1–4.3).
4. **The 12 job-tracking service visits become service jobs** (4.4).
5. **Cassi Wright's 10/13 showroom follow-up is at 8:30am** (3.1).
