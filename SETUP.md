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

**Provisioned 2026-08-31:**
1. ✅ `Open House Registrations` SharePoint list created on `ilsforms` via the
   device-code recipe (`scripts/provision-list.mjs`) — List ID
   `a56759e2-08e0-44f2-a7ce-5bda2c94f119`. Required adding a delegated
   `Sites.FullControl.All` permission to the shared iHelp Graph app first;
   orojas ran `az ad app permission add` + `az ad app permission grant`
   himself (NOT `admin-consent` — that command tries to consent to *all* of
   the app's permissions at once, including its pre-existing application-level
   ones, which only a Global Admin can touch, even though we only needed the
   one new delegated scope — see playbook §3.1).
2. ✅ `func-openhouse` Function App created (`rg-openhouse`, Linux, Node 22)
   and its non-secret app settings + the list ID above are set. `SUBMIT_URL`
   in `index.html` already points at it.
3. ✅ GitHub repo created: `orojas119/ils-openhouse-registration`.
4. ✅ CORS configured (`localhost:8935`, GitHub Pages, `openhouse.ilsroyals.com`).
5. ✅ `CNAME` file added (`openhouse.ilsroyals.com`).

**Still not done** — these specific actions get blocked by Claude Code's
auto-mode classifier when attempted via tool calls (each touches
shared/production state), so orojas has to run them himself:
1. Create a new client secret on the iHelp Graph app for this Function
   (`AZURE_AD_CLIENT_SECRET` app setting is still unset — Graph calls will
   fail until this is done):
   ```
   az ad app credential reset --id b0128bc3-7e7d-4e1a-b8d8-24a045b85e72 --append --display-name "func-openhouse" --years 1 --query "password" -o tsv
   az functionapp config appsettings set --name func-openhouse --resource-group rg-openhouse --settings "AZURE_AD_CLIENT_SECRET=<paste secret>"
   ```
2. Deploy the function code:
   ```
   cd api && func azure functionapp publish func-openhouse
   ```
3. Push to GitHub:
   ```
   git push -u origin main
   ```
4. Enable GitHub Pages (Settings → Pages → source: `main` / `/`) and confirm
   DNS for `openhouse.ilsroyals.com` points at GitHub Pages (the `CNAME` file
   alone doesn't create the DNS record).

## Local testing

```
python3 -m http.server 8935   # from the repo root
```
Open `http://localhost:8935/index.html`. The form works fully client-side up
through Review; Submit will fail until the real `SUBMIT_URL` Function is
deployed (no debug-bypass needed here since there's no auth to bypass).
