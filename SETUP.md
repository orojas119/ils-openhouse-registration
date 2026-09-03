# Open House Registration — Setup

Public-facing registration form for ILS Open House events, built off the paper
"Open House Registration" form (Archdiocese-style layout) plus handwritten
annotations from orojas, refined into a final field spec in chat.

Static HTML (no login — this is filled out by prospective families, not staff),
POSTing to a small Azure Function that writes into a SharePoint list on
`ilsforms` via Microsoft Graph (app-only), reusing the same iHelp Graph app and
site as [[driver-mvr-form]] — zero new admin consent needed (Sites.Selected
grants are site-wide).

## Self-service admin management (added 2026-09-03)

`admin.html` has a gear icon (header, next to Sign Out) opening an **Admin
Settings** modal where any current admin can add or remove other
`@ilsroyals.com` admins — no code change or redeploy needed to onboard a
new admin.

**Architecture change this required:** the sign-in app
(`ILS-OpenHouse-Admin-WebAuth`)'s Enterprise Application was previously
restricted via `appRoleAssignmentRequired: true` with only orojas/morelle
explicitly assigned — Microsoft itself blocked anyone else's sign-in
attempt. That's now **relaxed to `false`** (confirmed with orojas): any
`@ilsroyals.com` account can reach the login flow, but `api/src/lib/auth.js`
still checks the caller's email against the admin list before granting
access — same net security, just enforced by our backend instead of
Entra. This trade avoided needing a new high-privilege Graph permission
(`AppRoleAssignment.ReadWrite.All`, application-scoped, requires Global
Admin consent) just to let admins manage each other via the Graph API —
see the "recommended vs. Entra-lock" tradeoff discussed with orojas before
building this.

**Data store:** the old static `ADMIN_EMAILS` Function App setting is gone.
Admins now live in a new SharePoint list, **"Open House Admins"**
(`SP_ADMINS_LIST_ID`, provisioned via `scripts/add-admins-list.mjs`, seeded
with orojas + morelle), checked dynamically by `api/src/lib/admins.js`
with a 30s in-memory cache (so a just-added/removed admin takes effect
within half a minute, without hitting Graph on every request).

- `orojas@ilsroyals.com` is a **hardcoded permanent super admin**
  (`SUPER_ADMIN_EMAIL` in `config.js`) — always allowed even if the
  SharePoint list is ever empty/unreachable, and can't be removed via the
  UI or a direct API call (`DELETE /api/staff/admins/{id}` 400s if the
  target is the super admin — verified both the UI hides the button *and*
  the backend rejects a forged direct call).
- New endpoints on `func-openhouse`: `GET/POST /api/staff/admins`,
  `DELETE /api/staff/admins/{id}` — all admin-only, same JWT+allowlist
  gate as the other `/api/staff/*` routes. (Route is `staff/admins`, not
  `admin/admins` — same platform-level 404 gotcha as before, see
  [[swa-reserved-admin-route]].)
- Add-admin validates the email is `@ilsroyals.com` and not already an
  admin; remove uses a **two-step in-page confirm** (click "Remove" →
  button becomes red "Confirm Remove" + a "Cancel", no native
  `window.confirm()` — that call actually froze the Claude-in-Chrome
  browser-automation session mid-test the first time it was tried, so it
  was replaced before shipping).

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

Public intake form → layered bot defenses added 2026-09-03 (see below):
honeypot, per-IP rate limiting, a fill-time check, and Cloudflare Turnstile.

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

**Also done 2026-09-01:**
6. ✅ Client secret created for `func-openhouse` (orojas ran the
   `az ad app credential reset` himself; the printed value was set as
   `AZURE_AD_CLIENT_SECRET`).
7. ✅ Function code deployed (`func azure functionapp publish func-openhouse
   --javascript` — the `--javascript` flag is required since there's no real
   `local.settings.json` locally, only the gitignored `.example`).
8. ✅ Pushed to GitHub, GitHub Pages enabled (`main` / `/`), custom domain
   `openhouse.ilsroyals.com` set via the API (picked up the `CNAME` file
   automatically).
9. ✅ **Found and fixed a real bug during end-to-end testing:** Microsoft
   Graph's `/items` write endpoint rejects array values for a multi-select
   Choice column outright (`HeardAbout` was originally created with
   `allowMultipleSelection: true`) — confirmed via direct Graph calls that a
   plain string writes fine but the documented array format fails on both
   POST and PATCH with a generic `invalidRequest` 400. Fixed by converting
   the column to plain text (`scripts/fix-heardabout-column.mjs`) and joining
   selections into a semicolon-delimited string in `submit.js` before
   writing. **If a future ILS tool wants a true multi-select field written
   via Graph, don't repeat this — store it as delimited text from the start.**
10. ✅ Verified end-to-end against the live deployed Function + real
    SharePoint list (test item created, fields confirmed correct, deleted
    afterward).

