import bcrypt from "bcryptjs";
import validator from "validator";

const DAY = 86400000;
const SESSION_AGE = 7 * DAY;
const encoder = new TextEncoder();
const MAX_BODY = 40000;
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  public_key: user.public_key,
  created_at: user.created_at,
});
const json = (body, status = 200, extra = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extra,
    },
  });
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const tokenHash = async (token) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(token)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const newToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const cookie = (request, token, age = SESSION_AGE / 1000) =>
  `chat_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
const validPassword = (value) =>
  typeof value === "string" &&
  encoder.encode(value).length <= 72 &&
  value.length >= 8 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value);

async function readBody(request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw fail("Expected a JSON request.");
  if (Number(request.headers.get("content-length")) > MAX_BODY)
    throw fail("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw fail("A request body is required.");
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw fail("Request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw fail("Invalid JSON request.");
  }
}

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, public_key TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL REFERENCES users(id),
        receiver_id INTEGER NOT NULL REFERENCES users(id), encrypted_content TEXT NOT NULL,
        iv TEXT NOT NULL, timestamp TEXT NOT NULL, read_status INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS messages_pair ON messages(sender_id, receiver_id, timestamp);
      CREATE INDEX IF NOT EXISTS messages_unread ON messages(receiver_id, read_status, timestamp);
      CREATE INDEX IF NOT EXISTS messages_time ON messages(timestamp);
    `);
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
    this.ready = ctx.blockConcurrencyWhile(async () => {
      if (!(await ctx.storage.getAlarm()))
        await ctx.storage.setAlarm(Date.now() + 3600000);
    });
  }
  rows(query, ...params) {
    return this.sql.exec(query, ...params).toArray();
  }
  one(query, ...params) {
    return this.rows(query, ...params)[0];
  }
  limit(key, max, windowMs) {
    const now = Date.now();
    const current = this.one(
      "SELECT count, expires_at FROM rate_limits WHERE key = ?",
      key,
    );
    if (current && current.expires_at > now && current.count >= max)
      throw fail("Too many attempts. Please try again later.", 429);
    this.sql.exec(
      `INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END`,
      key,
      now + windowMs,
      now,
      now,
    );
  }
  async session(request) {
    const token = (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("chat_session="))
      ?.slice("chat_session=".length);
    if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
    return this.sessionByHash(await tokenHash(token));
  }
  sessionByHash(hash) {
    return this.one(
      `SELECT u.*, s.token AS sessionId, s.expires_at AS expiresAt FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`,
      hash,
      Date.now(),
    );
  }
  async sessionMaterial() {
    const token = newToken();
    return {
      token,
      hash: await tokenHash(token),
      expiresAt: Date.now() + SESSION_AGE,
    };
  }
  insertSession(userId, session) {
    this.sql.exec(
      "INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)",
      session.hash,
      userId,
      session.expiresAt,
    );
  }
  sockets(userId) {
    return this.ctx
      .getWebSockets(userId ? `user:${userId}` : undefined)
      .filter((ws) => ws.readyState === 1);
  }
  emit(event, data, userId, except) {
    const packet = JSON.stringify({ event, data });
    for (const ws of this.sockets(userId)) {
      if (ws !== except) {
        try {
          ws.send(packet);
        } catch {}
      }
    }
  }
  onlineUsers() {
    const users = new Map();
    for (const ws of this.sockets()) {
      const data = ws.deserializeAttachment();
      if (data && data.expiresAt > Date.now())
        users.set(data.userId, {
          userId: data.userId,
          username: data.username,
        });
    }
    return [...users.values()];
  }
  presence() {
    this.emit("online_users", this.onlineUsers());
  }
  closeSession(sessionId) {
    for (const ws of this.ctx.getWebSockets(`session:${sessionId}`)) {
      try {
        ws.close(1008, "Session ended. Please sign in again.");
      } catch {}
    }
    this.presence();
  }
  checkOrigin(request) {
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw fail("Origin not allowed.", 403);
  }
  async fetch(request) {
    await this.ready;
    try {
      this.checkOrigin(request);
      const path = new URL(request.url).pathname;
      const method = request.method;
      if (path === "/api/health" && method === "GET")
        return json({
          status: "ok",
          message: "Server is running",
          hosting: "cloudflare",
        });
      if (path === "/api/auth/register" && method === "POST")
        return await this.register(request);
      if (path === "/api/auth/login" && method === "POST")
        return await this.login(request);
      if (path === "/api/auth/logout" && method === "POST") {
        const user = await this.session(request);
        if (user) {
          this.sql.exec("DELETE FROM sessions WHERE token = ?", user.sessionId);
          this.closeSession(user.sessionId);
        }
        return json({ message: "Signed out" }, 200, {
          "Set-Cookie": cookie(request, "", 0),
        });
      }
      const user = await this.session(request);
      if (!user)
        throw fail("Your session has expired. Please sign in again.", 401);
      if (path === "/ws" && method === "GET")
        return this.connect(request, user);
      if (path === "/api/auth/me" && method === "GET")
        return json(publicUser(user));
      if (path === "/api/auth/users" && method === "GET")
        return json(
          this.rows(
            "SELECT id,username,public_key FROM users WHERE id != ? ORDER BY username COLLATE NOCASE",
            user.id,
          ),
        );
      if (path === "/api/auth/online" && method === "GET")
        return json(this.onlineUsers());
      if (path === "/api/auth/public-key" && method === "PUT")
        return await this.publicKey(request, user);
      if (path === "/api/auth/password" && method === "PUT")
        return await this.changePassword(request, user);
      if (path === "/api/messages/unread" && method === "GET") {
        const bySender = this.rows(
          "SELECT sender_id AS userId, COUNT(*) AS count FROM messages WHERE receiver_id = ? AND read_status = 0 AND timestamp >= ? GROUP BY sender_id",
          user.id,
          new Date(Date.now() - DAY).toISOString(),
        );
        return json({
          count: bySender.reduce((sum, row) => sum + row.count, 0),
          bySender,
        });
      }
      const conversation = path.match(/^\/api\/messages\/conversation\/(\d+)$/);
      if (conversation && method === "GET") {
        const otherId = Number(conversation[1]);
        if (!positiveId(otherId)) throw fail("Invalid user.");
        const limit = Math.min(
          200,
          Math.max(
            1,
            Number.parseInt(new URL(request.url).searchParams.get("limit")) ||
              100,
          ),
        );
        const list = this.rows(
          `SELECT *, sender_id AS senderId, receiver_id AS receiverId FROM messages
          WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND timestamp >= ?
          ORDER BY id DESC LIMIT ?`,
          user.id,
          otherId,
          otherId,
          user.id,
          new Date(Date.now() - DAY).toISOString(),
          limit,
        );
        return json(list.reverse());
      }
      const read = path.match(/^\/api\/messages\/(\d+)\/read$/);
      if (read && method === "PUT") {
        const message = this.one(
          "SELECT * FROM messages WHERE id = ? AND receiver_id = ?",
          Number(read[1]),
          user.id,
        );
        if (!message) throw fail("Message not found.", 404);
        if (!message.read_status) {
          this.sql.exec(
            "UPDATE messages SET read_status = 1, delivered = 1 WHERE id = ?",
            message.id,
          );
          this.emit("message_read", { id: message.id }, message.sender_id);
          this.emit("unread_changed", {}, user.id);
        }
        return json({ message: "Message marked as read" });
      }
      throw fail("Route not found.", 404);
    } catch (error) {
      if (!error.status) console.error("Chat request failed:", error.message);
      return json(
        {
          error: error.status
            ? error.message
            : "Unable to process this request. Please try again.",
        },
        error.status || 500,
      );
    }
  }
  async register(request) {
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    this.limit(`register:${ip}`, 3, 3600000);
    const body = await readBody(request);
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(username))
      throw fail(
        "Username must be 3–30 letters, numbers, hyphens, or underscores.",
      );
    if (email.length > 255 || !validator.isEmail(email))
      throw fail("Enter a valid email address.");
    if (!validPassword(body.password))
      throw fail(
        "Use 8 or more characters with uppercase, lowercase, and a number (maximum 72 bytes).",
      );
    if (
      this.one(
        "SELECT id FROM users WHERE username = ? OR email = ?",
        username,
        email,
      )
    )
      throw fail("Username or email already exists.");
    const passwordHash = await bcrypt.hash(body.password, 12);
    const session = await this.sessionMaterial();
    let user;
    try {
      this.ctx.storage.transactionSync(() => {
        user = this.one(
          "INSERT INTO users (username,email,password_hash,created_at) VALUES (?,?,?,?) RETURNING *",
          username,
          email,
          passwordHash,
          new Date().toISOString(),
        );
        this.insertSession(user.id, session);
      });
    } catch (error) {
      if (error.message.includes("UNIQUE"))
        throw fail("Username or email already exists.");
      throw error;
    }
    this.emit("users_changed", {});
    return json(
      { message: "User created successfully", user: publicUser(user) },
      201,
      { "Set-Cookie": cookie(request, session.token) },
    );
  }
  async login(request) {
    const key = `login:${request.headers.get("CF-Connecting-IP") || "local"}`;
    this.limit(key, 5, 900000);
    const { username, password } = await readBody(request);
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !password ||
      encoder.encode(password).length > 72
    )
      throw fail("Username and password are required.");
    const user = this.one(
      "SELECT * FROM users WHERE username = ?",
      username.trim(),
    );
    if (!user) {
      await bcrypt.hash(password, 12);
      throw fail("Invalid credentials.", 401);
    }
    if (!(await bcrypt.compare(password, user.password_hash)))
      throw fail("Invalid credentials.", 401);
    const session = await this.sessionMaterial();
    // An overlapping password change must not revive an old session.
    if (
      this.one("SELECT password_hash FROM users WHERE id = ?", user.id)
        ?.password_hash !== user.password_hash
    )
      throw fail("Please sign in again.", 401);
    this.insertSession(user.id, session);
    this.sql.exec(
      "UPDATE rate_limits SET count = MAX(0, count - 1) WHERE key = ?",
      key,
    );
    return json({ message: "Login successful", user: publicUser(user) }, 200, {
      "Set-Cookie": cookie(request, session.token),
    });
  }
  async publicKey(request, user) {
    const { publicKey } = await readBody(request);
    if (
      !publicKey ||
      publicKey.kty !== "EC" ||
      publicKey.crv !== "P-256" ||
      publicKey.d ||
      typeof publicKey.x !== "string" ||
      typeof publicKey.y !== "string"
    )
      throw fail("Invalid public key.");
    try {
      await crypto.subtle.importKey(
        "jwk",
        publicKey,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
      );
    } catch {
      throw fail("Invalid public key.");
    }
    const normalized = JSON.stringify({
      kty: "EC",
      crv: "P-256",
      x: publicKey.x,
      y: publicKey.y,
    });
    this.sql.exec(
      "UPDATE users SET public_key = ? WHERE id = ? AND public_key IS NULL",
      normalized,
      user.id,
    );
    if (
      this.one("SELECT public_key FROM users WHERE id = ?", user.id)
        .public_key !== normalized
    )
      throw fail(
        "Use the browser where you first enabled messaging. Your private key is stored there.",
        409,
      );
    if (!user.public_key) this.emit("users_changed", {});
    return json({ message: "Public key registered" });
  }
  async changePassword(request, user) {
    this.limit(`password:${user.id}`, 5, 900000);
    const { currentPassword, newPassword } = await readBody(request);
    if (
      typeof currentPassword !== "string" ||
      encoder.encode(currentPassword).length > 72 ||
      !validPassword(newPassword)
    )
      throw fail(
        "Use 8 or more characters with uppercase, lowercase, and a number (maximum 72 bytes).",
      );
    if (!(await bcrypt.compare(currentPassword, user.password_hash)))
      throw fail("Current password is incorrect.");
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const session = await this.sessionMaterial();
    this.ctx.storage.transactionSync(() => {
      const updated = this.one(
        "UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ? RETURNING id",
        passwordHash,
        user.id,
        user.password_hash,
      );
      if (!updated)
        throw fail(
          "Your password changed in another session. Please sign in again.",
          409,
        );
      this.sql.exec("DELETE FROM sessions WHERE user_id = ?", user.id);
      this.insertSession(user.id, session);
    });
    for (const ws of this.sockets(user.id)) {
      try {
        ws.close(1008, "Password changed. Reconnect with your new session.");
      } catch {}
    }
    this.presence();
    return json(
      { message: "Password updated. Other sessions have been signed out." },
      200,
      { "Set-Cookie": cookie(request, session.token) },
    );
  }
  connect(request, user) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      throw fail("A WebSocket connection is required.", 426);
    if (this.sockets(user.id).length >= 8)
      throw fail("Too many open chat tabs. Close a tab and try again.", 429);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [
      `user:${user.id}`,
      `session:${user.sessionId}`,
    ]);
    server.serializeAttachment({
      userId: user.id,
      username: user.username,
      sessionId: user.sessionId,
      expiresAt: user.expiresAt,
      window: Date.now(),
      count: 0,
    });
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    let id;
    const reply = (data) => {
      if (id) ws.send(JSON.stringify({ ack: id, data }));
    };
    try {
      if (typeof raw !== "string" || encoder.encode(raw).length > MAX_BODY) {
        ws.close(1009, "Message is too large.");
        return;
      }
      const meta = ws.deserializeAttachment();
      const user = meta && this.sessionByHash(meta.sessionId);
      if (!user) {
        ws.close(1008, "Your session ended.");
        return;
      }
      if (meta.window < Date.now() - 10000) {
        meta.window = Date.now();
        meta.count = 0;
      }
      meta.count++;
      ws.serializeAttachment(meta);
      if (meta.count > 120) {
        ws.close(4008, "Too many events.");
        return;
      }
      const packet = JSON.parse(raw);
      if (
        !packet ||
        typeof packet !== "object" ||
        typeof packet.event !== "string"
      )
        throw fail("Invalid event.");
      id =
        typeof packet.id === "string" && packet.id.length <= 64
          ? packet.id
          : undefined;
      const data = packet.data;
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw fail("Invalid message data.");
      if (packet.event === "send_message") {
        this.limit(`message:${user.id}`, 20, 10000);
        const { receiverId, encryptedContent, iv } = data;
        if (
          !positiveId(receiverId) ||
          receiverId === user.id ||
          typeof encryptedContent !== "string" ||
          !/^v2:[A-Za-z0-9+/=]+$/.test(encryptedContent) ||
          encryptedContent.length > 30000 ||
          typeof iv !== "string" ||
          !/^[A-Za-z0-9+/]{16}$/.test(iv)
        )
          throw fail("Invalid message data.");
        const receiver = this.one(
          "SELECT id, public_key FROM users WHERE id = ?",
          receiverId,
        );
        if (!user.public_key || !receiver?.public_key)
          throw fail("Both people must enable messaging first.");
        const delivered = this.sockets(receiverId).length > 0;
        const saved = this.one(
          "INSERT INTO messages (sender_id,receiver_id,encrypted_content,iv,timestamp,delivered) VALUES (?,?,?,?,?,?) RETURNING *",
          user.id,
          receiverId,
          encryptedContent,
          iv,
          new Date().toISOString(),
          Number(delivered),
        );
        const message = {
          id: saved.id,
          senderId: user.id,
          receiverId,
          encryptedContent,
          iv,
          timestamp: saved.timestamp,
          delivered,
        };
        reply({ success: true, message });
        this.emit("receive_message", message, receiverId);
        this.emit("receive_message", message, user.id, ws);
      } else if (packet.event === "typing" || packet.event === "stop_typing") {
        if (positiveId(data.receiverId))
          this.emit(
            packet.event === "typing" ? "user_typing" : "user_stopped_typing",
            { userId: user.id },
            data.receiverId,
          );
      } else if (packet.event === "message_delivered") {
        if (!positiveId(data.id)) return;
        const message = this.one(
          "UPDATE messages SET delivered = 1 WHERE id = ? AND receiver_id = ? RETURNING sender_id",
          data.id,
          user.id,
        );
        if (message)
          this.emit("message_delivered", { id: data.id }, message.sender_id);
      } else throw fail("Unknown event.");
    } catch (error) {
      reply({
        error: error.status
          ? error.message
          : "Could not send. Your draft has been kept.",
      });
    }
  }
  webSocketClose() {
    this.presence();
  }
  webSocketError(ws) {
    try {
      ws.close(1011, "Connection interrupted.");
    } catch {}
    this.presence();
  }
  async alarm() {
    const now = Date.now();
    this.sql.exec(
      "DELETE FROM messages WHERE timestamp < ?",
      new Date(now - DAY).toISOString(),
    );
    this.sql.exec("DELETE FROM sessions WHERE expires_at <= ?", now);
    this.sql.exec("DELETE FROM rate_limits WHERE expires_at <= ?", now);
    for (const ws of this.sockets()) {
      const meta = ws.deserializeAttachment();
      if (!meta || !this.sessionByHash(meta.sessionId)) {
        try {
          ws.close(1008, "Your session ended.");
        } catch {}
      }
    }
    this.presence();
    const nextExpiry = this.one(
      "SELECT MIN(expires_at) AS next FROM sessions",
    )?.next;
    await this.ctx.storage.setAlarm(
      Math.min(now + 3600000, nextExpiry || Infinity),
    );
  }
}
