module.exports = {
  TENANT_ID: process.env.AZURE_AD_TENANT_ID,
  GRAPH_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
  GRAPH_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
  SP_SITE_ID: process.env.SP_SITE_ID,
  SP_OPENHOUSE_LIST_ID: process.env.SP_OPENHOUSE_LIST_ID,
  // Comma-separated list of origins allowed to call this API (the static form's domains).
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  // Dedicated sign-in app for the admin dashboard (separate from the Graph
  // data app above, per playbook §9 — narrowly scoped, its own app reg).
  WEBAUTH_CLIENT_ID: process.env.WEBAUTH_CLIENT_ID,
  WEBAUTH_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
  // Hardcoded allowlist, not SharePoint-site membership — lets IT assign
  // "admin" here independent of who's on the SharePoint site (see
  // ils-swa-playbook §9's in-app admin gate convention). Confirmed with
  // orojas 2026-09-02: just him + morelle@ilsroyals.com for now.
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || "orojas@ilsroyals.com,morelle@ilsroyals.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};
