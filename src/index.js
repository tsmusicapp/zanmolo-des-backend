const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const ChatService = require('./services/chat.service'); // New service for chat logic
const { initializeCronJobs } = require('./utils/cronJobs'); // Initialize cron jobs

let server;
global.__databaseMongo;

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Configured allowed origins
    methods: ['GET', 'POST','PUT', 'DELETE','PATCH'], 
  },
});
mongoose.set('useFindAndModify', false); // Disable deprecated findAndModify warnings

// Establish MongoDB connection
mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  logger.info('Connected to MongoDB');
  __databaseMongo = mongoose.connection.db;

  // Initialize cron jobs
  initializeCronJobs();

  // Start HTTP server
  server = httpServer.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
  });
});

// Active users map (consider replacing with Redis for scalability)
const activeUsers = new Map();

// Socket.IO configuration
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user joining
  socket.on('join', async ({ userId }, callback = () => {}) => {
    try {
      if (!userId) {
        return callback({ success: false, message: 'User ID is required' });
      }

      activeUsers.set(userId, socket.id);
      console.log(`User ${userId} joined with socket ID ${socket.id}`);
      callback({ success: true });
    } catch (error) {
      logger.error('Error in join event:', error);
      callback({ success: false, message: 'Error joining chat' });
    }
  });

  // Handle sending messages
  socket.on('sendMessage', async ({ senderId, recipientId, message }, callback = () => {}) => {
    try {
      if (!message.trim()) {
        return callback({ success: false, message: 'Message cannot be empty' });
      }

      const chat = await ChatService.saveMessage(senderId, recipientId, message);

      // Emit the message to the recipient if online
      const recipientSocketId = activeUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receiveMessage', { senderId, message });
      }

      callback({ success: true, chat });
    } catch (error) {
      logger.error('Error sending message:', error);
      callback({ success: false, message: 'Error sending message' });
    }
  });

  // Handle blocking user
  socket.on('blockUser', async ({ userId, blockedUserId }, callback = () => {}) => {
    try {
      await ChatService.blockUser(userId, blockedUserId);
      const blockedSocketId = activeUsers.get(blockedUserId);

      if (blockedSocketId) {
        io.to(blockedSocketId).emit('userBlocked', {
          message: `You have been blocked by User ${userId}`,
        });
      }

      callback({ success: true, message: `User ${blockedUserId} has been blocked.` });
    } catch (error) {
      logger.error('Error blocking user:', error);
      callback({ success: false, message: 'Error blocking user' });
    }
  });

  // Handle reporting user
  socket.on('reportUser', async ({ userId, reportedUserId }, callback = () => {}) => {
    try {
      await ChatService.reportUser(userId, reportedUserId);
      callback({ success: true, message: `User ${reportedUserId} has been reported.` });
    } catch (error) {
      logger.error('Error reporting user:', error);
      callback({ success: false, message: 'Error reporting user' });
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ senderId, recipientId }) => {
    const recipientSocketId = activeUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('userTyping', { senderId });
    }
  });

  // Handle read receipt
  socket.on('markAsRead', async ({ userId, chatId }, callback = () => {}) => {
    try {
      await ChatService.markMessagesAsRead(chatId, userId);
      callback({ success: true });
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      callback({ success: false });
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        break;
      }
    }
  });
});
