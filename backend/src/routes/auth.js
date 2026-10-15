const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const validator = require("validator");
const User = require("../models/User");
const policy = require("../utils/chatPolicy");
const db = require("../utils/database");
const { validBackup } = require("../../../shared/key-backup.cjs");
const {
  generateToken,
  authenticateToken,
  logout,
} = require("../middleware/auth");

// Rate limiting
const loginLimiter = rateLimit({
  keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: "Too many login attempts. Please try again in 15 minutes.",
  },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour
  message: { error: "Too many registrations. Please try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation helpers
const validateEmail = (email) => {
  return validator.isEmail(email) && validator.isLength(email, { max: 255 });
};

const validateUsername = (username) => {
  return (
    validator.isAlphanumeric(username.replace(/[_-]/g, "")) &&
    validator.isLength(username, { min: 3, max: 30 })
  );
};

const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72)
    return false;
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return hasMinLength && hasUpperCase && hasLowerCase && hasNumber;
};

const sanitizeInput = (input) => {
  if (typeof input !== "string") return "";
  return validator.trim(input);
};

// Register
router.post("/register", registerLimiter, async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username ||
      !email ||
      !password
    ) {
      return res
        .status(400)
        .json({ error: "Username, email, and password are required" });
    }

    // Sanitize inputs
    username = sanitizeInput(username);
    email = sanitizeInput(email).toLowerCase();

    // Validate username
    if (!validateUsername(username)) {
      return res.status(400).json({
        error:
          "Username must be 3-30 characters and contain only letters, numbers, hyphens, and underscores",
      });
    }

    // Validate email
    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    if (policy.isReserved(username, email))
      return res
        .status(400)
        .json({ error: "That username or email is reserved." });

    // Validate password strength
    if (!validatePassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters with uppercase, lowercase, and a number",
      });
    }

    // Check if username exists
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Check if email exists
    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const userId = await User.create(username, email, password);
    await generateToken(userId, username, res);

    res.status(201).json({
      message: "User created successfully",
      user: await policy.role({ id: userId, username, email }),
    });
  } catch (error) {
    // Provide more specific error messages
    if (error.message && error.message.includes("UNIQUE constraint")) {
      return res
        .status(400)
        .json({ error: "Username or email already exists" });
    }

    if (process.env.NODE_ENV === "development") {
      console.error("Registration error:", error);
    }

    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    let { username, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    // Sanitize username
    username = sanitizeInput(username);

    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await User.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await generateToken(user.id, user.username, res);

    res.json({
      message: "Login successful",
      user: await policy.role({
        id: user.id,
        username: user.username,
        email: user.email,
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Login error:", error);
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user
router.get(
  "/me",
  require("../middleware/auth").authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(await policy.role(user));
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Get user error:", error);
      }
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get("/messaging-key", authenticateToken, async (req, res, next) => {
  try {
    const saved = await db.get(
      "SELECT u.public_key,k.backup,k.version FROM users u LEFT JOIN account_keys k ON k.user_id=u.id WHERE u.id = ?",
      [req.user.userId],
    );
    res.json({
      backup: saved?.backup ? JSON.parse(saved.backup) : null,
      version: saved?.version || 0,
      publicKey: saved?.public_key ? JSON.parse(saved.public_key) : null,
    });
  } catch (error) {
    next(error);
  }
});
router.put(
  "/messaging-key",
  authenticateToken,
  loginLimiter,
  async (req, res, next) => {
    try {
      const { password, publicKey, backup, replaceLegacy } = req.body;
      if (
        typeof password !== "string" ||
        Buffer.byteLength(password) > 72 ||
        !validBackup(backup)
      )
        return res.status(400).json({ error: "Invalid messaging key backup." });
      const user = await User.findByUsername(req.user.username);
      if (!(await User.verifyPassword(password, user.password_hash)))
        return res
          .status(400)
          .json({ error: "Current password is incorrect." });
      if (
        !publicKey ||
        publicKey.kty !== "EC" ||
        publicKey.crv !== "P-256" ||
        publicKey.d
      )
        return res.status(400).json({ error: "Invalid public key." });
      try {
        require("crypto").createPublicKey({ key: publicKey, format: "jwk" });
      } catch {
        return res.status(400).json({ error: "Invalid public key." });
      }
      const normalized = JSON.stringify({
        kty: "EC",
        crv: "P-256",
        x: publicKey.x,
        y: publicKey.y,
      });
      await db.transaction(async () => {
        const current = await User.findByUsername(req.user.username);
        const fail = (error) => {
          throw Object.assign(new Error(error), { status: 409 });
        };
        if (current.password_hash !== user.password_hash)
          fail("Your password changed. Please sign in again.");
        if (
          await db.get("SELECT user_id FROM account_keys WHERE user_id = ?", [
            user.id,
          ])
        )
          fail("Account messaging is already enabled. Sign in to unlock it.");
        if (current.public_key && replaceLegacy !== true)
          fail("Confirm the switch from browser messaging first.");
        await db.run(
          "INSERT INTO account_keys (user_id,backup,version) VALUES (?,?,1)",
          [user.id, JSON.stringify(backup)],
        );
        await db.run("UPDATE users SET public_key = ? WHERE id = ?", [
          normalized,
          user.id,
        ]);
      });
      const ownerId = await policy.ownerId();
      if (user.id === ownerId) req.app.get("io").emit("users_changed");
      else if (ownerId)
        req.app.get("io").to(`user_${ownerId}`).emit("users_changed");
      res.json({
        message: "Messaging is now linked to your account.",
        version: 1,
      });
    } catch (error) {
      if (error.status)
        return res.status(error.status).json({ error: error.message });
      next(error);
    }
  },
);

// Update public key
router.put(
  "/public-key",
  require("../middleware/auth").authenticateToken,
  async (req, res) => {
    try {
      const { publicKey } = req.body;
      if (
        !publicKey ||
        publicKey.kty !== "EC" ||
        publicKey.crv !== "P-256" ||
        publicKey.d ||
        typeof publicKey.x !== "string" ||
        typeof publicKey.y !== "string"
      ) {
        return res.status(400).json({ error: "Invalid public key" });
      }
      try {
        require("crypto").createPublicKey({ key: publicKey, format: "jwk" });
      } catch {
        return res.status(400).json({ error: "Invalid public key" });
      }
      const normalized = JSON.stringify({
        kty: "EC",
        crv: "P-256",
        x: publicKey.x,
        y: publicKey.y,
      });
      await User.updatePublicKey(req.user.userId, normalized);
      const user = await User.findById(req.user.userId);
      if (user.public_key !== normalized)
        return res.status(409).json({
          error:
            "Refresh the app and unlock messaging with your account password.",
        });
      res.json({ message: "Public key updated successfully" });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Update public key error:", error);
      }
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Get all users (for chat list)
router.get(
  "/users",
  require("../middleware/auth").authenticateToken,
  async (req, res) => {
    try {
      const users = await User.getAllUsers(req.user.userId);
      res.json(users);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Get users error:", error);
      }
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Get online users
router.get(
  "/online",
  require("../middleware/auth").authenticateToken,
  async (req, res) => {
    try {
      const { getOnlineUsers } = require("../socket/handlers");
      const onlineUsers = await getOnlineUsers(req.user.userId);
      // Return empty array if no online users (instead of error)
      res.json(onlineUsers || []);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Get online users error:", error);
      }
      // Return empty array instead of error to prevent frontend from hanging
      res.json([]);
    }
  },
);

router.post("/logout", async (req, res, next) => {
  try {
    await logout(req, res);
    res.json({ message: "Signed out" });
  } catch (error) {
    next(error);
  }
});
router.put(
  "/password",
  authenticateToken,
  loginLimiter,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword, keyBackup, keyVersion } = req.body;
      if (typeof currentPassword !== "string" || !validatePassword(newPassword))
        return res.status(400).json({
          error:
            "Use 8 or more characters with uppercase, lowercase, and a number (maximum 72 bytes).",
        });
      const user = await User.findByUsername(req.user.username);
      if (!(await User.verifyPassword(currentPassword, user.password_hash)))
        return res
          .status(400)
          .json({ error: "Current password is incorrect." });
      const accountKey = await db.get(
        "SELECT backup,version FROM account_keys WHERE user_id = ?",
        [user.id],
      );
      if (
        accountKey &&
        (!validBackup(keyBackup) || keyVersion !== accountKey.version)
      )
        return res.status(409).json({
          error: "Unlock account messaging before changing your password.",
        });
      const hash = await require("bcrypt").hash(newPassword, 12);
      await db.transaction(async () => {
        const updated = await db.run(
          "UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?",
          [hash, user.id, user.password_hash],
        );
        if (!updated.changes)
          throw Object.assign(
            new Error("Password changed. Please sign in again."),
            { status: 409 },
          );
        const currentKey = await db.get(
          "SELECT backup FROM account_keys WHERE user_id = ?",
          [user.id],
        );
        if (currentKey?.backup !== accountKey?.backup)
          throw Object.assign(
            new Error("Messaging settings changed. Please try again."),
            { status: 409 },
          );
        if (accountKey)
          await db.run("UPDATE account_keys SET backup = ? WHERE user_id = ?", [
            JSON.stringify(keyBackup),
            user.id,
          ]);
        await db.run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
        await generateToken(user.id, user.username, res);
      });
      req.app.get("io").in(`user_${req.user.userId}`).disconnectSockets(true);
      res.json({
        message: "Password updated. Other sessions have been signed out.",
      });
    } catch (error) {
      next(error);
    }
  },
);
module.exports = router;
