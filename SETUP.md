# Open House Registration — Setup

Public-facing registration form for ILS Open House events, built off the paper
"Open House Registration" form (Archdiocese-style layout) plus handwritten
annotations from orojas, refined into a final field spec in chat.

Static HTML (no login — this is filled out by prospective families, not staff),
POSTing to a small Azure Function that writes into a SharePoint list on
`ilsforms` via Microsoft Graph (app-only), reusing the same iHelp Graph app and
site as [[driver-mvr-form]] — zero new admin consent needed (Sites.Selected
grants are site-wide).

## Branding

Uses ILS's own identity (not the Archdiocese of Miami look Driver MVR uses,
since that form is a diocesan legal document and this one is ILS's own
admissions funnel): green `#004B23` / gold `#FFC20E`, Poppins headings /
Montserrat body, and the real ILS crest (downloaded from ilsroyals.com,
`assets/crest.png`) — not the Archdiocese shield `crest.jpeg` that Driver MVR
uses.

## Form fields (final spec, confirmed in chat)

**Student Information**
- First / Middle (optional) / Last Name
- Have you ever attended an ILS Open House? (Yes/No) → if Yes, "If so, when?" (year)
- Student's Current Grade Level (5th–11th grade)
- Date of Birth, Gender
- School CURRENTLY Attending — searchable combobox (`schools-data.js`, 227
  curated Miami-Dade middle/high schools) with free-text fallback for anything
  not listed. If the typed/selected school matches an Archdiocese of Miami
  (ADOM) entry, a required "Current PowerSchool Number" field appears (ADOM
  schools share one PowerSchool instance).
- How many people attending (incl. student)? — plain number input, no cap
  (per orojas: the original handwritten "1–5" note doesn't need to be a hard
  limit)
- How did you hear about the school? (checkboxes, multi-select) — Website,
  Advertising, Current Parent/Student, Past Parent, Alumni, Reputation/Word of
  Mouth, Social Media, Other

**Parent/Guardian Information**
- Salutation, First/Last Name, Address, City, State (default FL), ZIP
- Home Phone*, Cell Phone* (required), Office Phone (optional — the printed
  form marked it required alongside the other two, but orojas confirmed
  relaxing this), E-Mail*

Public intake form → has a honeypot field (`website`, off-screen, checked
server-side in `submit.js`) since there's no auth gate to deter spam. No
Turnstile/rate-limiting yet — add once real traffic starts, per the standard
playbook guidance for public forms.

## School list — `schools-data.js`

Compiled via research pass 2026-08-31: Archdiocese of Miami's official school
directory (cross-checked against each school's live site) for all `isADOM:
true` entries (60 schools, spanning Miami-Dade/Broward/Monroe — ADOM is a
tri-county diocese), plus a curated (not exhaustive) 167-school cross-section
of Miami-Dade public/charter/private middle & high schools for everything
else. 227 entries total, no duplicates, alphabetically sorted.

**Known gaps** (from the research agent's own report — read before treating
this as authoritative):
- Not a full county enumeration — M-DCPS alone runs ~300+ schools; this
  covers the well-known majority, not every alternative/vocational center or
  minor charter campus.
- ADOM's own materials claim "14 secondary schools" but only 12 could be
  verified (8 archdiocesan + 4 religious-order-sponsored) — the other 2 may be
  a double-count or a since-closed program.
- Exact school-name spellings should get a spot-check against
  dadeschools.net's live school locator before this ships — the agent
  couldn't render that ArcGIS-based locator via automated fetch.
- If the family's school isn't in the list, the field still accepts free
  typing — that input just won't auto-detect as ADOM, so PS# won't
  auto-prompt. Not a blocker, just a known limitation of the curated-list
  approach.

## What's built vs. still pending

**Built and verified locally** (`python3 -m http.server 8935`, then
`http://localhost:8935/index.html`):
- Full 3-step form (Student → Parent/Guardian → Review), stepper nav,
  client-side validation, conditional fields (attended-before year, ADOM →
  PowerSchool #) all confirmed working in a real browser pass.
- `api/` Azure Function (`submit.js`) — validates required fields, honeypot
  check, writes one SharePoint list item via `graph.js`. Not yet deployed or
  tested against a real SharePoint list.

**Not yet done** (needs explicit go-ahead before touching any live/shared
resource):
1. Provision the `Open House Registrations` SharePoint list on `ilsforms`
   via the device-code recipe in the playbook (§6) — column list still needs
   finalizing to match the fields above (see suggested column names in
   `submit.js`'s payload).
2. Register/deploy the Azure Function App (`func-openhouse`, resource group
   `rg-openhouse`, matching Driver MVR's standalone-Function-App shape rather
   than SWA's managed backend) and wire `SUBMIT_URL` in `index.html` to the
   real endpoint.
3. Create the GitHub repo, push, enable GitHub Pages, and (optionally) bind a
   custom subdomain (e.g. `openhouse.ilsroyals.com`) — no `CNAME` file exists
   yet since no domain decision has been made.
4. `az functionapp cors add` for the real allowed origins once the domain is
   known (see Driver MVR gotcha #2 — CORS preflight is platform-level, not
   in-code).

## Local testing

```
python3 -m http.server 8935   # from the repo root
```
Open `http://localhost:8935/index.html`. The form works fully client-side up
through Review; Submit will fail until the real `SUBMIT_URL` Function is
deployed (no debug-bypass needed here since there's no auth to bypass).
