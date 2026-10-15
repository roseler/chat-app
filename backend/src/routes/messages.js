const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const { allowed } = require("../utils/chatPolicy");
const { authenticateToken } = require("../middleware/auth");

// Get conversation between two users
router.get("/conversation/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const otherUserId = parseInt(req.params.userId);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
    if (!Number.isSafeInteger(otherUserId) || otherUserId < 1)
      return res.status(400).json({ error: "Invalid user" });

    if (!(await allowed(currentUserId, otherUserId)))
      return res.status(403).json({ error: "You can only chat with roseler." });
    const messages = await Message.getConversation(
      currentUserId,
      otherUserId,
      limit,
    );
    res.json(messages.reverse()); // Reverse to show oldest first
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Get conversation error:", error);
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get unread count
router.get("/unread", authenticateToken, async (req, res) => {
  try {
    const count = await Message.getUnreadCount(req.user.userId);
    const bySender = await Message.getUnreadBySender(req.user.userId);
    res.json({ count, bySender });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Get unread count error:", error);
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark message as read
router.put("/:messageId/read", authenticateToken, async (req, res) => {
  try {
    const db = require("../utils/database");
    const message = await db.get(
      "SELECT * FROM messages WHERE id = ? AND receiver_id = ?",
      [req.params.messageId, req.user.userId],
    );
    if (!message || !(await allowed(req.user.userId, message.sender_id)))
      return res.status(404).json({ error: "Message not found" });
    await Message.markAsRead(message.id, req.user.userId);
    req.app
      .get("io")
      .to(`user_${message.sender_id}`)
      .emit("message_read", { id: message.id });
    req.app.get("io").to(`user_${req.user.userId}`).emit("unread_changed");
    res.json({ message: "Message marked as read" });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Mark as read error:", error);
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
