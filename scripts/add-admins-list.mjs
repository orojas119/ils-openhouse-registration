// Creates the "Open House Admins" SharePoint list — the dynamic admin
// allowlist the settings UI reads/writes at runtime (replaces the old
// static ADMIN_EMAILS Function App setting). Seeds it with the two current
// admins. Same device-code flow as the other provisioning scripts.
//
// Usage: node scripts/add-admins-list.mjs

import { PublicClientApplication } from "@azure/msal-node";

const CLIENT_ID = "b0128bc3-7e7d-4e1a-b8d8-24a045b85e72";
const TENANT_ID = "8109e949-d281-46a4-af75-b18087925bf4";
const SITE_ID = "ilsroyals.sharepoint.com,95f38ad3-ff96-41b9-a5dd-d0edc37faa03,94e53d43-5107-4380-8ae8-800fd0f1de0b";

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

console.log("Creating list 'Open House Admins'...");
const list = await graph(`/sites/${SITE_ID}/lists`, {
  method: "POST",
  body: JSON.stringify({
    displayName: "Open House Admins",
    list: { template: "genericList" },
    columns: [{ name: "Email", text: {} }],
  }),
});
console.log("  -> list id:", list.id);

const seed = ["orojas@ilsroyals.com", "morelle@ilsroyals.com"];
for (const email of seed) {
  const item = await graph(`/sites/${SITE_ID}/lists/${list.id}/items`, {
    method: "POST",
    body: JSON.stringify({ fields: { Title: email, Email: email } }),
  });
  console.log(`  -> seeded ${email} (item ${item.id})`);
}

console.log("\nDone. SP_ADMINS_LIST_ID =", list.id);
