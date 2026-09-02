const { jwtVerify, createRemoteJWKSet } = require("jose");
const { WEBAUTH_TENANT_ID, WEBAUTH_CLIENT_ID, ADMIN_EMAILS } = require("./config");

const issuer = `https://login.microsoftonline.com/${WEBAUTH_TENANT_ID}/v2.0`;
const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${WEBAUTH_TENANT_ID}/discovery/v2.0/keys`));

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// MSAL sends the token in a custom header, not Authorization — Azure Static
// Web Apps' proxy strips/overwrites Authorization, and this codebase follows
// the same convention everywhere else for consistency even though this app
// isn't hosted on SWA. See ils-swa-playbook §3.3.
async function requireAdmin(request) {
  const token = request.headers.get("x-app-access-token");
  if (!token) throw new AuthError(401, "Missing access token");

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: [WEBAUTH_CLIENT_ID, `api://${WEBAUTH_CLIENT_ID}`],
    }));
  } catch {
    throw new AuthError(401, "Invalid or expired access token");
  }

  if (!payload.scp?.split(" ").includes("access_as_user")) {
    throw new AuthError(401, "Token missing required scope");
  }

  const email = (payload.preferred_username || payload.upn || "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    throw new AuthError(403, "Not authorized for the admin dashboard");
  }
  return { email };
}

module.exports = { AuthError, requireAdmin };
