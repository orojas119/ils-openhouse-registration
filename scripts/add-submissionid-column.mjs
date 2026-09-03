// Adds a SubmissionId column to the "Open House Registrations" list — ties
// sibling rows from one multi-student submission together, so the admin
// dashboard can dedupe the shared AttendeeCount instead of summing it once
// per sibling (see chat 2026-09-03). Same device-code flow as
// provision-list.mjs / add-checkin-columns.mjs.
//
// Usage: node scripts/add-submissionid-column.mjs

import { PublicClientApplication } from "@azure/msal-node";

const CLIENT_ID = "b0128bc3-7e7d-4e1a-b8d8-24a045b85e72";
const TENANT_ID = "8109e949-d281-46a4-af75-b18087925bf4";
const SITE_ID = "ilsroyals.sharepoint.com,95f38ad3-ff96-41b9-a5dd-d0edc37faa03,94e53d43-5107-4380-8ae8-800fd0f1de0b";
const LIST_ID = "a56759e2-08e0-44f2-a7ce-5bda2c94f119";

const pca = new PublicClientApplication({
  auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}` },
});

const tokenResponse = await pca.acquireTokenByDeviceCode({
  scopes: ["https://graph.microsoft.com/Sites.FullControl.All"],
  deviceCodeCallback: (resp) => console.log("\n" + resp.message + "\n"),
});

const graph = (path, init = {}) =>
  fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${tokenResponse.accessToken}`, "Content-Type": "application/json", ...init.headers },
  }).then(async (r) => {
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${init.method || "GET"} ${path} -> ${r.status}: ${JSON.stringify(body)}`);
    return body;
  });

console.log("Creating column SubmissionId...");
const created = await graph(`/sites/${SITE_ID}/lists/${LIST_ID}/columns`, {
  method: "POST",
  body: JSON.stringify({ name: "SubmissionId", text: { allowMultipleLines: false, maxLength: 50 } }),
});
console.log(`  -> ${created.name} (${created.id})`);

console.log("\nDone.");
