const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { getRegistrationItem, updateRegistrationItem } = require("../lib/graph");
const { allow } = require("../lib/ratelimit");

app.http("checkinComplete", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "checkin/complete",
  handler: async (request, context) => {
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    if (!allow(request, { max: 15 })) {
      return { status: 429, headers, jsonBody: { error: "Too many requests, please slow down." } };
    }

    try {
      const body = await request.json();
      const id = String(body.id || "").trim();
      if (!id) {
        return { status: 400, headers, jsonBody: { error: "Missing id." } };
      }

      const item = await getRegistrationItem(id);
      if (!item || !item.StudentFirstName) {
        return { status: 404, headers, jsonBody: { error: "Registration not found." } };
      }

      // Idempotent — a family re-scanning the QR code or double-tapping
      // shouldn't error or reset the original check-in time.
      if (!item.CheckedIn) {
        await updateRegistrationItem(id, {
          CheckedIn: true,
          CheckedInAt: new Date().toISOString(),
        });
      }

      return {
        status: 200,
        headers,
        jsonBody: {
          success: true,
          studentFirstName: item.StudentFirstName,
          studentLastName: item.StudentLastName,
          alreadyCheckedIn: !!item.CheckedIn,
        },
      };
    } catch (e) {
      context.error(e);
      return { status: 500, headers, jsonBody: { error: "Unexpected server error." } };
    }
  },
});
