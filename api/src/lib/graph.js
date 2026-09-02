const { TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SP_SITE_ID, SP_OPENHOUSE_LIST_ID } = require("./config");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

let cachedToken = null;
let cachedExpiry = 0;

async function getAppToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Failed to get Graph app token: ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function graphFetch(path, init = {}, attempt = 0) {
  const token = await getAppToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  // SharePoint throttles under concurrent load — back off and retry rather than
  // surfacing a failed request to the family submitting the form.
  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after")) || 1 + attempt;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return graphFetch(path, init, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph ${init.method || "GET"} ${path} failed: ${res.status} ${body}`);
  }
  return res;
}

const listBase = () => `/sites/${SP_SITE_ID}/lists/${SP_OPENHOUSE_LIST_ID}`;

async function createRegistrationItem(fields) {
  const res = await graphFetch(`${listBase()}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

// Fetches every item's fields, following @odata.nextLink pagination — the
// list is a few hundred rows at most (one school's Open House), so pulling
// it all in and filtering/sorting in the Function is simpler and fast enough
// compared to building out Graph $filter queries against non-indexed columns.
async function listRegistrationItems() {
  const items = [];
  let path = `${listBase()}/items?expand=fields&$top=200`;
  while (path) {
    const res = await graphFetch(path);
    const page = await res.json();
    for (const item of page.value) items.push({ id: item.id, ...item.fields });
    const nextLink = page["@odata.nextLink"];
    path = nextLink ? nextLink.replace(GRAPH_BASE, "") : null;
  }
  return items;
}

async function getRegistrationItem(id) {
  const res = await graphFetch(`${listBase()}/items/${id}?expand=fields`);
  const item = await res.json();
  return { id: item.id, ...item.fields };
}

async function updateRegistrationItem(id, fields) {
  const res = await graphFetch(`${listBase()}/items/${id}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return res.json();
}

module.exports = { createRegistrationItem, listRegistrationItems, getRegistrationItem, updateRegistrationItem };
