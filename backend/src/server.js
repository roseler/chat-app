const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const db = require("./utils/database");
const authRoutes = require("./routes/auth");
const messageRoutes = require("./routes/messages");
const { setupSocketHandlers } = require("./socket/handlers");
const Message = require("./models/Message");
const { isTrustedProxy, requireProxy } = require("./middleware/proxy");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 40000,
  allowRequest: (req, callback) =>
    callback(
      null,
      isTrustedProxy(req.headers) &&
        (!req.headers.origin ||
          req.headers.origin ===
            (process.env.FRONTEND_URL || "http://localhost:3000")),
    ),
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);
app.disable("x-powered-by");
// Render terminates HTTPS at its reverse proxy.
if (process.env.RENDER === "true") app.set("trust proxy", 1);

const PORT = process.env.PORT || 3001;

// Middleware
app.use(requireProxy);
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "40kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== (process.env.FRONTEND_URL || "http://localhost:3000")
  )
    return res.status(403).json({ error: "Origin not allowed" });
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.use((err, req, res, next) => {
  res
    .status(
      err.status === 413 ? 413 : err.type === "entity.parse.failed" ? 400 : 500,
    )
    .json({ error: "Unable to process this request." });
});

// Setup Socket.io
setupSocketHandlers(io);

// Cleanup old messages (runs periodically)
async function cleanupOldMessages() {
  try {
    const deletedCount = await Message.deleteOldMessages(24);
    await db.run("DELETE FROM sessions WHERE expires_at <= ?", [
      new Date().toISOString(),
    ]);
    if (deletedCount > 0 && process.env.NODE_ENV === "development") {
      console.log(`Cleaned up ${deletedCount} message(s) older than 24 hours`);
    }
  } catch (error) {
    console.error("Error cleaning up old messages");
  }
}

// Initialize database and start server
async function startServer() {
  try {
    await db.connect();

    // Clean up old messages on server start
    await cleanupOldMessages();

    // Set up periodic cleanup (every hour)
    setInterval(cleanupOldMessages, 60 * 60 * 1000); // 1 hour in milliseconds

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      if (process.env.NODE_ENV === "development") {
        console.log(`Message retention: 24 hours (cleanup runs every hour)`);
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  io.close();
  server.close();
  try {
    await db.close();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
