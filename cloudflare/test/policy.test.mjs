import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ChatRoom } from "../chat-room.mjs";

globalThis.WebSocketRequestResponsePair ??= class {};
function room() {
  const db = new DatabaseSync(":memory:");
  const sockets = [];
  const sql = {
    exec(query, ...params) {
      if (!params.length && query.includes("CREATE TABLE")) {
        db.exec(query);
        return { toArray: () => [] };
      }
      const statement = db.prepare(query);
      const rows = statement.all(...params);
      return { toArray: () => rows };
    },
  };
  const ctx = {
    storage: {
      sql,
      getAlarm: async () => 1,
      transactionSync: (fn) => {
        db.exec("BEGIN");
        try {
          const value = fn();
          db.exec("COMMIT");
          return value;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    blockConcurrencyWhile: (fn) => fn(),
    setWebSocketAutoResponse() {},
    getWebSockets: (tag) =>
      sockets.filter((ws) => !tag || tag === `user:${ws.meta.userId}`),
  };
  const chat = new ChatRoom(ctx, {});
  const user = (id, username, email) =>
    sql
      .exec(
        "INSERT INTO users (id,username,email,password_hash,created_at,public_key) VALUES (?,?,?,'test',?,'test')",
        id,
        username,
        email,
        new Date().toISOString(),
      )
      .toArray();
  const socket = (id) => {
    const meta = {
      userId: id,
      sessionId: `session-${id}`,
      expiresAt: Date.now() + 60000,
      window: Date.now(),
      count: 0,
    };
    sql
      .exec(
        "INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)",
        meta.sessionId,
        id,
        meta.expiresAt,
      )
      .toArray();
    const ws = {
      meta,
      readyState: 1,
      packets: [],
      deserializeAttachment() {
        return this.meta;
      },
      serializeAttachment(v) {
        this.meta = v;
      },
      send(v) {
        this.packets.push(JSON.parse(v));
      },
    };
    sockets.push(ws);
    return ws;
  };
  let viewer;
  chat.session = async () =>
    chat.one("SELECT * FROM users WHERE id = ?", viewer);
  const request = (id, path, method = "GET", body) => {
    viewer = id;
    return chat.fetch(
      new Request(`https://test.example/api${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  };
  return { db, chat, user, socket, request };
}

test("only the existing matching owner account is pinned; missing owner fails closed", async () => {
  const { db, chat, user, request } = room();
  try {
    user(1, "visitor", "visitor@example.com");
    user(2, "roseler", "wrong@example.com");
    assert.equal(chat.ownerId(), null);
    assert.deepEqual(chat.contacts(1), []);
    assert.equal((await request(1, "/messages/conversation/2")).status, 403);
    user(3, "other", "admin@roseler.tech");
    assert.equal(chat.ownerId(), null);
    assert.deepEqual(chat.contacts(3), []);
  } finally {
    db.close();
  }
});

test("owner identity stays pinned and reserved signup cannot claim it", async () => {
  const { db, chat, user, request } = room();
  try {
    user(7, "roseler", "admin@roseler.tech");
    user(9, "visitor", "v@example.com");
    assert.equal(chat.ownerId(), 7);
    db.prepare(
      "UPDATE users SET username='changed',email='changed@example.com' WHERE id=7",
    ).run();
    chat.ownerAccountId = null;
    assert.equal(chat.ownerId(), 7);
    assert.deepEqual(
      chat.contacts(9).map((u) => u.id),
      [7],
    );
    for (const body of [
      { username: "RoSeLeR", email: "new@example.com" },
      { username: "new_account", email: "ADMIN@ROSELER.TECH" },
    ]) {
      const response = await request(9, "/auth/register", "POST", {
        ...body,
        password: "Example123!",
        is_owner: true,
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /reserved/);
    }
  } finally {
    db.close();
  }
});

test("old visitor messages, unread counts, reads, delivery and typing stay private", async () => {
  const { db, chat, user, socket, request } = room();
  try {
    user(7, "roseler", "admin@roseler.tech");
    user(8, "first", "first@example.com");
    user(9, "second", "second@example.com");
    chat.ownerId();
    db.prepare(
      "INSERT INTO messages (id,sender_id,receiver_id,encrypted_content,iv,timestamp) VALUES (1,8,9,'v2:AAAA','AAAAAAAAAAAAAAAA',?)",
    ).run(new Date().toISOString());
    assert.deepEqual(await (await request(9, "/messages/unread")).json(), {
      count: 0,
      bySender: [],
    });
    assert.equal((await request(9, "/messages/conversation/8")).status, 403);
    assert.equal((await request(9, "/messages/1/read", "PUT")).status, 404);
    const a = socket(8),
      b = socket(9),
      owner = socket(7);
    for (const [event, data] of [
      ["message_delivered", { id: 1 }],
      ["typing", { receiverId: 8 }],
      ["stop_typing", { receiverId: 8 }],
    ])
      await chat.webSocketMessage(b, JSON.stringify({ event, data }));
    assert.deepEqual(a.packets, []);
    assert.equal(
      db.prepare("SELECT delivered FROM messages WHERE id=1").get().delivered,
      0,
    );
    chat.directoryChanged(9);
    assert.deepEqual(a.packets, []);
    assert.equal(owner.packets.at(-1).event, "users_changed");
    chat.presence();
    assert.deepEqual(
      a.packets.at(-1).data.map((u) => u.userId),
      [7],
    );
    assert.deepEqual(
      b.packets.at(-1).data.map((u) => u.userId),
      [7],
    );
    assert.deepEqual(
      owner.packets.at(-1).data.map((u) => u.userId),
      [8, 9],
    );
    await chat.webSocketMessage(
      b,
      JSON.stringify({
        id: "blocked",
        event: "send_message",
        data: {
          receiverId: 8,
          encryptedContent: "v2:AAAA",
          iv: "AAAAAAAAAAAAAAAA",
        },
      }),
    );
    assert.match(b.packets.at(-1).data.error, /only chat with roseler/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM messages").get().n, 1);
  } finally {
    db.close();
  }
});

test("account messaging requires password and legacy consent; keys cannot be replaced after setup", async () => {
  const { db, chat, user, request } = room();
  try {
    user(7, "roseler", "admin@roseler.tech");
    user(8, "visitor", "v@example.com");
    db.prepare("UPDATE users SET password_hash = ? WHERE id=8").run(
      "$2b$12$xDWO/ZN8ovx6zIf2lq4clOhMpZ1mM8XQ.dS4/FnfQZf6IU.SccnS.",
    );
    const { createAccountKey } =
      await import("../../frontend/src/utils/account-key.mjs");
    const created = await createAccountKey("Example123!", 8);
    const body = {
      password: "Example123!",
      publicKey: created.publicKey,
      backup: created.backup,
    };
    assert.equal(
      (
        await request(8, "/auth/messaging-key", "PUT", {
          ...body,
          password: "Wrong123!",
          replaceLegacy: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (await request(8, "/auth/messaging-key", "PUT", body)).status,
      409,
    );
    assert.equal(
      (
        await request(8, "/auth/messaging-key", "PUT", {
          ...body,
          replaceLegacy: true,
        })
      ).status,
      200,
    );
    const saved = await (await request(8, "/auth/messaging-key")).json();
    assert.deepEqual(saved.backup, created.backup);
    assert.equal(saved.version, 1);
    assert.equal(chat.contacts(7).find((u) => u.id === 8).key_version, 1);
    assert.equal(
      (
        await request(8, "/auth/messaging-key", "PUT", {
          ...body,
          replaceLegacy: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(8, "/auth/password", "PUT", {
          currentPassword: "Example123!",
          newPassword: "Updated123!",
        })
      ).status,
      409,
    );
    assert.equal(
      db.prepare("SELECT backup FROM account_keys WHERE user_id=7").get(),
      undefined,
    );
  } finally {
    db.close();
  }
});

test("a concurrent key migration cannot strand the backup during a password change", async () => {
  const { db, chat, user, request } = room();
  try {
    user(8, "visitor", "v@example.com");
    const passwordHash =
      "$2b$12$xDWO/ZN8ovx6zIf2lq4clOhMpZ1mM8XQ.dS4/FnfQZf6IU.SccnS.";
    db.prepare("UPDATE users SET password_hash = ? WHERE id=8").run(
      passwordHash,
    );
    const material = chat.sessionMaterial.bind(chat);
    chat.sessionMaterial = async () => {
      db.prepare(
        "INSERT INTO account_keys (user_id,backup,version) VALUES (8,'concurrent-backup',1)",
      ).run();
      return material();
    };
    const response = await request(8, "/auth/password", "PUT", {
      currentPassword: "Example123!",
      newPassword: "Changed123!",
    });
    assert.equal(response.status, 409);
    assert.equal(
      db.prepare("SELECT password_hash FROM users WHERE id=8").get()
        .password_hash,
      passwordHash,
    );
    assert.equal(
      db.prepare("SELECT backup FROM account_keys WHERE user_id=8").get()
        .backup,
      "concurrent-backup",
    );
  } finally {
    db.close();
  }
});
