const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { createRegistrationItem } = require("../lib/graph");

const REQUIRED_STUDENT_FIELDS = [
  "studentFirstName",
  "studentLastName",
  "attendedBefore",
  "gradeLevel",
  "dateOfBirth",
  "gender",
  "schoolAttending",
  "attendeeCount",
];

const REQUIRED_PARENT_FIELDS = [
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

    try {
      const body = await request.json();

      // Honeypot: a hidden field real visitors never fill in. Bots that fill
      // every input trip this; report success without writing anything.
      if (body.website) {
        return { status: 200, headers, jsonBody: { success: true } };
      }

      for (const f of [...REQUIRED_STUDENT_FIELDS, ...REQUIRED_PARENT_FIELDS]) {
        if (!body[f] || !String(body[f]).trim()) {
          return { status: 400, headers, jsonBody: { error: `Missing required field: ${f}` } };
        }
      }
      if (!Array.isArray(body.heardAbout) || body.heardAbout.length === 0) {
        return { status: 400, headers, jsonBody: { error: "Select at least one way you heard about the school." } };
      }
      if (body.attendedBefore === "Yes" && !String(body.attendedWhenYear || "").trim()) {
        return { status: 400, headers, jsonBody: { error: "Missing required field: attendedWhenYear" } };
      }
      if (body.isADOMSchool && !String(body.powerSchoolNumber || "").trim()) {
        return { status: 400, headers, jsonBody: { error: "Missing required field: powerSchoolNumber" } };
      }

      const submittedAt = new Date().toISOString().slice(0, 10);
      const studentFullName = [body.studentFirstName, body.studentMiddleName, body.studentLastName]
        .filter(Boolean)
        .join(" ");

      await createRegistrationItem({
        Title: studentFullName,
        StudentFirstName: body.studentFirstName,
        StudentMiddleName: body.studentMiddleName || "",
        StudentLastName: body.studentLastName,
        AttendedBefore: body.attendedBefore,
        AttendedWhenYear: body.attendedWhenYear || "",
        GradeLevel: body.gradeLevel,
        DateOfBirth: body.dateOfBirth,
        Gender: body.gender,
        SchoolAttending: body.schoolAttending,
        IsADOMSchool: !!body.isADOMSchool,
        PowerSchoolNumber: body.powerSchoolNumber || "",
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
        ParentOfficePhone: body.officePhone,
        ParentEmail: body.email,
        SubmittedAt: submittedAt,
      });

      return { status: 200, headers, jsonBody: { success: true } };
    } catch (e) {
      context.error(e);
      return { status: 500, headers, jsonBody: { error: e.message || "Unexpected server error." } };
    }
  },
});