**DNS: done (2026-09-02).** `openhouse.ilsroyals.com` now has its CNAME
record pointing at `orojas119.github.io`, matching `drivermvr.ilsroyals.com`.
HTTPS certificate issued and enforced; verified `index.html`, `checkin.html`,
and `admin.html` all load correctly and sign-in works over the real domain.

## Bot protection + shareable QR page (added 2026-09-03)

**Layered defenses on `POST /api/submit`** (registration form only — the
`checkin/search|complete` endpoints already had rate limiting from day one):
1. **Honeypot** (`website` field) — unchanged from launch.
2. **Per-IP rate limit** — 10/min, `api/src/lib/ratelimit.js` (in-memory,
   best-effort per Consumption-plan caveats already noted there).
3. **Fill-time check** — `index.html` stamps `FORM_LOADED_AT = Date.now()`
   on page load and sends it as `formLoadedAt`; `submit.js` silently
   no-ops (`{success:true}`, no SharePoint write) if the submission arrives
   less than `MIN_FILL_MS` (4000ms) after load — a real 3-step form takes
   humans far longer, so this catches direct-to-API bots without needing
   the honeypot to be naive enough to fill every field. Silent, not a 4xx,
   so a scraper can't distinguish which layer caught it.
4. **Cloudflare Turnstile** — real bot-vs-human verification. Widget
   (`0x4AAAAAAEl-8LJPCEUw1VvF`, Managed mode) sits on the Review step;
   `submit.js` verifies the token server-side via
   `api/src/lib/turnstile.js` against `challenges.cloudflare.com/turnstile/v0/siteverify`
   using `TURNSTILE_SECRET_KEY` (Function App setting only, never
   committed). **Verification is skipped entirely if
   `TURNSTILE_SECRET_KEY` is unset** — lets the form keep working if the
   widget ever needs to be pulled/reprovisioned without a code change.

Verified all three layers reject bot-shaped requests end-to-end against the
live endpoint (missing `formLoadedAt`, too-fast `formLoadedAt`, and a valid
timing but missing Turnstile token — first two silently no-op, the third
gets an explicit 400) while a real browser submission (Turnstile
auto-passing in Managed mode, realistic fill time) still succeeds. No bot
attempt created a SharePoint item; the one real test submission was deleted
after confirming its fields.

