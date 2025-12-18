const ChatService = require('../services/chat.service'); // Import ChatService
const Report = require('../models/report.model');
const { Chat, User } = require('../models');
const reportService = require('../services/report.service');
const { uploadFileToS3 } = require('../middlewares/upload');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const DailyLimits = require('../models/dailyLimits.model');

// AWS SDK v3 setup for downloading
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getChatHistory = async (req, res) => {
  const { userId } = req.params; // ID of the other user in the chat
  const { currentUserId } = req.query; // ID of the current logged-in user

  try {
    const chat = await ChatService.getChatHistory(currentUserId, userId); // Use ChatService

    if (!chat) {
      return res.status(404).json({ success: false, message: 'No chat history found' });
    }

    res.status(200).json({ success: true, data: chat });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const blockUser = async (req, res) => {
  const userId = req.user && req.user.id; // get from token (blocker)
  const { userId: blockedUserId } = req.body; // user to be blocked sent from client

  try {
    if (!userId || !blockedUserId) {
      return res.status(400).json({ success: false, message: 'userId (from token) and userId (to be blocked) must be filled.' });
    }
    if (userId === blockedUserId) {
      return res.status(400).json({ success: false, message: 'Cannot block yourself.' });
    }
    // Add blockedUserId to blockedUsers array of userId if it does not exist
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (user.blockedUsers.includes(blockedUserId)) {
      return res.status(400).json({ success: false, message: 'User already blocked.' });
    }
    user.blockedUsers.push(blockedUserId);
    await user.save();
    res.status(200).send({ success: true, message: 'User blocked successfully.' });
  } catch (error) {
    res.status(500).send({ success: false, message: 'Failed to block user.', error: error.message });
  }
};

const reportUser = async (req, res) => {
  const { userId, reason, details } = req.body;
  const reporterId = (req.user && req.user.id) || req.body.reporterId; // pelapor

  try {
    if (!userId || !reporterId) {
      return res.status(400).json({ success: false, message: 'userId (yang dilaporkan) dan reporterId (pelapor) wajib diisi.' });
    }

    // Check daily report limit using simple count approach
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      // Count reports made by this user today
      const existingReports = await reportService.countReports({
        userId: reporterId,
        createdAt: {
          $gte: todayStart,
          $lte: todayEnd
        }
      });
      
      if (existingReports >= 5) {
        return res.status(429).json({ 
          success: false, 
          message: `Daily report limit reached. You can report ${5 - existingReports} more users today.`,
          limitReached: true,
          remaining: Math.max(0, 5 - existingReports)
        });
      }
    } catch (limitError) {
      console.error('Error checking report limits:', limitError);
      // If limit checking fails, still allow reporting
    }

    // Cek apakah sudah pernah direport oleh pelapor yang sama
    const alreadyReported = await reportService.findReport({ userId: reporterId, type: 'user', reportedId: userId });
    if (alreadyReported) {
      return res.status(400).json({ success: false, message: 'You have already reported this user.' });
    }

    await reportService.createReport({
      userId: reporterId,
      type: 'user',
      reportedId: userId,
      reportedUserId: userId,
      reason: reason || '',
      description: details || '',
    });

    res.status(200).send({ success: true, message: 'User reported successfully.' });
  } catch (error) {
    res.status(500).send({ success: false, message: 'Failed to report user.', error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const { role } = req.params;
    const { id } = req.user
    if (!id) res.status(200).json({ success: false, message: "Nor User id found for chats" });
    const users = await ChatService.getUsers(role, id); // Use ChatService to get users
    console.log(users, 'users in chat controller');
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }


};
const sendMessage = async (req, res) => {
  let { recipientId } = req.params;
  let { message, attachments } = req.body;
  let { senderId } = req.query; // Assuming `authenticate` middleware sets req.user
  try {

    if (!message && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: "Message or attachments are required" });
    }

    const newMessage = await ChatService.saveMessage(
      senderId,
      recipientId,
      message,
      null,
      attachments
    );
    

    return res.status(201).json(newMessage);
  } catch (error) {
    
    console.error("Error sending message:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

const deleteChatForUser = async (req, res) => {
  const userId = req.user && req.user.id;
  const { chatId } = req.params;
  console.log('deleteChatForUser called with userId:', userId, 'and chatId:', chatId);
  try {
    if (!userId || !chatId) {
      return res.status(400).json({ success: false, message: 'userId (from token) and chatId must be provided.' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found.' });
    }
    // If user has already deleted, no need to do it again
    if (chat.deletedBy && chat.deletedBy.includes(userId)) {
      return res.status(200).json({ success: true, message: 'Chat already deleted for this user.' });
    }
    // Remove the chat permanently
    await Chat.deleteOne({ _id: chatId });
    res.status(200).json({ success: true, message: 'Chat permanently deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete chat permanently.', error: error.message });
  }
};

const unblockUser = async (req, res) => {
  const userId = req.user && req.user.id; // get from token (unblocker)
  const { userId: unblockUserId } = req.body; // user to be unblocked sent from client

  try {
    if (!userId || !unblockUserId) {
      return res.status(400).json({ success: false, message: 'userId (from token) and userId (to be unblocked) must be filled.' });
    }
    if (userId === unblockUserId) {
      return res.status(400).json({ success: false, message: 'Cannot unblock yourself.' });
    }
    // Remove unblockUserId from blockedUsers array of userId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const index = user.blockedUsers.indexOf(unblockUserId);
    if (index === -1) {
      return res.status(400).json({ success: false, message: 'User is not blocked.' });
    }
    user.blockedUsers.splice(index, 1);
    await user.save();
    res.status(200).send({ success: true, message: 'User unblocked successfully.' });
  } catch (error) {
    res.status(500).send({ success: false, message: 'Failed to unblock user.', error: error.message });
  }
};

const inquireNewChat = async (req, res) => {
  const senderId = req.user && req.user.id;
  const { recipientId } = req.params;
  const { message } = req.body;
  if (!senderId || !recipientId) {
    return res.status(400).json({ success: false, message: 'senderId (from token) and recipientId are required.' });
  }
  try {
    // Sort participants to ensure uniqueness
    const sortedParticipants = [senderId, recipientId].sort();
    let chat = await Chat.findOne({ participants: { $all: sortedParticipants } });
    
    if (!chat) {
      // Check daily chat creation limit using simple count approach
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        
        // Count chats created by this user today
        const existingChats = await Chat.countDocuments({
          participants: senderId,
          createdAt: {
            $gte: todayStart,
            $lte: todayEnd
          }
        });
        
        if (existingChats >= 20) {
          return res.status(429).json({ 
            success: false, 
            message: `Daily chat creation limit reached. You can create ${20 - existingChats} more chats today.`,
            limitReached: true,
            remaining: Math.max(0, 20 - existingChats)
          });
        }
      } catch (limitError) {
        console.error('Error checking chat creation limits:', limitError);
        // If limit checking fails, still allow chat creation
      }
      
      // Buat chat baru dengan pesan pertama dan label inquire = true
      chat = new Chat({
        participants: sortedParticipants,
        inquiry: true, // Set label inquire
        isRead: [senderId],
        messages: [{
          sender: senderId,
          text: message || '',
          isCard: false,
          createdAt: new Date(),
          inquire: true, // label khusus
        }],
      });
      await chat.save();
      
      return res.status(201).json({ success: true, data: chat, message: 'Chat created with inquire label.' });
    } else {
      // Jika chat sudah ada, tambahkan message baru dengan label inquire
      chat.messages.push({
        sender: senderId,
        text: message || '',
        isCard: false,
        createdAt: new Date(),
      });
      await chat.save();
      return res.status(200).json({ success: true, data: chat, message: 'Message added to existing chat.' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create or find chat.', error: error.message });
  }
};

const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Upload file to S3
    const uploadResult = await uploadFileToS3(req.file, userId);

    // Calculate expiration date (2 months from now)
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 2);

    const attachmentData = {
      filename: uploadResult.key,
      originalName: req.file.originalname,
      url: uploadResult.url,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date(),
      expiresAt: expirationDate
    };

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: attachmentData
    });
  } catch (error) {
    console.error('Error uploading chat attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
};

const downloadAttachment = async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.user && req.user.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!filename) {
      return res.status(400).json({ success: false, message: 'Filename is required' });
    }

    // Find the attachment in chat messages to verify access and get original name
    const chat = await Chat.findOne({
      participants: userId,
      'messages.attachments.filename': filename
    });

    if (!chat) {
      return res.status(404).json({ success: false, message: 'File not found or access denied' });
    }

    // Find the specific attachment
    let attachment = null;
    for (const message of chat.messages) {
      if (message.attachments) {
        attachment = message.attachments.find(att => att.filename === filename);
        if (attachment) break;
      }
    }

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    // Check if attachment has expired
    if (attachment.expiresAt && attachment.expiresAt < new Date()) {
      return res.status(410).json({ success: false, message: 'File has expired and is no longer available' });
    }

    // Get file from S3 and stream it
    const getObjectParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: filename,
    };

    try {
      const command = new GetObjectCommand(getObjectParams);
      const s3Response = await s3.send(command);

      // Set headers for forced download
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
      res.setHeader('Content-Type', attachment.mimetype || 'application/octet-stream');
      res.setHeader('Content-Length', attachment.size || s3Response.ContentLength);
      res.setHeader('Cache-Control', 'no-cache');

      // Stream the file content
      if (s3Response.Body) {
        s3Response.Body.pipe(res);
      } else {
        return res.status(404).json({ success: false, message: 'File content not found' });
      }

    } catch (s3Error) {
      console.error('S3 download error:', s3Error);
      return res.status(404).json({ success: false, message: 'File not found in storage' });
    }

  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download file',
      error: error.message
    });
  }
};

module.exports = {
  getChatHistory,
  blockUser,
  reportUser,
  getUsers,
  sendMessage,
  unblockUser,
  deleteChatForUser,
  inquireNewChat,
  uploadAttachment,
  downloadAttachment,
};
