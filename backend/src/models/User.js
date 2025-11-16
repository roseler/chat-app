const db = require('../utils/database');
const bcrypt = require('bcrypt');

class User {
  static async create(username, email, password) {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );
    return result.id;
  }

  static async findByUsername(username) {
    return await db.get('SELECT * FROM users WHERE username = ?', [username]);
  }

  static async findByEmail(email) {
    return await db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  static async findById(id) {
    return await db.get('SELECT id, username, email, public_key, created_at FROM users WHERE id = ?', [id]);
  }

  static async updatePublicKey(userId, publicKey) {
    await db.run('UPDATE users SET public_key = ? WHERE id = ?', [publicKey, userId]);
  }

  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  static async getAllUsers(excludeUserId) {
    return await db.query(
      'SELECT id, username, email, public_key FROM users WHERE id != ?',
      [excludeUserId]
    );
  }
}

module.exports = User;

