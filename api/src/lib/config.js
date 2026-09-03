module.exports = {
  TENANT_ID: process.env.AZURE_AD_TENANT_ID,
  GRAPH_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
  GRAPH_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
  SP_SITE_ID: process.env.SP_SITE_ID,
  SP_OPENHOUSE_LIST_ID: process.env.SP_OPENHOUSE_LIST_ID,
  SP_ADMINS_LIST_ID: process.env.SP_ADMINS_LIST_ID,
  // Comma-separated list of origins allowed to call this API (the static form's domains).
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  // Dedicated sign-in app for the admin dashboard (separate from the Graph
  // data app above, per playbook §9 — narrowly scoped, its own app reg).
  WEBAUTH_CLIENT_ID: process.env.WEBAUTH_CLIENT_ID,
  WEBAUTH_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
  // Permanent super-admin — never removable via the settings UI, and always
  // allowed even if the SharePoint admins list is ever empty/corrupted/
  // unreachable. Everyone else's admin access lives in the "Open House
  // Admins" SharePoint list (SP_ADMINS_LIST_ID), editable from the
  // settings gear in admin.html — see api/src/lib/admins.js.
  SUPER_ADMIN_EMAIL: "orojas@ilsroyals.com",

  // Cloudflare Turnstile (bot protection on the public registration form).
  // TURNSTILE_SECRET_KEY is intentionally unset until orojas provisions the
  // widget — submit.js skips verification entirely when it's blank, so the
  // form keeps working during rollout instead of hard-failing.
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || "",

  // Confirmation email (added 2026-09-03) — sent via Graph sendMail as this
  // mailbox once orojas provisions it. Same graceful-degradation pattern as
  // TURNSTILE_SECRET_KEY above: lib/email.js no-ops (submission still
  // succeeds) while this is blank, so shipping doesn't block on the mailbox
  // existing yet.
  CONFIRMATION_FROM_EMAIL: process.env.CONFIRMATION_FROM_EMAIL || "",
  EVENT_LOCATION: process.env.EVENT_LOCATION || "Immaculata-La Salle High School",
};
