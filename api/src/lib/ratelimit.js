// Simple in-memory sliding-window rate limiter for public, unauthenticated
// endpoints (registration submit, check-in search/complete). This is a
// best-effort deterrent, not a hard guarantee: Consumption-plan instances are
// ephemeral and can scale out, so a determined attacker spread across enough
// cold starts could exceed this. Layered with Turnstile (submit.js) and a
// honeypot for defense in depth — see [[openhouse-registration-form]] memory.
const buckets = new Map();
const WINDOW_MS = 60_000;

function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : null) || "unknown";
}

// Returns true if the request should be allowed, false if rate-limited.
function allow(request, { max = 20 } = {}) {
  const ip = clientIp(request);
  const now = Date.now();
  const hits = (buckets.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= max) {
    buckets.set(ip, hits);
    return false;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return true;
}

module.exports = { allow, clientIp };
