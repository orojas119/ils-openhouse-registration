// One-off provisioning script: creates the "Open House Registrations" SharePoint
// list (schema only) on the ilsforms site via the delegated device-code flow.
// See ~/ILS-SWA-PLAYBOOK.md §6 — the app-only token used at runtime can create
// list *items* but not the list/columns themselves; that always needs this
// delegated flow. Run once, then discard (or keep for future column tweaks).
//
// Prereqs (must already be done, see chat):
//   - iHelp Graph app has delegated Sites.FullControl.All added + admin-consented
//   - You are an Owner of the ilsforms SharePoint site
//
// Usage: node scripts/provision-list.mjs
// You'll be prompted with a microsoft.com/devicelogin URL + code — complete
// that sign-in as yourself, then the script creates the list automatically.

import { PublicClientApplication } from "@azure/msal-node";

const CLIENT_ID = "b0128bc3-7e7d-4e1a-b8d8-24a045b85e72"; // iHelp Graph app (reused)
const TENANT_ID = "8109e949-d281-46a4-af75-b18087925bf4";
const SITE_ID = "ilsroyals.sharepoint.com,95f38ad3-ff96-41b9-a5dd-d0edc37faa03,94e53d43-5107-4380-8ae8-800fd0f1de0b";

const pca = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
  },
});

const tokenResponse = await pca.acquireTokenByDeviceCode({
  scopes: ["https://graph.microsoft.com/Sites.FullControl.All"],
  deviceCodeCallback: (resp) => console.log("\n" + resp.message + "\n"),
});

const graph = (path, init = {}) =>
  fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokenResponse.accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  }).then(async (r) => {
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${init.method || "GET"} ${path} -> ${r.status}: ${JSON.stringify(body)}`);
    return body;
  });

console.log("Creating list 'Open House Registrations' on", SITE_ID, "...");

const HEARD_ABOUT_CHOICES = [
  "Website",
  "Advertising",
  "Current Parent/Student",
  "Past Parent",
  "Alumni",
  "Reputation/Word of Mouth",
  "Social Media",
  "Other",
];

const list = await graph(`/sites/${SITE_ID}/lists`, {
  method: "POST",
  body: JSON.stringify({
    displayName: "Open House Registrations",
    list: { template: "genericList" },
    columns: [
      { name: "StudentFirstName", text: {} },
      { name: "StudentMiddleName", text: {} },
      { name: "StudentLastName", text: {} },
      { name: "AttendedBefore", choice: { choices: ["Yes", "No"], displayAs: "dropDownMenu" } },
      { name: "AttendedWhenYear", text: {} },
      {
        name: "GradeLevel",
        choice: {
          choices: ["5th Grade", "6th Grade", "7th Grade", "8th Grade", "9th Grade", "10th Grade", "11th Grade"],
          displayAs: "dropDownMenu",
        },
      },
      { name: "DateOfBirth", dateTime: { displayAs: "default", format: "dateOnly" } },
      { name: "Gender", choice: { choices: ["Male", "Female"], displayAs: "dropDownMenu" } },
      { name: "SchoolAttending", text: {} },
      { name: "IsADOMSchool", boolean: {} },
      { name: "PowerSchoolNumber", text: {} },
      { name: "AttendeeCount", number: { decimalPlaces: "none" } },
      { name: "HeardAbout", choice: { choices: HEARD_ABOUT_CHOICES, allowMultipleSelection: true } },
      { name: "ParentSalutation", text: {} },
      { name: "ParentFirstName", text: {} },
      { name: "ParentLastName", text: {} },
      { name: "ParentAddress", text: {} },
      { name: "ParentCity", text: {} },
      { name: "ParentState", text: {} },
      { name: "ParentZip", text: {} },
      { name: "ParentHomePhone", text: {} },
      { name: "ParentCellPhone", text: {} },
      { name: "ParentOfficePhone", text: {} },
      { name: "ParentEmail", text: {} },
      { name: "SubmittedAt", dateTime: { displayAs: "default", format: "dateOnly" } },
    ],
  }),
});

console.log("\nCreated list:");
console.log("  displayName:", list.displayName);
console.log("  SP_OPENHOUSE_LIST_ID =", list.id);
console.log("\nNo app-only permission grant needed — the iHelp Graph app already");
console.log("has app-only Sites.Selected Write on this site (reused from Driver MVR).");
