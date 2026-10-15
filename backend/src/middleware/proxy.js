const { timingSafeEqual } = require("node:crypto");
const { isIP } = require("node:net");

function isTrustedProxy(headers) {
  if (!process.env.PROXY_SECRET) return true;
  const received = Buffer.from(headers["x-chat-proxy-secret"] || "");
  const expected = Buffer.from(process.env.PROXY_SECRET);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function requireProxy(req, res, next) {
  // Render's health checks do not pass through Cloudflare.
  if (req.method === "GET" && req.path === "/api/health") return next();
  if (!isTrustedProxy(req.headers))
    return res.status(403).json({ error: "Use the app's public URL." });
  if (process.env.PROXY_SECRET && isIP(req.headers["x-chat-client-ip"] || "")) {
    req.clientIp = req.headers["x-chat-client-ip"];
  }
  next();
}

module.exports = { isTrustedProxy, requireProxy };
