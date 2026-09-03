const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { AuthError, requireAdmin } = require("../lib/auth");
const { listAdmins, addAdmin, removeAdmin } = require("../lib/admins");
const { SUPER_ADMIN_EMAIL } = require("../lib/config");

const EMAIL_RE = /^[^\s@]+@ilsroyals\.com$/i;

app.http("adminSettingsList", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  // Not "admin/*" — that route segment 404s at the platform level on Azure
  // Functions regardless of registration. See ils-swa-playbook §3.7.
  route: "staff/admins",
  handler: async (request, context) => {
    const headers = corsHeaders(request, "Content-Type, x-app-access-token");
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    try {
      await requireAdmin(request);

      if (request.method === "GET") {
        const admins = await listAdmins();
        return { status: 200, headers, jsonBody: { admins } };
      }

      // POST — add a new admin
      const body = await request.json();
      const email = String(body.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return { status: 400, headers, jsonBody: { error: "Enter a valid @ilsroyals.com email address." } };
      }
      const existing = await listAdmins();
      if (existing.some((a) => a.email.toLowerCase() === email)) {
        return { status: 400, headers, jsonBody: { error: "That person is already an admin." } };
      }
      await addAdmin(email);
      return { status: 200, headers, jsonBody: { success: true } };
    } catch (e) {
      if (e instanceof AuthError) return { status: e.status, headers, jsonBody: { error: e.message } };
      context.error(e);
      return { status: 500, headers, jsonBody: { error: e.message || "Unexpected server error." } };
    }
  },
});

app.http("adminSettingsRemove", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "staff/admins/{id}",
  handler: async (request, context) => {
    const headers = corsHeaders(request, "Content-Type, x-app-access-token");
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    try {
      await requireAdmin(request);
      const { id } = request.params;

      const existing = await listAdmins();
      const target = existing.find((a) => a.id === id);
      if (target && target.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        return { status: 400, headers, jsonBody: { error: "The super admin can't be removed." } };
      }

      await removeAdmin(id);
      return { status: 200, headers, jsonBody: { success: true } };
    } catch (e) {
      if (e instanceof AuthError) return { status: e.status, headers, jsonBody: { error: e.message } };
      context.error(e);
      return { status: 500, headers, jsonBody: { error: e.message || "Unexpected server error." } };
    }
  },
});
