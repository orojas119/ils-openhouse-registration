const crypto = require("crypto");
const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { createRegistrationItem } = require("../lib/graph");
const { allow } = require("../lib/ratelimit");
const { verifyTurnstile } = require("../lib/turnstile");
const { sendConfirmationEmail } = require("../lib/email");

// A real 3-step form takes real humans well over this long to fill out —
// anything submitted faster almost certainly skipped the UI entirely
// (a bot POSTing straight to the endpoint). Cheap, no-dependency signal
// layered alongside the honeypot, rate limit, and Turnstile below.
const MIN_FILL_MS = 4000;

// Per-student fields — one registration can now list multiple students
// (siblings), each becoming its own SharePoint row that shares the fields
// below (same pattern as [[driver-mvr-form]]'s one-row-per-driver).
const REQUIRED_STUDENT_FIELDS = [
  "firstName",
  "lastName",
  "attendedBefore",
  "gradeLevel",
  "dateOfBirth",
  "gender",
  "schoolAttending",
];

// Shared once per submission, not per student — notably attendeeCount,
// which used to be per-student and double-counted party size across
// siblings on the admin dashboard's guest-total stats (fixed 2026-09-03).
const REQUIRED_SHARED_FIELDS = [
  "attendeeCount",
  "salutation",
  "parentFirstName",
  "parentLastName",
  "address",
  "city",
  "state",
  "zip",
  "homePhone",
  "cellPhone",
  "email",
];

app.http("submitOpenHouse", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "submit",
  handler: async (request, context) => {
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    if (!allow(request, { max: 10 })) {
      return { status: 429, headers, jsonBody: { error: "Too many submissions, please try again in a minute." } };
    }

    try {
      const body = await request.json();

      // Honeypot: a hidden field real visitors never fill in. Bots that fill
      // every input trip this; report success without writing anything.
      if (body.website) {
        return { status: 200, headers, jsonBody: { success: true } };
      }

      // Fill-time check: formLoadedAt is stamped client-side when the page
      // loads. A submission arriving faster than a human could plausibly
      // complete a 3-step form is treated as a bot — reported as success
      // (same as the honeypot) so a scraper doesn't learn which signal caught it.
      const formLoadedAt = Number(body.formLoadedAt);
      if (!formLoadedAt || Date.now() - formLoadedAt < MIN_FILL_MS) {
        return { status: 200, headers, jsonBody: { success: true } };
      }

      const turnstileOk = await verifyTurnstile(body.turnstileToken, request.headers.get("x-forwarded-for"));
      if (!turnstileOk) {
        return { status: 400, headers, jsonBody: { error: "Bot verification failed. Please reload the page and try again." } };
      }

      if (!Array.isArray(body.students) || body.students.length === 0) {
        return { status: 400, headers, jsonBody: { error: "At least one student is required." } };
      }
      for (const s of body.students) {
        for (const f of REQUIRED_STUDENT_FIELDS) {
          if (!s[f] || !String(s[f]).trim()) {
            return { status: 400, headers, jsonBody: { error: `Missing required student field: ${f}` } };
          }
        }
        if (s.attendedBefore === "Yes" && !String(s.attendedWhenYear || "").trim()) {
          return { status: 400, headers, jsonBody: { error: "Missing required field: attendedWhenYear" } };
        }
        if (s.isADOMSchool && !String(s.powerSchoolNumber || "").trim()) {
          return { status: 400, headers, jsonBody: { error: "Missing required field: powerSchoolNumber" } };
        }
      }

      for (const f of REQUIRED_SHARED_FIELDS) {
        if (!body[f] || !String(body[f]).trim()) {
          return { status: 400, headers, jsonBody: { error: `Missing required field: ${f}` } };
        }
      }
      if (!Array.isArray(body.heardAbout) || body.heardAbout.length === 0) {
        return { status: 400, headers, jsonBody: { error: "Select at least one way you heard about the school." } };
      }

      const submittedAt = new Date().toISOString().slice(0, 10);
      // Ties sibling rows from this submission together — lets the admin
      // dashboard dedupe the shared AttendeeCount instead of summing it once
      // per sibling, and lets check-in propagate a party-size edit to every
      // sibling row (see SubmissionId column, added 2026-09-03).
      const submissionId = crypto.randomUUID();
      let created = 0;
      for (const s of body.students) {
        const studentFullName = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
        await createRegistrationItem({
          Title: studentFullName,
          StudentFirstName: s.firstName,
          StudentMiddleName: s.middleName || "",
          StudentLastName: s.lastName,
          AttendedBefore: s.attendedBefore,
          AttendedWhenYear: s.attendedWhenYear || "",
          GradeLevel: s.gradeLevel,
          DateOfBirth: s.dateOfBirth,
          Gender: s.gender,
          SchoolAttending: s.schoolAttending,
          IsADOMSchool: !!s.isADOMSchool,
          PowerSchoolNumber: s.powerSchoolNumber || "",
          AttendeeCount: Number(body.attendeeCount),
          HeardAbout: body.heardAbout.join("; "),
          ParentSalutation: body.salutation,
          ParentFirstName: body.parentFirstName,
          ParentLastName: body.parentLastName,
          ParentAddress: body.address,
          ParentCity: body.city,
          ParentState: body.state,
          ParentZip: body.zip,
          ParentHomePhone: body.homePhone,
          ParentCellPhone: body.cellPhone,
          ParentOfficePhone: body.officePhone || "",
          ParentEmail: body.email,
          SubmittedAt: submittedAt,
          SubmissionId: submissionId,
        });
        created += 1;
      }

      try {
        await sendConfirmationEmail({
          submissionId,
          students: body.students,
          parentFirstName: body.parentFirstName,
          parentLastName: body.parentLastName,
          email: body.email,
        });
      } catch (e) {
        // A family's registration is already saved above — a failed email
        // shouldn't turn that into an error for them.
        context.error("Confirmation email failed: " + e.message);
      }

      return { status: 200, headers, jsonBody: { success: true, studentsCreated: created } };
    } catch (e) {
      context.error(e);
      return { status: 500, headers, jsonBody: { error: e.message || "Unexpected server error." } };
    }
  },
});
