const { app } = require("@azure/functions");
const { corsHeaders } = require("../lib/cors");
const { AuthError, requireAdmin } = require("../lib/auth");
const { listRegistrationItems, createRegistrationItem } = require("../lib/graph");

const REQUIRED_WALKIN_FIELDS = ["studentFirstName", "studentLastName", "gradeLevel", "attendeeCount"];

async function handleList(headers) {
  const items = await listRegistrationItems();
  return { status: 200, headers, jsonBody: { registrations: items } };
}

async function handleWalkIn(request, headers) {
  const body = await request.json();

  for (const f of REQUIRED_WALKIN_FIELDS) {
    if (!body[f] || !String(body[f]).trim()) {
      return { status: 400, headers, jsonBody: { error: `Missing required field: ${f}` } };
    }
  }

  const now = new Date().toISOString();
  const studentFullName = [body.studentFirstName, body.studentMiddleName, body.studentLastName]
    .filter(Boolean)
    .join(" ");

  const created = await createRegistrationItem({
    Title: studentFullName,
    StudentFirstName: body.studentFirstName,
    StudentMiddleName: body.studentMiddleName || "",
    StudentLastName: body.studentLastName,
    AttendedBefore: body.attendedBefore || "No",
    AttendedWhenYear: body.attendedWhenYear || "",
    GradeLevel: body.gradeLevel,
    DateOfBirth: body.dateOfBirth || null,
    Gender: body.gender || "",
    SchoolAttending: body.schoolAttending || "",
    IsADOMSchool: !!body.isADOMSchool,
    PowerSchoolNumber: body.powerSchoolNumber || "",
    AttendeeCount: Number(body.attendeeCount),
    HeardAbout: body.heardAbout || "",
    ParentSalutation: body.salutation || "",
    ParentFirstName: body.parentFirstName || "",
    ParentLastName: body.parentLastName || "",
    ParentAddress: body.address || "",
    ParentCity: body.city || "",
    ParentState: body.state || "",
    ParentZip: body.zip || "",
    ParentHomePhone: body.homePhone || "",
    ParentCellPhone: body.cellPhone || "",
    ParentOfficePhone: body.officePhone || "",
    ParentEmail: body.email || "",
    SubmittedAt: now.slice(0, 10),
    IsWalkIn: true,
    CheckedIn: true,
    CheckedInAt: now,
  });

  return { status: 200, headers, jsonBody: { success: true, id: created.id } };
}

app.http("adminRegistrations", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "staff/registrations",
  handler: async (request, context) => {
    const headers = corsHeaders(request, "Content-Type, x-app-access-token");
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    try {
      await requireAdmin(request);
      if (request.method === "GET") return await handleList(headers);
      return await handleWalkIn(request, headers);
    } catch (e) {
      if (e instanceof AuthError) return { status: e.status, headers, jsonBody: { error: e.message } };
      context.error(e);
      return { status: 500, headers, jsonBody: { error: e.message || "Unexpected server error." } };
    }
  },
});
