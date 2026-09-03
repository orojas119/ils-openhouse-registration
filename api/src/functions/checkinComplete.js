const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { getRegistrationItem, updateRegistrationItem, listRegistrationItems } = require("../lib/graph");
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

      // A family can correct their party size at check-in. Let through any
      // whole number >= 1; anything else in the body is ignored rather than
      // rejected, so a malformed value never blocks the actual check-in.
      const requestedAttendeeCount = Number(body.attendeeCount);
      const hasNewAttendeeCount =
        Number.isInteger(requestedAttendeeCount) &&
        requestedAttendeeCount >= 1 &&
        requestedAttendeeCount !== Number(item.AttendeeCount);

      const alreadyCheckedIn = !!item.CheckedIn;

      // Idempotent — a family re-scanning the QR code or double-tapping
      // shouldn't error or reset the original check-in time.
      const fields = {};
      if (!alreadyCheckedIn) {
        fields.CheckedIn = true;
        fields.CheckedInAt = new Date().toISOString();
      }
      if (hasNewAttendeeCount) fields.AttendeeCount = requestedAttendeeCount;
      if (Object.keys(fields).length > 0) {
        await updateRegistrationItem(id, fields);
      }

      // Siblings from the same submission share this party size (see
      // SubmissionId, added 2026-09-03) — keep them in sync so the admin
      // dashboard's deduped guest total stays correct regardless of which
      // sibling's row was edited.
      if (hasNewAttendeeCount && item.SubmissionId) {
        const siblings = await listRegistrationItems();
        for (const sib of siblings) {
          if (sib.id === id || sib.SubmissionId !== item.SubmissionId) continue;
          await updateRegistrationItem(sib.id, { AttendeeCount: requestedAttendeeCount });
        }
      }

      return {
        status: 200,
        headers,
        jsonBody: {
          success: true,
          studentFirstName: item.StudentFirstName,
          studentLastName: item.StudentLastName,
          alreadyCheckedIn,
          attendeeCount: hasNewAttendeeCount ? requestedAttendeeCount : Number(item.AttendeeCount) || null,
        },
      };
    } catch (e) {
      context.error(e);
      return { status: 500, headers, jsonBody: { error: "Unexpected server error." } };
    }
  },
});
