// Fixes the "Open House Registrations" list's HeardAbout column: Microsoft
// Graph's /items write API rejects array values for a multi-select Choice
// column outright (confirmed via direct testing 2026-09-01 — a plain string
// writes fine, the array form fails on both POST and PATCH with a generic
// "Invalid request" 400). Workaround: store selections as a semicolon-joined
// string in a plain text column instead.
//
// Usage: node scripts/fix-heardabout-column.mjs
// Requires the same delegated Sites.FullControl.All grant already set up for
// provision-list.mjs — you'll get a device-code prompt again.

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
    if (r.status === 204) return null;
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${init.method || "GET"} ${path} -> ${r.status}: ${JSON.stringify(body)}`);
    return body;
  });

const columns = await graph(`/sites/${SITE_ID}/lists/${LIST_ID}/columns`);
const heardAbout = columns.value.find((c) => c.name === "HeardAbout");
if (!heardAbout) throw new Error("HeardAbout column not found");

console.log("Deleting old multi-choice HeardAbout column...");
await graph(`/sites/${SITE_ID}/lists/${LIST_ID}/columns/${heardAbout.id}`, { method: "DELETE" });

console.log("Creating new text HeardAbout column...");
const newCol = await graph(`/sites/${SITE_ID}/lists/${LIST_ID}/columns`, {
  method: "POST",
  body: JSON.stringify({ name: "HeardAbout", text: { allowMultipleLines: false } }),
});

console.log("Done. New column:", newCol.name, newCol.id);
