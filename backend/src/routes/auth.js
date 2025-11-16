const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour
  message: 'Too many registration attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation helpers
const validateEmail = (email) => {
  return validator.isEmail(email) && validator.isLength(email, { max: 255 });
};

const validateUsername = (username) => {
  return validator.isAlphanumeric(username.replace(/[_-]/g, '')) && 
         validator.isLength(username, { min: 3, max: 30 });
};

const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  return hasMinLength && hasUpperCase && hasLowerCase && hasNumber;
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return validator.escape(validator.trim(input));
};

// Register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Sanitize inputs
    username = sanitizeInput(username);
    email = sanitizeInput(email).toLowerCase();

    // Validate username
    if (!validateUsername(username)) {
      return res.status(400).json({ 
        error: 'Username must be 3-30 characters and contain only letters, numbers, hyphens, and underscores' 
      });
    }

    // Validate email
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Validate password strength
    if (!validatePassword(password)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters with uppercase, lowercase, and a number' 
      });
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
router.post('/login', loginLimiter, async (req, res) => {
  try {
    let { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Sanitize username
    username = sanitizeInput(username);

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

// Get online users
router.get('/online', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const { getOnlineUsers } = require('../socket/handlers');
    const onlineUsers = getOnlineUsers();
    // Return empty array if no online users (instead of error)
    res.json(onlineUsers || []);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Get online users error:', error);
    }
    // Return empty array instead of error to prevent frontend from hanging
    res.json([]);
  }
});

module.exports = router;

