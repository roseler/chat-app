import { test } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import {
  encryptMessage,
  decryptMessage,
} from "../../frontend/src/utils/cipher.mjs";
const base = process.env.CF_TEST_URL || "http://localhost:8787";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Integration tests must use an isolated local deployment.");
const suffix = crypto.randomUUID().slice(0, 8);
const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
async function request(path, { method = "GET", body, cookie, origin } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      "CF-Connecting-IP": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function account(name) {
  const response = await request("/auth/register", {
    method: "POST",
    body: {
      username: `${name}_${suffix}`,
      email: `${name}_${suffix}@example.com`,
      password: "Example123!",
    },
  });
  assert.equal(response.status, 201, await response.clone().text());
  assert.match(response.headers.get("set-cookie"), /HttpOnly.*SameSite=Strict/);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const user = (await response.json()).user;
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  assert.equal(
    (
      await request("/auth/public-key", {
        method: "PUT",
        cookie,
        body: { publicKey },
      })
    ).status,
    200,
  );
  return { user, cookie, pair, publicKey };
}
async function socket(cookie) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws", {
    headers: { Cookie: cookie, Origin: base },
  });
  const inbox = [];
  ws.on("message", (data) => {
    const text = data.toString();
    if (text === "pong") inbox.push({ event: "pong" });
    else inbox.push(JSON.parse(text));
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, inbox };
}
async function wait(inbox, predicate) {
  for (let i = 0; i < 100; i++) {
    const index = inbox.findIndex(predicate);
    if (index >= 0) return inbox.splice(index, 1)[0];
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Expected WebSocket event did not arrive.");
}
async function emit(connection, event, data) {
  const id = crypto.randomUUID();
  connection.ws.send(JSON.stringify({ id, event, data }));
  return (await wait(connection.inbox, (packet) => packet.ack === id)).data;
}

test("Cloudflare accounts, secure sessions, real WebSockets, ownership, key pinning, delivery, and revocation", async () => {
  assert.equal((await request("/health")).status, 200);
  assert.equal((await request("/auth/me")).status, 401);
  assert.equal(
    (
      await request("/auth/logout", {
        method: "POST",
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const alice = await account("alice"),
    bob = await account("bob");
  let a, b;
  try {
    assert.equal(
      (
        await request("/auth/public-key", {
          method: "PUT",
          cookie: alice.cookie,
          body: { publicKey: bob.publicKey },
        })
      ).status,
      409,
    );
    const directory = await (
      await request("/auth/users", { cookie: alice.cookie })
    ).json();
    assert.equal(
      directory.find((user) => user.id === bob.user.id).email,
      undefined,
    );
    a = await socket(alice.cookie);
    b = await socket(bob.cookie);
    await wait(
      a.inbox,
      (packet) =>
        packet.event === "online_users" &&
        packet.data.some((user) => user.userId === bob.user.id),
    );
    a.ws.send("ping");
    await wait(a.inbox, (packet) => packet.event === "pong");
    a.ws.send(
      JSON.stringify({ event: "typing", data: { receiverId: bob.user.id } }),
    );
    assert.equal(
      (await wait(b.inbox, (packet) => packet.event === "user_typing")).data
        .userId,
      alice.user.id,
    );
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const encrypted = await encryptMessage("Encrypted hello 👋", key);
    const sent = await emit(a, "send_message", {
      receiverId: bob.user.id,
      ...encrypted,
    });
    assert.equal(sent.success, true);
    assert.equal(sent.message.delivered, true);
    const received = (
      await wait(b.inbox, (packet) => packet.event === "receive_message")
    ).data;
    assert.equal(
      await decryptMessage(received.encryptedContent, received.iv, key),
      "Encrypted hello 👋",
    );
    const unread = await (
      await request("/messages/unread", { cookie: bob.cookie })
    ).json();
    assert.equal(unread.count, 1);
    assert.equal(
      (
        await request(`/messages/${received.id}/read`, {
          method: "PUT",
          cookie: alice.cookie,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/messages/${received.id}/read`, {
          method: "PUT",
          cookie: bob.cookie,
        })
      ).status,
      200,
    );
    await wait(
      a.inbox,
      (packet) =>
        packet.event === "message_read" && packet.data.id === received.id,
    );
    const history = await (
      await request(`/messages/conversation/${alice.user.id}`, {
        cookie: bob.cookie,
      })
    ).json();
    assert.equal(history.at(-1).id, received.id);
    assert.equal(history.at(-1).read_status, 1);
    assert.match(
      (
        await emit(a, "send_message", {
          receiverId: bob.user.id,
          encryptedContent: "bad",
          iv: "bad",
        })
      ).error,
      /Invalid/,
    );
    a.ws.send(JSON.stringify({ event: "typing", data: null }));
    a.ws.send("ping");
    await wait(a.inbox, (packet) => packet.event === "pong");
    const closed = new Promise((resolve) => b.ws.once("close", resolve));
    const password = await request("/auth/password", {
      method: "PUT",
      cookie: bob.cookie,
      body: { currentPassword: "Example123!", newPassword: "Updated123!" },
    });
    assert.equal(password.status, 200);
    await closed;
    assert.equal(
      (await request("/auth/me", { cookie: bob.cookie })).status,
      401,
    );
    const updatedCookie = password.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await request("/auth/me", { cookie: updatedCookie })).status,
      200,
    );
    const offline = await emit(a, "send_message", {
      receiverId: bob.user.id,
      ...(await encryptMessage("Saved while offline", key)),
    });
    assert.equal(offline.message.delivered, false);
    assert.equal(
      (
        await (
          await request("/messages/unread", { cookie: updatedCookie })
        ).json()
      ).count,
      1,
    );
    const aliceClosed = new Promise((resolve) => a.ws.once("close", resolve));
    assert.equal(
      (await request("/auth/logout", { method: "POST", cookie: alice.cookie }))
        .status,
      200,
    );
    await aliceClosed;
    assert.equal(
      (await request("/auth/me", { cookie: alice.cookie })).status,
      401,
    );
    const wrong = await request("/auth/login", {
      method: "POST",
      body: { username: bob.user.username, password: "Example123!" },
    });
    assert.equal(wrong.status, 401);
    assert.equal(
      (
        await request("/auth/login", {
          method: "POST",
          body: { username: bob.user.username, password: "Updated123!" },
        })
      ).status,
      200,
    );
  } finally {
    a?.ws.close();
    b?.ws.close();
  }
});
