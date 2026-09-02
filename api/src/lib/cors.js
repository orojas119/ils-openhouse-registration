const { ALLOWED_ORIGINS } = require("./config");

function corsHeaders(request, extraAllowedHeaders = "Content-Type") {
  const origin = request.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": extraAllowedHeaders,
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

module.exports = { corsHeaders };