**Shareable QR page — `qr.html`.** Public, no sign-in, full ILS branding,
large QR code linking to `checkin.html` with **the ILS crest embedded in
the center** — a cropped/padded version of the shield (`assets/crest-mark.png`,
generated from `assets/crest.png` via Pillow, not committed as a build step)
composited into a custom-rendered SVG (not the library's `createSvgTag()`,
which doesn't support a center image) using `qrcode-generator`'s
`isDark()`/`getModuleCount()` directly, at error-correction level **H**
(tolerates ~30% obstruction — the logo + white backing covers ~26%).
**Verified the logo doesn't break scannability** by screenshotting the
rendered code and decoding it with OpenCV's `QRCodeDetector` in a throwaway
venv — decoded back to the exact `checkin.html` URL. `admin.html`'s
"Show QR Code" button now just opens this page in a new tab instead of
duplicating QR-rendering logic in a modal (the old modal/logic was removed).

## Mobile optimization (added 2026-09-03)

`index.html` and `checkin.html` — the two pages families actually use on
their phones — got a real mobile pass. **Testing note for next time:** the
Claude-in-Chrome `resize_window` tool doesn't actually constrain the page's
viewport in this environment (the window appeared tiled/maximized and
`window.innerWidth` stayed at the full screen width regardless). Worked
around it with a same-origin iframe harness (`<iframe width="320">` etc. —
iframes get their own real viewport from their width/height attributes
regardless of the outer window) to test real 320px/375px rendering. Found
and fixed genuine bugs, not just guesses:

- **Header wrap**: "Immaculata-La Salle High School" was right at the wrap
  boundary on narrow phones. Added `white-space:nowrap` + ellipsis as a
  safety net, plus a `≤420px` rule shrinking the crest/font/padding so it
  fits on one line instead of breaking mid-name.
- **Step-nav buttons**: fixed horizontal padding + long labels (e.g. "Next:
  Parent/Guardian Info →") wrapped to 2-3 lines on narrow screens. Now
  stack full-width below 480px.
- **Cloudflare Turnstile overflow**: the default widget is a fixed ~300px
  box — wider than the card's content area on a 320px phone, clipping the
  Cloudflare branding/links past the card edge. Fixed two ways: switched to
  Turnstile's `data-size="flexible"` (confirmed real and responsive by
  testing against the live widget script rather than assuming the
  attribute exists) and tightened `.container`/`.card` padding below
  `420px` to give it more room to work with.
- **checkin.html overflow**: the search input+button row and a result-card
  (long name + "Checked In" badge) both overflowed the card at 320px.
  Fixed with `min-width:0` on the shrinking flex children (the classic fix
  for a flex item refusing to shrink below its content's natural width),
  `flex-shrink:0` on the badge, and a `≤360px` rule that stacks the search
  row vertically.

All fixes verified visually at 320px/375px, including a full real
submission at 320px width with Turnstile completing successfully — not just
"looks right," actually exercised.

## Admin dashboard + self-service check-in (added 2026-09-02)

Modeled after morelle's existing "2025-26 Open House Check In.xlsx" front-desk
spreadsheet (PreRegistered tab: roster + "Student is here?" check-in column +
live stats), but check-in itself is **self-service** per orojas — families
scan a QR code and check themselves in rather than staff doing it manually.

**Two new pages:**
- `checkin.html` — public, no sign-in. Search by last name → shows only
  safe-for-public fields (first/last name, grade, school, party size) to
  confirm identity → "Complete Check-In" → success screen to show staff.
  Idempotent (re-scanning/double-tapping doesn't error or reset the time).
- `admin.html` — sign-in gated (new dedicated Entra app, see below).
  Stats cards (Registered, Checked In, Not Yet Arrived, Total/Checked-In
  Guests, Avg Guests/Student), searchable roster table with a manual
  check-in/undo toggle (for edge cases where self-checkin fails) and a
  click-through detail modal with full parent contact info, a walk-in
  quick-add form (flags `IsWalkIn`, auto-checks-in), and a "Show QR Code"
  button that renders a QR (vendored `assets/qrcode.min.js`, MIT-licensed
  kazuhikoarase/qrcode-generator — no runtime CDN dependency) pointing at
  `checkin.html` on whichever domain it's viewed from.

**New SharePoint columns** (`scripts/add-checkin-columns.mjs`): `CheckedIn`
(Yes/No), `CheckedInAt` (date), `IsWalkIn` (Yes/No).

**New backend endpoints** on `func-openhouse`:
- `GET/POST /api/staff/registrations` — admin-only (list all / walk-in
  create). **Route is `staff/*`, not `admin/*`** — see the gotcha below.
- `PATCH /api/staff/registrations/{id}` — admin-only (edit/check-in toggle).
- `GET /api/checkin/search?q=`, `POST /api/checkin/complete` — public,
  IP-rate-limited (`api/src/lib/ratelimit.js`, in-memory, best-effort only —
  Consumption-plan instances are ephemeral, revisit if this ever needs to
  survive real abuse).

**Admin dashboard sign-in app** — `ILS-OpenHouse-Admin-WebAuth`
- App (client) ID: `c8cb8dd4-153c-428b-aca0-c2c3e8a74f5b`, tenant
  `8109e949-d281-46a4-af75-b18087925bf4` (dedicated app, separate from the
  iHelp Graph data app, per playbook §9).
- SPA redirect URIs: `https://openhouse.ilsroyals.com/admin.html`,
  `https://orojas119.github.io/ils-openhouse-registration/admin.html`,
  `http://localhost:8935/admin.html`.
- Exposes its own API scope `api://c8cb8dd4-153c-428b-aca0-c2c3e8a74f5b/access_as_user`
  (`requestedAccessTokenVersion: 2` set explicitly — see
  [[az-ad-app-create-v1-token-bug]]). Backend validates this audience+scope
  via `api/src/lib/auth.js` (jose + JWKS), then checks the caller's email
  against `ADMIN_EMAILS` — a hardcoded allowlist, not SharePoint membership
  (playbook §9's in-app admin gate convention).
- **Enterprise Application restricted via `appRoleAssignmentRequired: true`**,
  explicitly assigned to `orojas@ilsroyals.com` and `morelle@ilsroyals.com`
  only (confirmed with orojas 2026-09-02) — anyone else's Microsoft sign-in
  attempt is rejected before reaching the app.
- Creating this app registration (new app, not modifying the shared iHelp
  app) was **not** blocked by Claude Code's auto-mode classifier, unlike
  modifying the shared app's permissions/secrets — only touching genuinely
  shared/production infra seems to trigger that block.

**Gotcha hit and fixed:** the admin routes were originally `admin/registrations`
and 404'd on every real request (GET *and* POST) with no function-runtime
response — bare platform `Kestrel` 404, even though `func function list`
showed the route registered correctly and OPTIONS preflight succeeded fine
(OPTIONS is always platform-intercepted regardless of whether the route
exists, so it can't be used to sanity-check a route). This is the same
symptom as [[swa-reserved-admin-route]], previously thought to be Azure
Static Web Apps-specific — **confirmed here on a standalone Function App,
so it's not SWA-only.** Renamed the route segment from `admin` to `staff`
and it worked immediately, no other change. Folded into
[[ils-swa-playbook]] §3.7 as a general Azure Functions gotcha.

## Local testing

```
python3 -m http.server 8935   # from the repo root
```
Open `http://localhost:8935/index.html` for the registration form,
`/checkin.html` for the public self-check-in flow, or `/admin.html` for the
dashboard (needs a real @ilsroyals.com sign-in — orojas or morelle only).
Submit/search/check-in all hit the real deployed Function — there's no local
API emulation, so test data lands in the real SharePoint list; clean up any
test rows afterward via the Graph API or the SharePoint UI directly.
