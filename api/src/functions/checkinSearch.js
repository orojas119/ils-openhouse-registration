const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { listRegistrationItems } = require("../lib/graph");
const { allow } = require("../lib/ratelimit");

const MAX_RESULTS = 20;

// Only what a family needs to confirm "yes, that's us" among same-surname
// registrations — no DOB/address/phone/email/PowerSchool #. They already
// typed the last name to search, so echoing it back isn't new exposure;
// grade + school are the disambiguators for common surnames.
function toPublicResult(item) {
  return {
    id: item.id,
    studentFirstName: item.StudentFirstName,
    studentLastName: item.StudentLastName,
    gradeLevel: item.GradeLevel,
    schoolAttending: item.SchoolAttending,
    attendeeCount: item.AttendeeCount,
    checkedIn: !!item.CheckedIn,
  };
}

app.http("checkinSearch", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "checkin/search",
  handler: async (request, context) => {
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    if (!allow(request, { max: 30 })) {
      return { status: 429, headers, jsonBody: { error: "Too many requests, please slow down." } };
    }

    try {
      const q = (request.query.get("q") || "").trim().toLowerCase();
      if (q.length < 2) {
        return { status: 200, headers, jsonBody: { results: [] } };
      }

      const items = await listRegistrationItems();
      const matches = items
        .filter((item) => (item.StudentLastName || "").toLowerCase().includes(q))
        .slice(0, MAX_RESULTS)
        .map(toPublicResult);

      return { status: 200, headers, jsonBody: { results: matches } };
    } catch (e) {
      context.error(e);
      return { status: 500, headers, jsonBody: { error: "Unexpected server error." } };
    }
  },
});
