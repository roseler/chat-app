const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  });
};

// Track online users
const onlineUsers = new Map(); // userId -> { username, socketId, lastSeen }

const setupSocketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`User connected: ${socket.username}`);
    }

    // Track user as online
    onlineUsers.set(socket.userId, {
      username: socket.username,
      socketId: socket.id,
      lastSeen: new Date().toISOString()
    });

    // Notify all clients that user is online
    io.emit('user_online', {
      userId: socket.userId,
      username: socket.username
    });

    // Send current online users to newly connected user
    const onlineUsersList = Array.from(onlineUsers.entries()).map(([userId, data]) => ({
      userId: parseInt(userId),
      username: data.username
    }));
    socket.emit('online_users', onlineUsersList);

    // Join user's personal room
    const userRoom = `user_${socket.userId}`;
    socket.join(userRoom);

    // Handle sending messages
    socket.on('send_message', async (data, callback) => {
      try {
        const { receiverId, encryptedContent, iv } = data;

        if (!receiverId || !encryptedContent || !iv) {
          const error = { error: 'Invalid message data' };
          if (callback) callback(error);
          socket.emit('error', error);
          return;
        }

        // Save message to database
        const messageId = await Message.create(
          socket.userId,
          receiverId,
          encryptedContent,
          iv
        );

        // Get sender info
        const sender = await User.findById(socket.userId);
        if (!sender) {
          throw new Error('Sender not found');
        }

        // Prepare message data (ensure IDs are numbers)
        const messageData = {
          id: messageId,
          senderId: parseInt(socket.userId),
          senderUsername: sender.username,
          receiverId: parseInt(receiverId),
          encryptedContent,
          iv,
          timestamp: new Date().toISOString()
        };

        // Emit to receiver's room
        const receiverRoom = `user_${receiverId}`;
        
        // Check if receiver is connected
        const roomSockets = await io.in(receiverRoom).fetchSockets();
        if (roomSockets.length === 0 && process.env.NODE_ENV === 'development') {
          console.warn('Receiver may not be connected');
        }
        
        io.to(receiverRoom).emit('receive_message', messageData);

        // Also emit to sender if they're in the same chat (for confirmation)
        socket.emit('message_sent', {
          id: messageId,
          message: 'Message sent successfully'
        });

        // Callback confirmation
        if (callback) {
          callback({ success: true, messageId });
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Send message error:', error);
        }
        const errorResponse = { error: 'Failed to send message' };
        if (callback) callback(errorResponse);
        socket.emit('error', errorResponse);
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      const { receiverId } = data;
      if (receiverId) {
        socket.to(`user_${receiverId}`).emit('user_typing', {
          userId: socket.userId,
          username: socket.username
        });
      }
    });

    socket.on('stop_typing', (data) => {
      const { receiverId } = data;
      if (receiverId) {
        socket.to(`user_${receiverId}`).emit('user_stopped_typing', {
          userId: socket.userId
        });
      }
    });

    socket.on('disconnect', () => {
      // Remove user from online list
      onlineUsers.delete(socket.userId);
      
      // Notify all clients that user is offline
      io.emit('user_offline', {
        userId: socket.userId
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`User disconnected: ${socket.username}`);
      }
    });
  });
};

// Get online users (for API endpoint)
const getOnlineUsers = () => {
  return Array.from(onlineUsers.entries()).map(([userId, data]) => ({
    userId: parseInt(userId),
    username: data.username
  }));
};

module.exports = { setupSocketHandlers, getOnlineUsers };

