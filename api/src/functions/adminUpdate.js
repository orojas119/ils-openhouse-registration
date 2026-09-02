const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { AuthError, requireAdmin } = require("../lib/auth");
const { updateRegistrationItem } = require("../lib/graph");

// Fields staff are allowed to correct/toggle from the admin dashboard.
// Deliberately excludes SubmittedAt/Title (server-derived) and anything not
// on the list schema.
const WRITABLE_FIELDS = [
  "StudentFirstName", "StudentMiddleName", "StudentLastName",
  "AttendedBefore", "AttendedWhenYear", "GradeLevel", "DateOfBirth", "Gender",
  "SchoolAttending", "IsADOMSchool", "PowerSchoolNumber", "AttendeeCount", "HeardAbout",
  "ParentSalutation", "ParentFirstName", "ParentLastName", "ParentAddress",
  "ParentCity", "ParentState", "ParentZip", "ParentHomePhone", "ParentCellPhone",
  "ParentOfficePhone", "ParentEmail",
  "CheckedIn", "CheckedInAt",
];

app.http("adminUpdateRegistration", {
  methods: ["PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "staff/registrations/{id}",
  handler: async (request, context) => {
    const headers = corsHeaders(request, "Content-Type, x-app-access-token");
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    try {
      await requireAdmin(request);
      const { id } = request.params;
      const body = await request.json();

      const fields = {};
      for (const key of Object.keys(body)) {
        if (WRITABLE_FIELDS.includes(key)) fields[key] = body[key];
      }
      if (Object.keys(fields).length === 0) {
        return { status: 400, headers, jsonBody: { error: "No writable fields provided." } };
      }
      // Manual check-in toggle from the dashboard stamps the time itself,
      // same as the public self-checkin flow, so admin overrides stay
      // consistent with the "when did they actually arrive" stat.
      if (fields.CheckedIn === true && !fields.CheckedInAt) {
        fields.CheckedInAt = new Date().toISOString();
      }
      if (fields.CheckedIn === false) {
        fields.CheckedInAt = null;
      }

      await updateRegistrationItem(id, fields);
      return { status: 200, headers, jsonBody: { success: true } };
    } catch (e) {
      if (e instanceof AuthError) return { status: e.status, headers, jsonBody: { error: e.message } };
      context.error(e);
      return { status: 500, headers, jsonBody: { error: e.message || "Unexpected server error." } };
    }
  },
});
