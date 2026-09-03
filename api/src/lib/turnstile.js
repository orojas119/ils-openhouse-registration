const { TURNSTILE_SECRET_KEY } = require("./config");

// Verifies a Cloudflare Turnstile token server-side. Returns true if
// verification passes OR if Turnstile isn't configured yet (TURNSTILE_SECRET_KEY
// unset) — lets the form keep working before/during widget provisioning
// rather than hard-failing every submission.
async function verifyTurnstile(token, remoteIp) {
  if (!TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
    }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.success;
}

module.exports = { verifyTurnstile };
