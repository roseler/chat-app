const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./utils/database');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const { setupSocketHandlers } = require('./socket/handlers');
const Message = require('./models/Message');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Setup Socket.io
setupSocketHandlers(io);

// Cleanup old messages (runs periodically)
async function cleanupOldMessages() {
  try {
    const deletedCount = await Message.deleteOldMessages(24);
    if (deletedCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`Cleaned up ${deletedCount} message(s) older than 24 hours`);
    }
  } catch (error) {
    console.error('Error cleaning up old messages');
  }
}

// Initialize database and start server
async function startServer() {
  try {
    await db.connect();
    
    // Clean up old messages on server start
    await cleanupOldMessages();
    
    // Set up periodic cleanup (every hour)
    setInterval(cleanupOldMessages, 60 * 60 * 1000); // 1 hour in milliseconds
    
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Message retention: 24 hours (cleanup runs every hour)`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down server...');
  await db.close();
  process.exit(0);
});

