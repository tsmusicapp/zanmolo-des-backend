const { AppliedJobs, Order } = require('../models');
const { Chat } = require('../models'); // Import the Chat model
const mongoose = require('mongoose');

/**
 * Chat Service: Handles chat-related business logic.
 */
const ChatService = {

  /**
 * Get chat history between two users.
 *
 * @param {string} currentUserId - ID of the logged-in user.
 * @param {string} userId - ID of the other user in the chat.
 * @returns {Promise<Object>} - Chat document containing messages.
 */
  async getChatHistory(currentUserId, userId) {
    try {
      // Ensure currentUserId and userId are ObjectId type
      const currentUserObjId = mongoose.Types.ObjectId.isValid(currentUserId) ? new mongoose.Types.ObjectId(currentUserId) : currentUserId;
      const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      // Update isRead array: set user who read
      const chat = await Chat.findOne({ participants: { $all: [currentUserObjId, userObjId] } });
      if (!chat) {
        return { message: 'Chat not found.' };
      }
      // Update isRead: must have 2 users (sender & receiver), status only for user who reads
      const userIds = [currentUserObjId.toString(), userObjId.toString()];
      chat.isRead = chat.isRead.filter(id => userIds.includes(id.toString()));
      if (!chat.isRead.find(id => id.toString() === currentUserObjId.toString())) {
        chat.isRead.push(currentUserObjId);
      }
      // Mark messages from other user as read
      chat.messages = chat.messages.map(msg => {
        if (msg.sender.toString() !== currentUserObjId.toString()) {
          if (msg.toObject) {
            msg = msg.toObject();
          }
          msg.readby = true;
        }
        return msg;
      });
      chat.markModified('messages');
      await chat.save();

      // Fetch orders related to this chat
      const orders = await Order.find({ chat_id: chat._id })
      if (orders) {
        return { chat, orders }
      }
      return chat;
    } catch (error) {
      console.error('Error fetching chat history:', error, error?.stack);
      throw new Error('Unable to fetch chat history.');
    }
  },


  // async getChatHistory(currentUserId, userId) {
  //   try {
  //     const chat = await Chat.findOne({
  //       participants: { $all: [currentUserId, userId] },
  //     }).select('messages');
  //     return chat;
  //   } catch (error) {
  //     console.error('Error fetching chat history:', error);
  //     throw new Error('Unable to fetch chat history.');
  //   }
  // },

  /**
   * Get chat by ID
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object>} - Chat document
   */
  async getChatById(chatId) {
    try {
      const chat = await Chat.findById(chatId);
      return chat;
    } catch (error) {
      console.error('Error fetching chat by ID:', error);
      throw error;
    }
  },

  /**
   * Save a message in the chat between two participants.
   * Creates a new chat if it doesn't exist.
   *
   * @param {string} senderId - ID of the sender.
   * @param {string} recipientId - ID of the recipient.
   * @param {string} message - Message text.
   * @returns {Promise<Object>} - Updated chat document.
   */
  async saveMessage(senderId, recipientId, message, cardData = null, attachments = []) {
    try {

      console.log(recipientId, senderId, "id inside here ");
      console.log('cardData received in saveMessage:', JSON.stringify(cardData, null, 2));
      
      // Convert sender and recipient IDs to ObjectId
      const senderObjectId = new mongoose.Types.ObjectId(senderId);
      const recipientObjectId = new mongoose.Types.ObjectId(recipientId);

      // const card = message.split("||")[1] == "OrderRequestCard"

      console.log(senderObjectId, recipientObjectId, "id inside here ");
      // Sort participants to ensure consistency
      const sortedParticipants = [senderObjectId, recipientObjectId].sort();
      console.log('Sorted Participants:', sortedParticipants);

      // Attempt to find the chat
      let chat = await Chat.findOne({ participants: { $all: sortedParticipants } });

      if (!chat) {
        console.log('No existing chat found, creating a new one.');
        // If no chat exists, create one
        const newMessage = {
          sender: senderObjectId,
          text: message,
          isCard: cardData ? true : false,
          createdAt: new Date(),
          cardData: cardData || null, // Ensure cardData is stored
          attachments: attachments || [],
        };
        
        console.log('Creating new chat with message:', JSON.stringify(newMessage, null, 2));
        
        chat = new Chat({
          participants: sortedParticipants,
          messages: [newMessage],
          isRead: [senderObjectId] // Sender is immediately considered as read
        });
      } else {
        // If chat exists, add the new message
        const newMessage = {
          sender: senderObjectId,
          text: message,
          isCard: cardData ? true : false,
          createdAt: new Date(),
          cardData: cardData || null, // Ensure cardData is stored
          attachments: attachments || [],
        };
        
        console.log('Adding new message:', JSON.stringify(newMessage, null, 2));
        chat.messages.push(newMessage);
        // Set isRead only contains sender user (who created this message), remove recipient id
        chat.isRead = chat.isRead.filter(id => id.toString() !== recipientObjectId.toString());
        if (!chat.isRead.find(id => id.toString() === senderObjectId.toString())) {
          chat.isRead.push(senderObjectId);
        }
        // Logic inquiry: inquiry remains true if sender is same as first message sender
        if (chat.messages.length > 1 && chat.inquiry !== false) {
          const firstSender = chat.messages[0].sender.toString();
          if (senderObjectId.toString() !== firstSender) {
            chat.inquiry = false;
          }
        }
      }

      // Save the chat (whether new or updated)
      chat.markModified('messages'); // Ensure Mongoose detects changes to the messages array
      await chat.save();
      
      console.log('Chat saved successfully. Last message:', JSON.stringify(chat.messages[chat.messages.length - 1], null, 2));

      return chat;
    } catch (error) {
      console.error('Error saving message:', error);
      throw new Error('Unable to save message.');
    }
  },


  /**
   * Block a user in a chat.
   *
   * @param {string} userId - ID of the user performing the block.
   * @param {string} blockedUserId - ID of the user to be blocked.
   * @returns {Promise<void>}
   */
  async blockUser(userId, blockedUserId) {
    try {
      await Chat.updateMany(
        { participants: { $all: [userId, blockedUserId] } },
        { $addToSet: { blockedBy: userId } } // Add the blocking user to the `blockedBy` array
      );
    } catch (error) {
      console.error('Error blocking user:', error);
      throw new Error('Unable to block user.');
    }
  },

  /**
   * Report a user in a chat.
   *
   * @param {string} userId - ID of the user reporting.
   * @param {string} reportedUserId - ID of the user being reported.
   * @returns {Promise<void>}
   */
  async reportUser(userId, reportedUserId) {
    try {
      await Chat.updateMany(
        { participants: { $all: [userId, reportedUserId] } },
        { $addToSet: { reportedBy: userId } } // Add the reporting user to the `reportedBy` array
      );
    } catch (error) {
      console.error('Error reporting user:', error);
      throw new Error('Unable to report user.');
    }
  },

  /**
   * Mark all messages as read in a chat for a user.
   *
   * @param {string} chatId - ID of the chat.
   * @param {string} userId - ID of the user marking messages as read.
   * @returns {Promise<void>}
   */
  async markMessagesAsRead(chatId, userId) {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        throw new Error('Chat not found.');
      }

      chat.messages.forEach((message) => {
        if (message.sender !== userId && !message.read) {
          message.read = true; // Mark the message as read
        }
      });

      await chat.save();
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw new Error('Unable to mark messages as read.');
    }
  },

  async getUsers(role, userId) {
    try {
      if (role === 'recruiter') {
        // Get users who have applied to recruiter
        const users = await AppliedJobs.aggregate([
          {
            $lookup: {
              from: 'users',
              localField: 'createdBy',
              foreignField: '_id',
              as: 'userDetails',
            },
          },
          { $unwind: '$userDetails' },
          {
            $project: {
              id: '$userDetails._id',
              name: '$userDetails.name',
              email: '$userDetails.email',
              avatar: '$userDetails.profilePicture',
            },
          },
        ]).exec();
        return users;
      } else {
        // Get all users who have chatted with userId, except those deleted by userId
        const chats = await Chat.find({
          participants: mongoose.Types.ObjectId(userId),
          deletedBy: { $ne: mongoose.Types.ObjectId(userId) }
        }).populate([
          {
            path: 'participants',
            select: 'name email',
          }
        ]);
        // Get other user from each chat
        const users = await Promise.all(chats.map(async chat => {
          const otherUser = chat.participants.find(u => u._id.toString() !== userId.toString());
          const lastMessage = chat.messages && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
          let avatar = null;
          let fullName = null;
          if (otherUser) {
            // Find userSpace based on createdBy = otherUser._id
            const userSpace = await mongoose.model('UserSpace').findOne({ createdBy: otherUser._id.toString() });
            if (userSpace) {
              avatar = userSpace.profilePicture;
              fullName = userSpace.firstName + ' ' + userSpace.lastName; // Assuming userSpace has firstName and lastName
            }
          }
          return {
            id: otherUser?._id,
            name: fullName ?? otherUser?.name,
            inquiry: chat.inquiry || false, // Assuming inquiry is a boolean field in the chat
            email: otherUser?.email,
            avatar: avatar ?? 'https://musicimagevideos.s3.ap-southeast-2.amazonaws.com/music/others/685faf70bfcdd925769fa07a/1751101939604-Screen%20Shot%202025-06-28%20at%2016.12.06.png',
            chatId: chat._id,
            lastMessage
          };
        }));
        return users.filter(u => u.id);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      throw new Error('Unable to fetch users.');
    }
  },

  /**
   * Delete order request messages with specific orderId from cardData to reduce clutter
   * Only deletes messages with type 'order_request', not acceptance/decline messages
   *
   * @param {string} orderId - Order ID to delete order request messages for
   * @returns {Promise<Object>} - Result of the deletion operation
   */
  async deleteOrderRequestMessagesByOrderId(orderId) {
    try {
      // Find all chats that have order request messages with the specific orderId in cardData
      const result = await Chat.updateMany(
        { 
          'messages.cardData.orderId': orderId,
          'messages.cardData.type': 'order_request'
        },
        { 
          $pull: { 
            messages: { 
              'cardData.orderId': orderId,
              'cardData.type': 'order_request'
            } 
          } 
        }
      );
      
      console.log(`Deleted ${result.modifiedCount} order request messages for orderId: ${orderId}`);
      return {
        success: true,
        modifiedCount: result.modifiedCount,
        message: `Deleted order request messages for orderId: ${orderId}`
      };
    } catch (error) {
      console.error('Error deleting order request messages by orderId:', error);
      throw new Error('Unable to delete order request messages by orderId.');
    }
  },

  // async sendMessage (params){
  //   try {
  //     const { senderId, recipientId, message } = params;
  //     const savedMessage = await ChatService.saveMessage(senderId, recipientId, message);
  //     res.status(201).json(savedMessage);
  //   } catch (error) {
  //     console.error('Error sending message:', error);
  //     res.status(500).json({ error: 'Unable to send message.' });
  //   }
  // }
};

module.exports = ChatService;
