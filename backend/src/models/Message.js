const db = require('../utils/database');

class Message {
  static async create(senderId, receiverId, encryptedContent, iv) {
    const result = await db.run(
      'INSERT INTO messages (sender_id, receiver_id, encrypted_content, iv) VALUES (?, ?, ?, ?)',
      [senderId, receiverId, encryptedContent, iv]
    );
    return result.id;
  }

  static async getConversation(userId1, userId2, limit = 50) {
    return await db.query(
      `SELECT m.*, 
              s.username as sender_username,
              r.username as receiver_username
       FROM messages m
       JOIN users s ON m.sender_id = s.id
       JOIN users r ON m.receiver_id = r.id
       WHERE (m.sender_id = ? AND m.receiver_id = ?) 
          OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.timestamp DESC
       LIMIT ?`,
      [userId1, userId2, userId2, userId1, limit]
    );
  }

  static async markAsRead(messageId, userId) {
    await db.run(
      'UPDATE messages SET read_status = 1 WHERE id = ? AND receiver_id = ?',
      [messageId, userId]
    );
  }

  static async getUnreadCount(userId) {
    // Only count unread messages from the last 24 hours
    const hoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await db.get(
      'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND read_status = 0 AND timestamp >= ?',
      [userId, hoursAgo]
    );
    return result ? result.count : 0;
  }

  // Delete messages older than 24 hours
  static async deleteOldMessages(hoursOld = 24) {
    const hoursAgo = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();
    const result = await db.run(
      'DELETE FROM messages WHERE timestamp < ?',
      [hoursAgo]
    );
    return result.changes; // Number of deleted messages
  }

  // Get conversation with 24-hour filter
  static async getConversation(userId1, userId2, limit = 50) {
    // Only get messages from the last 24 hours
    const hoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    return await db.query(
      `SELECT m.*, 
              s.username as sender_username,
              r.username as receiver_username
       FROM messages m
       JOIN users s ON m.sender_id = s.id
       JOIN users r ON m.receiver_id = r.id
       WHERE ((m.sender_id = ? AND m.receiver_id = ?) 
          OR (m.sender_id = ? AND m.receiver_id = ?))
       AND m.timestamp >= ?
       ORDER BY m.timestamp DESC
       LIMIT ?`,
      [userId1, userId2, userId2, userId1, hoursAgo, limit]
    );
  }
}

module.exports = Message;

