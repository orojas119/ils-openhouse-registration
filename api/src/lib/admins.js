const { SUPER_ADMIN_EMAIL } = require("./config");
const { listAdminItems, createAdminItem, deleteAdminItem } = require("./graph");

const CACHE_MS = 30_000;
let cache = null;
let cacheAt = 0;

// Cached so a normal admin-dashboard session (loading the roster, toggling
// check-ins) doesn't hit Graph on every single request just to re-verify
// the caller is still an admin. 30s means a just-removed admin loses access
// within half a minute at most — fine for this tool's stakes.
async function getAdminItems() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  cache = await listAdminItems();
  cacheAt = Date.now();
  return cache;
}

function invalidateCache() {
  cache = null;
}

async function isAdmin(email) {
  const lower = email.toLowerCase();
  if (lower === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
  const items = await getAdminItems();
  return items.some((i) => (i.Email || i.Title || "").toLowerCase() === lower);
}

async function listAdmins() {
  const items = await getAdminItems();
  const fromList = items.map((i) => ({ id: i.id, email: i.Email || i.Title, isSuperAdmin: false }));
  // Show the super admin in the UI even though they're not a removable row.
  if (!fromList.some((a) => a.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase())) {
    fromList.unshift({ id: null, email: SUPER_ADMIN_EMAIL, isSuperAdmin: true });
  } else {
    fromList.forEach((a) => {
      if (a.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) a.isSuperAdmin = true;
    });
  }
  return fromList;
}

async function addAdmin(email) {
  const created = await createAdminItem(email);
  invalidateCache();
  return created;
}

async function removeAdmin(id) {
  await deleteAdminItem(id);
  invalidateCache();
}

module.exports = { isAdmin, listAdmins, addAdmin, removeAdmin };
