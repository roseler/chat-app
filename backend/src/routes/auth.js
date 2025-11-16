const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if username exists
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email exists
    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const userId = await User.create(username, email, password);
    const token = generateToken(userId, username);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: userId, username, email }
    });
  } catch (error) {
    // Provide more specific error messages
    if (error.message && error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('Registration error:', error);
    }
    
    res.status(500).json({ 
      error: 'Internal server error'
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await User.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.username);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Login error:', error);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Get user error:', error);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update public key
router.put('/public-key', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const { publicKey } = req.body;
    await User.updatePublicKey(req.user.userId, publicKey);
    res.json({ message: 'Public key updated successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Update public key error:', error);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (for chat list)
router.get('/users', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const users = await User.getAllUsers(req.user.userId);
    res.json(users);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Get users error:', error);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

