const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isTrustedProxy, requireProxy } = require("../src/middleware/proxy");
test("proxy authentication rejects direct traffic, ignores spoofed IPs, and permits Render health checks", () => {
  const previous = process.env.PROXY_SECRET;
  process.env.PROXY_SECRET = "test-proxy-secret";
  try {
    assert.equal(isTrustedProxy({}), false);
    assert.equal(isTrustedProxy({ "x-chat-proxy-secret": "incorrect" }), false);
    assert.equal(
      isTrustedProxy({ "x-chat-proxy-secret": "test-proxy-secret" }),
      true,
    );
    const denied = {
      status(code) {
        assert.equal(code, 403);
        return this;
      },
      json(body) {
        assert.match(body.error, /public URL/);
      },
    };
    requireProxy(
      {
        method: "POST",
        path: "/api/auth/login",
        headers: { "x-chat-client-ip": "198.51.100.6" },
      },
      denied,
      () => assert.fail("direct request accepted"),
    );
    const req = {
      method: "POST",
      path: "/api/auth/login",
      headers: {
        "x-chat-proxy-secret": "test-proxy-secret",
        "x-chat-client-ip": "198.51.100.6",
      },
    };
    let called = false;
    requireProxy(req, {}, () => (called = true));
    assert.equal(called, true);
    assert.equal(req.clientIp, "198.51.100.6");
    called = false;
    requireProxy(
      { method: "GET", path: "/api/health", headers: {} },
      {},
      () => (called = true),
    );
    assert.equal(called, true);
    const invalid = {
      method: "GET",
      path: "/api/auth/users",
      headers: {
        "x-chat-proxy-secret": "test-proxy-secret",
        "x-chat-client-ip": "not-an-ip",
      },
    };
    requireProxy(invalid, {}, () => {});
    assert.equal(invalid.clientIp, undefined);
  } finally {
    if (previous === undefined) delete process.env.PROXY_SECRET;
    else process.env.PROXY_SECRET = previous;
  }
});
