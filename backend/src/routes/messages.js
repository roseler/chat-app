const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');

// Get conversation between two users
router.get('/conversation/:userId', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const otherUserId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit) || 50;

    const messages = await Message.getConversation(currentUserId, otherUserId, limit);
    res.json(messages.reverse()); // Reverse to show oldest first
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Get conversation error:', error);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count
router.get('/unread', authenticateToken, async (req, res) => {
  try {
    const count = await Message.getUnreadCount(req.user.userId);
    res.json({ count });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Get unread count error:', error);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark message as read
router.put('/:messageId/read', authenticateToken, async (req, res) => {
  try {
    await Message.markAsRead(req.params.messageId, req.user.userId);
    res.json({ message: 'Message marked as read' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Mark as read error:', error);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

