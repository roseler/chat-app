const crypto = require("crypto");
const db = require("../utils/database");
const cookieName = "chat_session";
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 86400000,
};
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const getToken = (headers) => {
  const value = (headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`));
  return value ? value.slice(cookieName.length + 1) : "";
};
async function sessionUser(headers) {
  const token = getToken(headers);
  if (!token) return null;
  return db.get(
    `SELECT u.id AS userId, u.username, s.token AS sessionId, s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?`,
    [hash(token), new Date().toISOString()],
  );
}
async function authenticateToken(req, res, next) {
  try {
    const user = await sessionUser(req.headers);
    if (!user)
      return res
        .status(401)
        .json({ error: "Your session has expired. Please sign in again." });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
async function generateToken(userId, username, res) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.run(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
    [
      userId,
      hash(token),
      new Date(Date.now() + cookieOptions.maxAge).toISOString(),
    ],
  );
  res.cookie(cookieName, token, cookieOptions);
}
async function logout(req, res) {
  const token = getToken(req.headers);
  if (token)
    await db.run("DELETE FROM sessions WHERE token = ?", [hash(token)]);
  if (token) {
    const io = req.app.get("io");
    for (const socket of io.sockets.sockets.values()) {
      if (socket.sessionId === hash(token)) socket.disconnect(true);
    }
  }
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(cookieName, clearOptions);
}
module.exports = { authenticateToken, generateToken, sessionUser, logout };
