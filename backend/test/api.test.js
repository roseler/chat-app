const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
let server, directory, cookie, userId;
const base = "http://127.0.0.1:3199/api";
async function request(
  route,
  { method = "GET", body, session = cookie, origin } = {},
) {
  return fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Cookie: session } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "quiet-api-"));
  server = spawn(process.execPath, ["src/server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: "3199",
      DB_PATH: path.join(directory, "test.sqlite"),
      FRONTEND_URL: "http://localhost:3000",
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
  let output = "";
  server.stderr.on("data", (data) => (output += data));
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await request("/health")).ok) return;
    } catch {}
    if (server.exitCode !== null) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start: " + output);
});
after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGINT");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("authentication, input validation, key pinning, session revocation, and password change", async () => {
  assert.equal((await request("/auth/me", { session: "" })).status, 401);
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: { username: {}, password: [], email: 9 },
        session: "",
      })
    ).status,
    400,
  );
  const registration = await request("/auth/register", {
    method: "POST",
    body: {
      username: "test_alice",
      email: "alice@example.com",
      password: "Example123!",
    },
    session: "",
  });
  assert.equal(registration.status, 201);
  const setCookie = registration.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  cookie = setCookie.split(";")[0];
  const registered = await registration.json();
  userId = registered.user.id;
  assert.equal(registered.token, undefined);
  assert.equal((await (await request("/auth/me")).json()).id, userId);
  assert.equal(
    (
      await request("/auth/public-key", {
        method: "PUT",
        body: { publicKey: { kty: "EC", crv: "P-256", x: "bad", y: "bad" } },
      })
    ).status,
    400,
  );
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKey = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  assert.equal(
    (await request("/auth/public-key", { method: "PUT", body: { publicKey } }))
      .status,
    200,
  );
  assert.equal(
    (await request("/auth/public-key", { method: "PUT", body: { publicKey } }))
      .status,
    200,
  );
  const second = await webcrypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  assert.equal(
    (
      await request("/auth/public-key", {
        method: "PUT",
        body: {
          publicKey: await webcrypto.subtle.exportKey("jwk", second.publicKey),
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/auth/logout", {
        method: "POST",
        origin: "https://example.net",
      })
    ).status,
    403,
  );
  assert.equal((await request("/messages/conversation/nope")).status, 400);
  assert.equal(
    (await request("/messages/999/read", { method: "PUT" })).status,
    404,
  );
  assert.equal((await request("/messages/conversation/1")).status, 403);
  const unread = await (await request("/messages/unread")).json();
  assert.deepEqual(unread, { count: 0, bySender: [] });
  assert.equal(
    (
      await request("/auth/password", {
        method: "PUT",
        body: { currentPassword: "bad", newPassword: "Changed123!" },
      })
    ).status,
    400,
  );
  const { createAccountKey, openAccountKey, sealAccountKey } =
    await import("../../frontend/src/utils/account-key.mjs");
  const created = await createAccountKey("Example123!", userId);
  const setup = {
    password: "Example123!",
    publicKey: created.publicKey,
    backup: created.backup,
  };
  assert.equal(
    (await request("/auth/messaging-key", { method: "PUT", body: setup }))
      .status,
    409,
  );
  assert.equal(
    (
      await request("/auth/messaging-key", {
        method: "PUT",
        body: { ...setup, replaceLegacy: true },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await request("/auth/messaging-key")).json()).backup,
    created.backup,
  );
  assert.equal(
    (
      await request("/auth/password", {
        method: "PUT",
        body: { currentPassword: "Example123!", newPassword: "Changed123!" },
      })
    ).status,
    409,
  );
  const raw = await openAccountKey(created.backup, "Example123!", userId);
  const keyBackup = await sealAccountKey(raw, "Changed123!", userId);
  const previous = cookie;
  const changed = await request("/auth/password", {
    method: "PUT",
    body: {
      currentPassword: "Example123!",
      newPassword: "Changed123!",
      keyBackup,
      keyVersion: 1,
    },
  });
  assert.equal(changed.status, 200);
  cookie = changed.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/auth/me", { session: previous })).status, 401);
  assert.equal((await request("/auth/me")).status, 200);
  const saved = (await (await request("/auth/messaging-key")).json()).backup;
  assert.deepEqual(await openAccountKey(saved, "Changed123!", userId), raw);
  await assert.rejects(openAccountKey(saved, "Example123!", userId));
  new Uint8Array(raw).fill(0);
  assert.equal((await request("/auth/logout", { method: "POST" })).status, 200);
  assert.equal((await request("/auth/me")).status, 401);
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { username: "test_alice", password: "Example123!" },
        session: "",
      })
    ).status,
    401,
  );
  const login = await request("/auth/login", {
    method: "POST",
    body: { username: "test_alice", password: "Changed123!" },
    session: "",
  });
  assert.equal(login.status, 200);
});
