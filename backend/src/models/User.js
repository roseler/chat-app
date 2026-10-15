const db = require("../utils/database");
const bcrypt = require("bcrypt");

class User {
  static async create(username, email, password) {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.run(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, passwordHash],
    );
    return result.id;
  }

  static async findByUsername(username) {
    return await db.get("SELECT * FROM users WHERE username = ?", [username]);
  }

  static async findByEmail(email) {
    return await db.get("SELECT * FROM users WHERE email = ?", [email]);
  }

  static async findById(id) {
    return await db.get(
      "SELECT id, username, email, public_key, created_at FROM users WHERE id = ?",
      [id],
    );
  }

  static async updatePublicKey(userId, publicKey) {
    await db.run(
      "UPDATE users SET public_key = ? WHERE id = ? AND public_key IS NULL",
      [publicKey, userId],
    );
  }

  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  static async getAllUsers(excludeUserId) {
    const ownerId = await require("../utils/chatPolicy").ownerId();
    return db.query(
      "SELECT u.id, u.username, u.public_key, COALESCE(k.version,0) AS key_version FROM users u LEFT JOIN account_keys k ON k.user_id=u.id WHERE u.id != ? AND (? = ? OR u.id = ?) ORDER BY u.username COLLATE NOCASE",
      [excludeUserId, excludeUserId, ownerId || -1, ownerId || -1],
    );
  }
}

module.exports = User;
