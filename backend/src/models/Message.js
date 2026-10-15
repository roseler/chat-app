const db = require("../utils/database");

class Message {
  static async create(senderId, receiverId, encryptedContent, iv) {
    const result = await db.run(
      "INSERT INTO messages (sender_id, receiver_id, encrypted_content, iv, timestamp) VALUES (?, ?, ?, ?, ?)",
      [senderId, receiverId, encryptedContent, iv, new Date().toISOString()],
    );
    return result.id;
  }

  static async markAsRead(messageId, userId) {
    await db.run(
      "UPDATE messages SET read_status = 1 WHERE id = ? AND receiver_id = ?",
      [messageId, userId],
    );
  }

  static async getUnreadBySender(userId) {
    const ownerId = (await require("../utils/chatPolicy").ownerId()) || -1;
    return db.query(
      "SELECT sender_id AS userId, COUNT(*) AS count FROM messages WHERE receiver_id = ? AND read_status = 0 AND datetime(timestamp) >= datetime(?) AND (? = ? OR sender_id = ?) GROUP BY sender_id",
      [
        userId,
        new Date(Date.now() - 86400000).toISOString(),
        userId,
        ownerId,
        ownerId,
      ],
    );
  }

  static async getUnreadCount(userId) {
    return (await this.getUnreadBySender(userId)).reduce(
      (sum, row) => sum + row.count,
      0,
    );
  }

  // Delete messages older than 24 hours
  static async deleteOldMessages(hoursOld = 24) {
    const hoursAgo = new Date(
      Date.now() - hoursOld * 60 * 60 * 1000,
    ).toISOString();
    const result = await db.run(
      "DELETE FROM messages WHERE datetime(timestamp) < datetime(?)",
      [hoursAgo],
    );
    return result.changes; // Number of deleted messages
  }

  // Get conversation with 24-hour filter
  static async getConversation(userId1, userId2, limit = 50) {
    // Only get messages from the last 24 hours
    const hoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    return await db.query(
      `SELECT m.*, m.sender_id AS senderId, m.receiver_id AS receiverId,
              s.username as sender_username,
              r.username as receiver_username
       FROM messages m
       JOIN users s ON m.sender_id = s.id
       JOIN users r ON m.receiver_id = r.id
       WHERE ((m.sender_id = ? AND m.receiver_id = ?)
          OR (m.sender_id = ? AND m.receiver_id = ?))
       AND datetime(m.timestamp) >= datetime(?)
       ORDER BY datetime(m.timestamp) DESC, m.id DESC
       LIMIT ?`,
      [userId1, userId2, userId2, userId1, hoursAgo, limit],
    );
  }
}

module.exports = Message;
