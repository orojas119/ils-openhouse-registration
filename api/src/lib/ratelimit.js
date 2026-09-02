// Simple in-memory sliding-window rate limiter for the public check-in
// endpoints (search/complete have no auth gate — anyone with the QR code URL
// can call them). This is a best-effort deterrent, not a hard guarantee:
// Consumption-plan instances are ephemeral and can scale out, so a
// determined attacker spread across enough cold starts could exceed this.
// Good enough for a single-event front-desk flow; revisit if this ever
// needs to survive real abuse (e.g. move counters into the SharePoint list
// itself, or add Cloudflare Turnstile per the standard public-form playbook
// guidance).
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

module.exports = { allow };
